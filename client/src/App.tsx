import { useState } from "react";
import "./App.css";
import InlineDiff from "./InlineDiff";

function App() {
  const [text, setText] = useState("");
  const [model, setModel] = useState("gemma3");

  const [isProcessing, setIsProcessing] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [totalParagraphs, setTotalParagraphs] = useState(0);

  // NEW: store paragraphs as they get corrected
  const [correctedParas, setCorrectedParas] = useState<string[]>([]);

  const handleSubmit = async () => {
    setIsProcessing(true);
    setCorrectedParas([]);
    setProgressPercent(0);
    setTotalParagraphs(0);

    const paragraphs = text.split(/\n\s*\n+/).filter(Boolean);
    const total = paragraphs.length; // use local total to avoid stale state / zero division
    setTotalParagraphs(total);

    try {
      const res = await fetch("http://localhost:3001/api/fix-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, model }),
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let processed = 0;
      let partials: string[] = new Array(total).fill("");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const obj = JSON.parse(line);
            if (obj.error) continue;

            const { index, corrected } = obj;
            const wasEmpty = !partials[index];
            partials[index] = corrected || "";

            if (wasEmpty && partials[index]) {
              processed += 1;
            }

            // update UI progressively
            setCorrectedParas([...partials]);

            if (total > 0) {
              setProgressPercent(Math.round((processed / total) * 100));
            } else {
              setProgressPercent((prev) => Math.min(99, prev + 10));
            }
          } catch (err) {
            console.error("Parse error:", err);
          }
        }
      }

      setProgressPercent(100);
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Added clear handler
  const handleClear = () => {
    // prevent clearing while processing to avoid confusing state
    if (isProcessing) return;
    setText("");
    setCorrectedParas([]);
    setProgressPercent(0);
    setTotalParagraphs(0);
  };

  var correctedText = correctedParas.filter(Boolean).join("\n\n");

  return (
    <div style={{ maxWidth: "1200px", margin: "2rem auto", textAlign: "left" }}>
      <h1 style={{ textAlign: "center" }}>Grammar Fixer (Ollama)</h1>

      <select
        value={model}
        onChange={(e) => setModel(e.target.value)}
        style={{ marginBottom: "1rem", width: "200px" }}
      >
        <option value="gemma3">Gemma 3 4B</option>
        <option value="deepseek-llm">DeepSeek 7B</option>
        <option value="deepseek-v3.1:671b-cloud">DeepSeek 3.1 671B (Cloud)</option>
        <option value="llama3.2">Llama 3.2 3B</option>
        <option value="mistral">Mistral 7B</option>
        <option value="phi4-mini">Phi 4 Mini 3.8B</option>
      </select>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste your text..."
        rows={15}
        style={{ width: "100%", padding: "1rem" }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button onClick={handleSubmit} disabled={isProcessing}>
          {isProcessing ? "Processing..." : "Fix Grammar"}
        </button>
        <button
          onClick={handleClear}
          disabled={isProcessing}
          style={{ marginLeft: 12 }}
          aria-label="Clear text and results"
        >
          Clear
        </button>
      </div>

      {isProcessing && (
        <div style={{ marginTop: "1rem" }}>
          Progress: {progressPercent}% ({correctedParas.filter(Boolean).length}/
          {totalParagraphs})
          <div
            style={{
              height: 8,
              background: "#eee",
              borderRadius: 4,
              marginTop: 4,
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progressPercent}%`,
                background: "#3b82f6",
                borderRadius: 4,
              }}
            />
          </div>
        </div>
      )}

      {correctedText && (
        <div style={{ marginTop: "2rem" }}>
          <h2>Diff View</h2>
          <InlineDiff
            oldValue={text}
            newValue={correctedText}
            leftTitle="Original"
            rightTitle="Corrected"
          />
        </div>
      )}
    </div>
  );
}

export default App;
