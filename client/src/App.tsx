import { useEffect, useRef, useState } from "react";
import "./App.css";
import InlineDiff from "./InlineDiff";
import Settings from "./Settings.tsx";

function App() {
  const [text, setText] = useState("");
  const [model, setModel] = useState(() => {
    try {
      if (typeof window !== "undefined") {
        return localStorage.getItem("defaultModel") || "gemma3";
      }
    } catch {}
    return "gemma3";
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [serverReady, setServerReady] = useState(false);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);
  const [totalParagraphs, setTotalParagraphs] = useState(0);

  const [correctedParas, setCorrectedParas] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleSubmit = async () => {
    setIsProcessing(true);
    setCorrectedParas([]);
    setProgressPercent(0);
    setTotalParagraphs(0);

    const paragraphs = text.split(/\n\s*\n+/).filter(Boolean);
    const total = paragraphs.length;
    setTotalParagraphs(total);

    try {
      // Load grammar options from localStorage at submit time
      let tone = "neutral";
      let strictness = "balanced";
      let punctuationStyle = "unchanged";
      let units = "unchanged";
      let spellingVariant = "en-US";
      try {
        if (typeof window !== "undefined") {
          tone = localStorage.getItem("grammarTone") || tone;
          strictness = localStorage.getItem("grammarStrictness") || strictness;
          punctuationStyle = localStorage.getItem("punctuationStyle") || punctuationStyle;
          units = localStorage.getItem("unitsPreference") || units;
          spellingVariant = localStorage.getItem("spellingVariant") || spellingVariant;
        }
      } catch {}

      const res = await fetch("http://localhost:3001/api/fix-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, model, options: { tone, strictness, punctuationStyle, units, spellingVariant } }),
      });

      // Handle server errors (e.g., Ollama not running)
      if (!res.ok) {
        let message = "Server error";
        try {
          const data = await res.json();
          if (data?.message) message = data.message;
        } catch {}
        throw new Error(message);
      }

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
    } catch (err: any) {
      console.error(err);
      const msg = err?.message || "Unexpected error";
      if (typeof window !== "undefined") alert(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  // Poll server health and disable action until ready
  useEffect(() => {
    let active = true;
    let timer: number | null = null;
    const check = async () => {
      try {
        const res = await fetch("http://localhost:3001/api/health?start=1");
        const data = await res.json();
        if (!active) return;
        if (res.ok && data?.ok) {
          setServerReady(true);
          setServerMessage(null);
        } else {
          setServerReady(false);
          setServerMessage(data?.message || "Server not ready");
        }
      } catch (e) {
        if (!active) return;
        setServerReady(false);
        setServerMessage("Cannot contact server");
      } finally {
        if (active) timer = window.setTimeout(check, 2000);
      }
    };
    check();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  const handleClear = () => {
    if (isProcessing) return;
    setText("");
    setCorrectedParas([]);
    setProgressPercent(0);
    setTotalParagraphs(0);
  };

  const correctedText = correctedParas.filter(Boolean).join("\n\n");

  const handleCopy = async () => {
    if (!correctedText) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(correctedText);
      } else {
        const ta = document.createElement("textarea");
        ta.value = correctedText;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error("Copy failed", e);
    }
  };

  useEffect(() => {
    if (isProcessing) {
      document.title = `${progressPercent}% | Grammar Fixer`;
    } else {
      document.title = "Grammar Fixer";
    }
  }, [isProcessing, progressPercent]);

  return (
    <div style={{ maxWidth: "1280px", margin: "2rem auto", textAlign: "left" }}>
      <h1 style={{ textAlign: "center" }}>Grammar Fixer (Ollama)</h1>

      <div className="toolbar">
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          style={{ width: "155px" }}
        >
          <option value="gemma3">Gemma 3 4B</option>
          <option value="deepseek-v3.1:671b-cloud">DeepSeek 671B (Cloud)</option>
          <option value="gpt-oss:120b-cloud">GPT-OSS 120B (Cloud)</option>
          <option value="llama3.2">Llama 3.2 3B</option>
          <option value="deepseek-llm">DeepSeek 7B</option>
          <option value="mistral">Mistral 7B</option>
          <option value="thinkverse/towerinstruct:latest">TowerInstruct 7B</option>
        </select>

        <button
          className="btn-secondary btn-icon"
          onClick={() => setSettingsOpen((v) => !v)}
          title="Settings"
          aria-label="Open settings"
        >
          ⚙️
        </button>

      <Settings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => {
          // force a health refresh quickly after saving
          setServerReady(false);
        }}
      />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste your text..."
          rows={15}
          style={{ width: "100%", padding: "1rem", margin: "auto auto 1em auto" }}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button onClick={handleSubmit} disabled={isProcessing || !serverReady}>
          {isProcessing ? "Processing..." : serverReady ? "Fix Grammar" : "Waiting for Ollama..."}
        </button>
        <button
          onClick={handleClear}
          disabled={isProcessing}
          style={{ marginLeft: 12 }}
          aria-label="Clear text and results"
        >
          Clear
        </button>
        <button
          onClick={handleCopy}
          disabled={!correctedText}
          style={{ marginLeft: 12 }}
          aria-label="Copy corrected result to clipboard"
          title={correctedText ? "Copy corrected result" : "No result to copy"}
        >
          {copied ? "Copied!" : "Copy Result"}
        </button>
      </div>

      {isProcessing && (
        <div className="progress-container">
          Progress: {progressPercent}% ({correctedParas.filter(Boolean).length}/{totalParagraphs})
          <div className="progress-bar-bg">
            <div
              className="progress-bar-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {!isProcessing && !serverReady && (
        <div className="progress-container" role="status" aria-live="polite">
          {serverMessage || "Starting Ollama..."}
        </div>
      )}

      {correctedText && (
        <div style={{ marginTop: "2rem" }}>
          <h2>Difference View</h2>
          <InlineDiff
            oldValue={text}
            newValue={correctedText}
            leftTitle="Original"
            rightTitle="Corrected"
          />
        </div>
      )}

      {isProcessing && (
        <div className="floating-progress" role="status" aria-live="polite">
          <div className="floating-progress-row">
            <span>
              {progressPercent}% ({correctedParas.filter(Boolean).length}/{totalParagraphs})
            </span>
          </div>
          <div className="floating-progress-bar">
            <div className="floating-progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
