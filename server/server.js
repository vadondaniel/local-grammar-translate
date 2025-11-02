const express = require("express");
const cors = require("cors");
const { spawn } = require("child_process");
const net = require("net");
const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "config.json");
const PROJECT_CONFIG_PATH = path.join(__dirname, "..", "project.config.json");

const PROJECT_DEFAULTS = {
  serverPort: 3001,
  clientPort: 5173,
  models: [
    { id: "gemma3", name: "Gemma 3 4B" },
    { id: "deepseek-v3.1:671b-cloud", name: "DeepSeek 671B (Cloud)" },
    { id: "gpt-oss:120b-cloud", name: "GPT-OSS 120B (Cloud)" },
    { id: "llama3.2", name: "Llama 3.2 3B" },
    { id: "llama2-uncensored", name: "Llama 2 7B" },
    { id: "deepseek-llm", name: "DeepSeek 7B" },
    { id: "mistral", name: "Mistral 7B" },
    { id: "thinkverse/towerinstruct:latest", name: "TowerInstruct 7B" },
  ],
};

function normalizeProjectConfig(raw) {
  const cfg = {
    serverPort: PROJECT_DEFAULTS.serverPort,
    clientPort: PROJECT_DEFAULTS.clientPort,
    models: PROJECT_DEFAULTS.models.map((m) => ({ ...m })),
  };

  if (raw && typeof raw === "object") {
    const rawServerPort = Number(raw.serverPort);
    if (Number.isInteger(rawServerPort) && rawServerPort > 0 && rawServerPort < 65536) {
      cfg.serverPort = rawServerPort;
    }

    const rawClientPort = Number(raw.clientPort);
    if (Number.isInteger(rawClientPort) && rawClientPort > 0 && rawClientPort < 65536) {
      cfg.clientPort = rawClientPort;
    }

    if (Array.isArray(raw.models)) {
      const seen = new Set();
      const sanitized = [];
      for (const entry of raw.models) {
        if (!entry || typeof entry !== "object") continue;
        const id = typeof entry.id === "string" ? entry.id.trim() : "";
        if (!id || seen.has(id)) continue;
        const name = typeof entry.name === "string" && entry.name.trim().length > 0 ? entry.name.trim() : id;
        sanitized.push({ id, name });
        seen.add(id);
      }
      if (sanitized.length > 0) {
        cfg.models = sanitized;
      }
    }
  }

  return cfg;
}

function loadProjectConfig() {
  let fileConfig = {};
  try {
    if (fs.existsSync(PROJECT_CONFIG_PATH)) {
      const txt = fs.readFileSync(PROJECT_CONFIG_PATH, "utf-8");
      fileConfig = JSON.parse(txt);
    }
  } catch {
    fileConfig = {};
  }

  const envOverrides = {};
  const envServerPort = process.env.SERVER_PORT || process.env.APP_SERVER_PORT || process.env.PORT;
  const envClientPort = process.env.CLIENT_PORT || process.env.APP_CLIENT_PORT;
  if (envServerPort != null) envOverrides.serverPort = Number(envServerPort);
  if (envClientPort != null) envOverrides.clientPort = Number(envClientPort);

  return normalizeProjectConfig({ ...fileConfig, ...envOverrides });
}

const PROJECT_CONFIG = loadProjectConfig();
const SERVER_PORT = PROJECT_CONFIG.serverPort;
const CLIENT_PORT = PROJECT_CONFIG.clientPort;
const MODEL_OPTIONS = PROJECT_CONFIG.models.map((m) => ({ ...m }));
const DEFAULT_MODEL = MODEL_OPTIONS[0]?.id || "gemma3";

const app = express();
app.use(cors());
app.use(express.json());

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

const TRANSLATOR_INPUT_LANGS = ["auto", "english", "hungarian", "japanese"];
const TRANSLATOR_OUTPUT_LANGS = ["english", "hungarian", "japanese"];
const TRANSLATOR_PUNCTUATION_STYLES = ["unchanged", "auto", "simple", "smart"];
const LANGUAGE_LABELS = {
  auto: "auto-detect",
  english: "English",
  hungarian: "Hungarian",
  japanese: "Japanese",
};

