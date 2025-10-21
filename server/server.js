const express = require("express");
const cors = require("cors");
const { execSync } = require("child_process");
const net = require("net");

const app = express();
app.use(cors());
app.use(express.json());

const DEFAULT_MODEL = "gemma3";

// Quick TCP check to see if the Ollama daemon is reachable
function isOllamaReachable(host = "127.0.0.1", port = 11434, timeoutMs = 1000) {
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

app.post("/api/fix-stream", async (req, res) => {
  const { text, model } = req.body;
  const usedModel = model || DEFAULT_MODEL;
  if (!text) return res.status(400).json({ error: "No text provided." });

  const paragraphs = text.split(/\n\s*\n+/).filter(Boolean);

  // Fail fast if Ollama isn't up to avoid hanging
  const reachable = await isOllamaReachable();
  if (!reachable) {
    return res.status(503).json({
      error: "ollama_unavailable",
      message:
        "Ollama is not reachable on 127.0.0.1:11434. Please start Ollama (e.g., 'ollama serve') and try again.",
    });
  }

  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  try {
    for (let i = 0; i < paragraphs.length; i++) {
      const para = paragraphs[i].trim();
      if (!para) continue;

      const prompt = `
Correct the grammar of the following paragraph, if necessary.
- Keep the original meaning and style.
- Do NOT include explanations, commentary, or extra text.
- Only output the corrected text.

Paragraph:
${para}
`.trim();

      let corrected = "";
      try {
        corrected = execSync(`ollama run ${usedModel} --hidethinking`, {
          input: prompt,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
          // Prevent indefinite hangs in case of daemon or model issues
          timeout: 120000, // 120s per paragraph
        }).trim();
      } catch (err) {
        corrected = "(error)";
      }

      res.write(JSON.stringify({ index: i, original: para, corrected }) + "\n");
      if (res.flush) res.flush();

      // Give the TCP stream a short breather
      await new Promise((r) => setTimeout(r, 50));
    }
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
