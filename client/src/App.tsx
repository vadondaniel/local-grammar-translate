import { useState } from "react";
import "./App.css";
import InlineDiff from "./InlineDiff";

function App() {
  const [text, setText] = useState("");
  const [correctedText, setCorrectedText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [model, setModel] = useState("gemma3");

  const handleSubmit = async () => {
    setIsProcessing(true);
    setCorrectedText("");

    try {
      const res = await fetch("http://localhost:3001/api/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, model }),
      });

      const data: { original: string; corrected: string } = await res.json();
      setCorrectedText(data.corrected);
    } catch (err) {
      console.error(err);
      setCorrectedText("(error)");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      id="root"
      style={{ textAlign: "left", maxWidth: "900px", margin: "2rem auto" }}
    >
      <h1 style={{ textAlign: "center" }}>Grammar Fixer (Ollama)</h1>

      <div className="card" style={{ width: "100%" }}>
        <div style={{ marginBottom: "1rem" }}>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            style={{ width: "200px" }}
          >
            <option value="gemma3">Gemma 3 4B</option>
            <option value="deepseek-r1">DeepSeek-R1 7B</option>
            <option value="llama3.2">Llama 3.2 3B</option>
            <option value="mistral">Mistral 7B</option>
            <option value="phi4-mini">Phi 4 Mini</option>
          </select>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste your chapter here..."
          rows={15}
          style={{
            width: "100%",
            minHeight: "300px",
            fontFamily: "inherit",
            fontSize: "1em",
            padding: "1rem",
          }}
        />

        <div style={{ marginTop: "1rem" }}>
          <button onClick={handleSubmit} disabled={isProcessing}>
            {isProcessing ? "Processing..." : "Fix Grammar"}
          </button>
        </div>

        {isProcessing && (
          <div style={{ marginTop: "1rem" }}>Processing...</div>
        )}
      </div>

      {correctedText && (
        <div style={{ marginTop: "2rem" }}>
          <h2>Differences</h2>
          <InlineDiff oldValue={text} newValue={correctedText} leftTitle="Original" rightTitle="Corrected" />
        </div>
      )}
    </div>
  );
}

export default App;