function normalizeTranslatorSource(val) {
  const code = String(val || "").toLowerCase();
  return TRANSLATOR_INPUT_LANGS.includes(code) ? code : "auto";
}

function normalizeTranslatorTarget(val) {
  const code = String(val || "").toLowerCase();
  return TRANSLATOR_OUTPUT_LANGS.includes(code) ? code : "english";
}

function normalizeTranslatorPunctuation(val) {
  const code = String(val || "").toLowerCase();
  return TRANSLATOR_PUNCTUATION_STYLES.includes(code) ? code : "unchanged";
}

function describeSourceLanguage(code) {
  if (code === "auto") return "Detect the source language automatically.";
  const label = LANGUAGE_LABELS[code] || code;
  return `The source language is ${label}.`;
}

function describeTargetLanguage(code) {
  const label = LANGUAGE_LABELS[code] || code;
  return `Translate into ${label}.`;
}

function describePunctuationPreference(code) {
  switch (code) {
    case "simple":
      return "Use simple ASCII punctuation in the translation (straight quotes, hyphen, three dots).";
    case "smart":
      return "Use typographic punctuation in the translation (proper quotation marks, dashes, ellipsis).";
    case "auto":
      return "Choose a consistent punctuation style that fits the translated text.";
    default:
      return "Preserve punctuation style from the source text wherever reasonable.";
  }
}

function normalizeChunkOptions(raw) {
  const out = { maxParagraphs: 1, maxChars: 0 };
  if (raw && typeof raw === "object") {
    const mp = Number(raw.maxParagraphs);
    if (Number.isFinite(mp) && mp > 0) {
      out.maxParagraphs = Math.max(1, Math.min(20, Math.floor(mp)));
    }
    const mc = Number(raw.maxChars);
    if (Number.isFinite(mc) && mc >= 0) {
      out.maxChars = Math.max(0, Math.min(20000, Math.floor(mc)));
    }
  }
  return out;
}

