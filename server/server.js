const express = require("express");
const cors = require("cors");
const { spawn } = require("child_process");
const net = require("net");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const DEFAULT_MODEL = "gemma3";
const CONFIG_PATH = path.join(__dirname, "config.json");

function parseBool(val, fallback = false) {
  if (typeof val === "boolean") return val;
  if (val == null) return fallback;
  return /^(1|true|yes|on)$/i.test(String(val));
}

function normalizeConfig(raw) {
  const out = {};
  out.OLLAMA_HOST = String((raw && raw.OLLAMA_HOST) || "127.0.0.1");
  out.OLLAMA_PORT = Number((raw && raw.OLLAMA_PORT) || 11434);
  out.OLLAMA_AUTOSTART = parseBool((raw && raw.OLLAMA_AUTOSTART) || false);
  out.OLLAMA_START_TIMEOUT_MS = Number((raw && raw.OLLAMA_START_TIMEOUT_MS) || 15000);
  out.OLLAMA_RUN_TIMEOUT_MS = Number((raw && raw.OLLAMA_RUN_TIMEOUT_MS) || 120000);
  out.OLLAMA_CONCURRENCY = Math.max(1, Number((raw && raw.OLLAMA_CONCURRENCY) || 2));
  return out;
}

const ENV_DEFAULTS = normalizeConfig({
  OLLAMA_HOST: process.env.OLLAMA_HOST,
  OLLAMA_PORT: process.env.OLLAMA_PORT,
  OLLAMA_AUTOSTART: process.env.OLLAMA_AUTOSTART,
  OLLAMA_START_TIMEOUT_MS: process.env.OLLAMA_START_TIMEOUT_MS,
  OLLAMA_RUN_TIMEOUT_MS: process.env.OLLAMA_RUN_TIMEOUT_MS,
  OLLAMA_CONCURRENCY: process.env.OLLAMA_CONCURRENCY,
});

let FILE_DEFAULTS = {};
try {
  if (fs.existsSync(CONFIG_PATH)) {
    const txt = fs.readFileSync(CONFIG_PATH, "utf-8");
    FILE_DEFAULTS = normalizeConfig(JSON.parse(txt));
  }
} catch {}

let CONFIG = normalizeConfig({ ...ENV_DEFAULTS, ...FILE_DEFAULTS });

// Quick TCP check to see if the Ollama daemon is reachable
function isOllamaReachable(host = CONFIG.OLLAMA_HOST, port = CONFIG.OLLAMA_PORT, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let finished = false;

    const finish = (ok) => {
      if (finished) return;
      finished = true;
      try { socket.destroy(); } catch {}
      resolve(ok);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    try {
      socket.connect(port, host);
    } catch {
      finish(false);
    }
  });
}

async function waitForReachable(totalMs = CONFIG.OLLAMA_START_TIMEOUT_MS, intervalMs = 300) {
  const start = Date.now();
  while (Date.now() - start < totalMs) {
    // eslint-disable-next-line no-await-in-loop
    if (await isOllamaReachable()) return true;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

let ollamaProc = null;
function isLocalHost(host) {
  const h = String(host).toLowerCase();
  return h === "127.0.0.1" || h === "localhost";
}

function startOllamaServe() {
  try {
    // If already started by us and still running, skip
    if (ollamaProc && !ollamaProc.killed) return ollamaProc;
    if (!isLocalHost(CONFIG.OLLAMA_HOST)) return null;
    const child = spawn("ollama", ["serve"], {
      detached: true,
      stdio: "ignore",
      shell: false,
      env: {
        ...process.env,
        OLLAMA_HOST: `${CONFIG.OLLAMA_HOST}:${CONFIG.OLLAMA_PORT}`,
      },
    });
    child.unref();
    ollamaProc = child;
    return child;
  } catch (e) {
    return null;
  }
}

async function ensureOllamaRunning(maybeStart = true) {
  const reachable = await isOllamaReachable();
  if (reachable) return { reachable: true, started: false };
  const shouldStart = maybeStart || CONFIG.OLLAMA_AUTOSTART;
  if (!shouldStart) return { reachable: false, started: false };

  const child = startOllamaServe();
  if (!child) return { reachable: false, started: false };
  const ok = await waitForReachable();
  return { reachable: ok, started: true };
}

function runOllama(model, prompt, timeoutMs = CONFIG.OLLAMA_RUN_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const args = ["run", model, "--hidethinking"]; // output only final text
    const child = spawn("ollama", args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      env: {
        ...process.env,
        OLLAMA_HOST: `${CONFIG.OLLAMA_HOST}:${CONFIG.OLLAMA_PORT}`,
      },
    });

    let out = "";
    let errBuf = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill(); } catch {}
    }, timeoutMs);

    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { errBuf += chunk; });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error("ollama_run_timeout"));
      if (code !== 0) return reject(new Error(errBuf || `ollama exited with ${code}`));
      resolve(out.trim());
    });

    try {
      child.stdin.write(prompt);
      child.stdin.end();
    } catch (e) {
      clearTimeout(timer);
      try { child.kill(); } catch {}
      reject(e);
    }
  });
}

app.get("/api/health", async (req, res) => {
  try {
    const autostartParam = String(req.query.start || "").toLowerCase();
    const maybeStart = autostartParam === "1" || autostartParam === "true" || autostartParam === "yes";
    const { reachable, started } = await ensureOllamaRunning(maybeStart);
    if (reachable) return res.json({ ok: true, reachable: true, starting: !!started, config: CONFIG });
    return res.status(503).json({ ok: false, reachable: false, starting: !!started, message: "Ollama is not reachable.", config: CONFIG });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "health_error" });
  }
});

app.get("/api/config", (req, res) => {
  try {
    return res.json({ ok: true, config: normalizeConfig(CONFIG) });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "config_read_error" });
  }
});

