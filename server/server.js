const express = require("express");
const cors = require("cors");
const { execSync } = require("child_process");

const app = express();
app.use(cors());
app.use(express.json());

const DEFAULT_MODEL = "gemma3";

const { diffLines } = require("diff");

app.post("/api/fix", (req, res) => {
  const { text, model } = req.body;
  const usedModel = model || DEFAULT_MODEL;

  if (!text) return res.status(400).json({ error: "No text provided." });

  const prompt = `
Correct the grammar of the following text.
- Keep the original meaning and style.
- Do NOT include explanations, commentary, or extra text.
- Only output the corrected text.

Text:
${text}
`.trim();

  try {
    const corrected = execSync(`ollama run ${usedModel}`, {
      input: prompt,
      encoding: "utf-8",
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();

    const diff = diffLines(text, corrected); // generate diff

    res.json({ original: text, corrected, diff });
  } catch (err) {
    console.error(err);
    res.json({ original: text, corrected: "(error)", diff: [] });
  }
});

app.listen(3001, () =>
  console.log("✅ Server running on http://localhost:3001")
);