function chunkTranslationItems(items, opts) {
  const { maxParagraphs, maxChars } = opts;
  const charLimit = maxChars > 0 ? maxChars : Infinity;
  const limitParagraphs = Math.max(1, maxParagraphs || 1);
  const chunks = [];
  let current = [];
  let charCount = 0;

  for (const item of items) {
    const len = item.text.length;
    const exceedsParagraphs = current.length >= limitParagraphs;
    const exceedsChars = charLimit !== Infinity && current.length > 0 && charCount + len > charLimit;
    if ((exceedsParagraphs || exceedsChars) && current.length > 0) {
      chunks.push(current);
      current = [];
      charCount = 0;
    }
    current.push(item);
    charCount += len;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

function stripFence(text) {
  if (!text) return "";
  let out = text.trim();
  if (out.startsWith("```")) {
    const firstBreak = out.indexOf("\n");
    const lastFence = out.lastIndexOf("```");
    if (firstBreak !== -1 && lastFence !== -1 && lastFence > firstBreak) {
      out = out.slice(firstBreak + 1, lastFence).trim();
    }
  }
  return out;
}

function parseTranslationPayload(raw, fallbackOrder) {
  if (!raw) return [];
  const cleaned = stripFence(raw);
  let payload = null;
  try {
    payload = JSON.parse(cleaned);
  } catch {
    try {
      const firstBrace = cleaned.indexOf("{");
      const lastBrace = cleaned.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        payload = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
      }
    } catch {
      payload = null;
    }
  }

  if (payload && Array.isArray(payload.translations)) {
    const norm = [];
    for (const entry of payload.translations) {
      if (!entry) continue;
      const idx = Number(entry.index);
      if (!Number.isInteger(idx)) continue;
      const txt = typeof entry.text === "string" ? entry.text.trim() : "";
      norm.push({ index: idx, text: txt });
    }
    if (norm.length > 0) return norm;
  }

  // fallback: split by blank lines or newlines
  const parts = cleaned
    .split(/\n{2,}|\r?\n\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return fallbackOrder.map((idx, i) => ({
    index: idx,
    text: parts[i] || "",
  }));
}

function buildTranslationPrompt(chunk, sourceLang, targetLang, punctuationStyle) {
  if (!Array.isArray(chunk) || chunk.length === 0) return "";
  const headerLines = [
    "You are a professional translator.",
    describeSourceLanguage(sourceLang),
    describeTargetLanguage(targetLang),
    describePunctuationPreference(punctuationStyle),
    chunk.length > 1
      ? "Use the combined context of all paragraphs to keep terminology and tone consistent."
      : "Translate the paragraph accurately while keeping the original intent.",
  ];

  const requirements = `
Requirements:
- Return valid JSON with the structure {"translations":[{"index":<index>,"text":"..."}]}.
- Use the same numeric indices that are provided with each paragraph below.
- Provide only the JSON; do not add explanations, markdown, comments, or extra keys.
- Respect the punctuation guidance and keep it consistent throughout the translation.
- Preserve sentence boundaries and formatting where possible.
  `.trim();

  const paragraphsBlock = chunk
    .map((entry) => `[${entry.index}]: ${entry.text}`)
    .join("\n\n");

  return `${headerLines.join("\n")}\n\n${requirements}\n\nParagraphs:\n${paragraphsBlock}`.trim();
}

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
      windowsHide: true,
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
      windowsHide: true,
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
    return res.json({
      ok: true,
      config: normalizeConfig(CONFIG),
      project: {
        serverPort: SERVER_PORT,
        clientPort: CLIENT_PORT,
        defaultModel: DEFAULT_MODEL,
        models: MODEL_OPTIONS.map((m) => ({ ...m })),
      },
    });
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
    return res.json({
      ok: true,
      config: normalizeConfig(CONFIG),
      persisted: !!persist,
      project: {
        serverPort: SERVER_PORT,
        clientPort: CLIENT_PORT,
        defaultModel: DEFAULT_MODEL,
        models: MODEL_OPTIONS.map((m) => ({ ...m })),
      },
    });
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
      { tone: "neutral", strictness: "balanced", punctuationStyle: "unchanged", units: "unchanged", spellingVariant: "en-US" },
      typeof rawOptions === "object" && rawOptions ? rawOptions : {}
    );
    const allowedTones = new Set(["neutral", "formal", "friendly", "academic", "technical"]);
    const allowedStrict = new Set(["lenient", "balanced", "strict"]);
    const allowedPunct = new Set(["unchanged", "auto", "simple", "smart"]);
    const allowedUnits = new Set(["unchanged", "metric", "imperial", "auto"]);
    const allowedSpelling = new Set(["unchanged", "en-US", "en-GB"]);
    if (!allowedTones.has(String(opts.tone))) opts.tone = "neutral";
    if (!allowedStrict.has(String(opts.strictness))) opts.strictness = "balanced";
    if (!allowedPunct.has(String(opts.punctuationStyle))) opts.punctuationStyle = "unchanged";
    if (!allowedUnits.has(String(opts.units))) opts.units = "unchanged";
    if (!allowedSpelling.has(String(opts.spellingVariant))) opts.spellingVariant = "en-US";

    const strictGuide =
      opts.strictness === "strict"
        ? "Be strict: fix all grammar, style and clarity issues."
        : opts.strictness === "lenient"
          ? "Be lenient: fix only clear grammar errors."
          : "Be balanced: fix obvious grammar errors and light clarity issues.";

    const punctuationGuide =
      opts.punctuationStyle === "smart"
        ? "Use typographic punctuation appropriate to the text’s language (proper quotation marks(“„”’‘’), dashes(–—), and ellipsis(…))."
        : opts.punctuationStyle === "unchanged"
          ? "Preserve the original punctuation style; do not convert quotation marks or dashes."
          : opts.punctuationStyle === "auto"
            ? "Choose a consistent punctuation style appropriate to the text’s language."
            : "Use simple ASCII punctuation only (straight quotes, hyphen, three dots).";

    const toneGuide =
      opts.tone === "neutral"
        ? "Keep tone neutral."
        : `Target tone: ${opts.tone}.`;

    const spellingGuide =
      opts.spellingVariant === "unchanged"
        ? "Keep the original language and regional spelling conventions; do not change dialect and do not translate."
        : opts.spellingVariant === "en-US"
          ? "Keep the original language; do not translate. If the text is English, standardize spelling to American English (US) conventions; otherwise, do not alter regional spelling."
          : "Keep the original language; do not translate. If the text is English, standardize spelling to British English (UK) conventions; otherwise, do not alter regional spelling.";

    const unitsGuide =
      opts.units === "metric"
        ? "Convert measurement units to SI/metric, updating numbers and unit labels. Keep the original language and regional spelling; do not change dialect or translate."
        : opts.units === "imperial"
          ? "Convert measurement units to Imperial/US customary, updating numbers and unit labels. Keep the original language and regional spelling; do not change dialect or translate."
          : opts.units === "auto"
            ? "Use a consistent unit system based on context; avoid mixing systems. Keep the original language and regional spelling; do not change dialect or translate."
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
- ${spellingGuide}
- ${toneGuide}
- ${strictGuide}
- ${punctuationGuide}
- ${unitsGuide}
- If you see html elements, leave them as they are.
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

app.post("/api/translate-stream", async (req, res) => {
  const body = req.body || {};
  const text = typeof body.text === "string" ? body.text : "";
  const usedModel = body.model || DEFAULT_MODEL;

  if (!text.trim()) {
    return res.status(400).json({ error: "No text provided." });
  }

  const paragraphs = text.split(/\n\s*\n+/).filter(Boolean);
  const total = paragraphs.length;

  if (total === 0) {
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.end();
    return;
  }

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

  const rawOptions = body.options || {};
  const sourceLang = normalizeTranslatorSource(rawOptions.sourceLang);
  const targetLang = normalizeTranslatorTarget(rawOptions.targetLang);
  const punctuationStyle = normalizeTranslatorPunctuation(rawOptions.punctuationStyle);
  const chunkOpts = normalizeChunkOptions(rawOptions.chunking);

  const items = paragraphs.map((para, index) => ({
    index,
    text: para.trim(),
  }));
  const chunks = chunkTranslationItems(items, chunkOpts);

  const results = new Array(total);
  let nextChunk = 0;
  let nextToEmit = 0;
  let inFlight = 0;

  const emitReady = async () => {
    while (nextToEmit < total && results[nextToEmit]) {
      res.write(JSON.stringify(results[nextToEmit]) + "\n");
      res.flush?.();
      nextToEmit += 1;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 10));
    }
  };

  const launchNext = () => {
    while (inFlight < CONFIG.OLLAMA_CONCURRENCY && nextChunk < chunks.length) {
      const chunk = chunks[nextChunk++];
      if (!chunk || chunk.length === 0) continue;
      const indices = chunk.map((item) => item.index);
      const prompt = buildTranslationPrompt(chunk, sourceLang, targetLang, punctuationStyle);

      inFlight += 1;
      runOllama(usedModel, prompt)
        .then((output) => {
          const parsed = parseTranslationPayload(output, indices);
          const allowed = new Set(indices);
          const byIndex = new Map();
          for (const entry of parsed) {
            if (!entry || !allowed.has(entry.index)) continue;
            const clean = typeof entry.text === "string" ? entry.text.trim() : "";
            byIndex.set(entry.index, clean);
          }
          for (const idx of indices) {
            if (!results[idx]) {
              const textOut = byIndex.has(idx) ? byIndex.get(idx) : "";
              results[idx] = { index: idx, translated: textOut };
            }
          }
        })
        .catch(() => {
          for (const idx of indices) {
            if (!results[idx]) {
              results[idx] = { index: idx, translated: "(error)" };
            }
          }
        })
        .finally(async () => {
          inFlight -= 1;
          await emitReady();
          launchNext();
        });
    }
  };

  try {
    if (chunks.length === 0) {
      for (let i = 0; i < total; i += 1) {
        results[i] = { index: i, translated: "" };
      }
      await emitReady();
    } else {
      launchNext();
      await new Promise((resolve) => {
        const check = () => {
          if (nextToEmit >= total && inFlight === 0) return resolve();
          setTimeout(check, 50);
        };
        check();
      });
    }
  } catch (err) {
    console.error("Translation stream error:", err);
    res.write(JSON.stringify({ error: "stream_error" }) + "\n");
  } finally {
    res.end();
  }
});


app.listen(SERVER_PORT, () =>
  console.log(`✅ Server running on http://localhost:${SERVER_PORT}`)
);
