const express = require("express");
const cors = require("cors");
const { spawn } = require("child_process");
const net = require("net");

const app = express();
app.use(cors());
app.use(express.json());

const DEFAULT_MODEL = "gemma3";
const OLLAMA_HOST = process.env.OLLAMA_HOST || "127.0.0.1";
const OLLAMA_PORT = Number(process.env.OLLAMA_PORT || 11434);
const OLLAMA_AUTOSTART = /^(1|true|yes)$/i.test(process.env.OLLAMA_AUTOSTART || "false");
const OLLAMA_START_TIMEOUT_MS = Number(process.env.OLLAMA_START_TIMEOUT_MS || 15000);
const OLLAMA_RUN_TIMEOUT_MS = Number(process.env.OLLAMA_RUN_TIMEOUT_MS || 120000); // per paragraph
const OLLAMA_CONCURRENCY = Math.max(1, Number(process.env.OLLAMA_CONCURRENCY || 2));

// Quick TCP check to see if the Ollama daemon is reachable
function isOllamaReachable(host = OLLAMA_HOST, port = OLLAMA_PORT, timeoutMs = 1000) {
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

async function waitForReachable(totalMs = OLLAMA_START_TIMEOUT_MS, intervalMs = 300) {
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
function startOllamaServe() {
  try {
    // If already started by us and still running, skip
    if (ollamaProc && !ollamaProc.killed) return ollamaProc;
    const child = spawn("ollama", ["serve"], {
      detached: true,
      stdio: "ignore",
      shell: false,
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
  if (!maybeStart && !OLLAMA_AUTOSTART) return { reachable: false, started: false };

  const child = startOllamaServe();
  if (!child) return { reachable: false, started: false };
  const ok = await waitForReachable();
  return { reachable: ok, started: true };
}

function runOllama(model, prompt, timeoutMs = OLLAMA_RUN_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const args = ["run", model, "--hidethinking"]; // output only final text
    const child = spawn("ollama", args, { stdio: ["pipe", "pipe", "pipe"], shell: false });

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
    if (reachable) return res.json({ ok: true, reachable: true, starting: !!started });
    return res.status(503).json({ ok: false, reachable: false, starting: !!started, message: "Ollama is not reachable." });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "health_error" });
  }
});

app.post("/api/fix-stream", async (req, res) => {
  const { text, model } = req.body;
  const usedModel = model || DEFAULT_MODEL;
  if (!text) return res.status(400).json({ error: "No text provided." });

  const paragraphs = text.split(/\n\s*\n+/).filter(Boolean);

  // Ensure Ollama is running (optionally autostart)
  const { reachable } = await ensureOllamaRunning(true);
  if (!reachable) {
    return res.status(503).json({
      error: "ollama_unavailable",
      message: `Ollama is not reachable on ${OLLAMA_HOST}:${OLLAMA_PORT}. Please start Ollama (e.g., 'ollama serve') and try again.`,
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
      while (inFlight < OLLAMA_CONCURRENCY && nextToStart < total) {
        const i = nextToStart++;
        const para = paragraphs[i].trim();
        const prompt = `
Correct the grammar of the following paragraph, if necessary.
- Keep the original meaning and style.
- Do NOT include explanations, commentary, or extra text.
- Only output the corrected text.

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