app.post("/api/config", (req, res) => {
  try {
    const body = req.body || {};
    const persist = parseBool(body.persist || false);
    const next = normalizeConfig({ ...CONFIG, ...body });
    CONFIG = next;
    if (persist) {
      try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(CONFIG, null, 2), "utf-8");
      } catch (e) {
        return res.status(500).json({ ok: false, error: "config_write_error" });
      }
    }
    return res.json({ ok: true, config: CONFIG, persisted: !!persist });
  } catch (e) {
    return res.status(400).json({ ok: false, error: "config_update_error" });
  }
});

app.post("/api/fix-stream", async (req, res) => {
  const { text, model, options: rawOptions } = req.body;
  const usedModel = model || DEFAULT_MODEL;
  if (!text) return res.status(400).json({ error: "No text provided." });

  const paragraphs = text.split(/\n\s*\n+/).filter(Boolean);

  // Ensure Ollama is running (optionally autostart)
  const { reachable } = await ensureOllamaRunning(true);
  if (!reachable) {
    return res.status(503).json({
      error: "ollama_unavailable",
      message: `Ollama is not reachable on ${CONFIG.OLLAMA_HOST}:${CONFIG.OLLAMA_PORT}. Please start Ollama (e.g., 'ollama serve') and try again.`,
    });
  }

  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  try {
    const total = paragraphs.length;
    let nextToStart = 0;
    let nextToEmit = 0;
    let inFlight = 0;
    const results = new Array(total);

    // Normalize options
    const opts = Object.assign(
      { tone: "neutral", strictness: "balanced", punctuationStyle: "simple", units: "unchanged" },
      typeof rawOptions === "object" && rawOptions ? rawOptions : {}
    );
    const allowedTones = new Set(["unchanged", "neutral", "formal", "friendly", "academic", "technical"]);
    const allowedStrict = new Set(["lenient", "balanced", "strict"]);
    const allowedPunct = new Set(["unchanged", "auto", "simple", "smart"]);
    const allowedUnits = new Set(["unchanged", "metric", "imperial", "auto"]);
    if (!allowedTones.has(String(opts.tone))) opts.tone = "neutral";
    if (!allowedStrict.has(String(opts.strictness))) opts.strictness = "balanced";
    if (!allowedPunct.has(String(opts.punctuationStyle))) opts.punctuationStyle = "simple";
    if (!allowedUnits.has(String(opts.units))) opts.units = "unchanged";

    const strictGuide =
      opts.strictness === "strict"
        ? "Be strict: fix all grammar, style and clarity issues."
        : opts.strictness === "lenient"
          ? "Be lenient: fix only clear grammar errors."
          : "Be balanced: fix obvious grammar errors and light clarity issues.";

    const punctuationGuide =
      opts.punctuationStyle === "smart"
        ? "Use typographic punctuation: smart quotes (“ ” ‘ ’), proper dashes (– —) and ellipsis (…)."
        : opts.punctuationStyle === "unchanged"
          ? "Preserve the original punctuation style; do not convert quotes or dashes."
          : opts.punctuationStyle === "auto"
            ? "Choose a consistent punctuation style; prefer typographic if the text warrants it."
            : "Use simple ASCII punctuation only: straight quotes (\" '), hyphen (-), three dots (...).";

    const toneGuide =
      opts.tone === "unchanged"
        ? "Do not alter the tone."
        : opts.tone === "neutral"
          ? "Keep tone neutral."
          : `Target tone: ${opts.tone}.`;

    const unitsGuide =
      opts.units === "metric"
        ? "Convert all measurement units to SI/metric (e.g., miles→kilometres, °F→°C, pounds→kilograms)."
        : opts.units === "imperial"
          ? "Convert all measurement units to Imperial/US customary (e.g., kilometres→miles, °C→°F, kilograms→pounds)."
          : opts.units === "auto"
            ? "Choose a consistent unit system based on context; avoid mixing systems."
            : "Preserve the original measurement units.";

    const emitReady = async () => {
      // Emit in order as far as we can
      while (nextToEmit < total && results[nextToEmit]) {
        const item = results[nextToEmit];
        res.write(JSON.stringify(item) + "\n");
        if (res.flush) res.flush();
        nextToEmit++;
        // Small breather for the stream
        await new Promise((r) => setTimeout(r, 10));
      }
    };

    const launchNext = () => {
      while (inFlight < CONFIG.OLLAMA_CONCURRENCY && nextToStart < total) {
        const i = nextToStart++;
        const para = paragraphs[i].trim();
        const prompt = `
You are a grammar correction assistant.
- Keep the original meaning and style.
- ${toneGuide}
- ${strictGuide}
- ${punctuationGuide}
- ${unitsGuide}
- Do NOT include explanations, commentary, quotes around the output, or extra text.
- Only output the corrected paragraph.

Paragraph:
${para}
`.trim();

        inFlight++;
        runOllama(usedModel, prompt)
          .then((corrected) => {
            results[i] = { index: i, original: para, corrected: corrected || "" };
          })
          .catch(() => {
            results[i] = { index: i, original: para, corrected: "(error)" };
          })
          .finally(async () => {
            inFlight--;
            await emitReady();
            launchNext();
          });
      }
    };

    launchNext();

    // Wait for all to be emitted
    await new Promise((resolve) => {
      const check = () => {
        if (nextToEmit >= total && inFlight === 0) return resolve();
        setTimeout(check, 50);
      };
      check();
    });
  } catch (err) {
    console.error("Streaming error:", err);
    res.write(JSON.stringify({ error: "stream_error" }) + "\n");
  } finally {
    res.end();
  }
});

app.listen(3001, () =>
  console.log("✅ Server running on http://localhost:3001")
);
