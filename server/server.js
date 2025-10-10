const express = require("express");
const cors = require("cors");
const { execSync } = require("child_process");

const app = express();
app.use(cors());
app.use(express.json());

const DEFAULT_MODEL = "gemma3";

app.post("/api/fix-stream", async (req, res) => {
  const { text, model } = req.body;
  const usedModel = model || DEFAULT_MODEL;
  if (!text) return res.status(400).json({ error: "No text provided." });

  const paragraphs = text.split(/\n\s*\n+/).filter(Boolean);

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
