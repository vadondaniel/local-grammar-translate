import { useEffect, useRef, useState } from "react";
import "./App.css";
import InlineDiff from "./InlineDiff";
import Settings from "./Settings.tsx";
import type { TranslatorSourceLanguage, TranslatorTargetLanguage } from "./translationOptions";
import {
  SOURCE_LANGUAGE_OPTIONS,
  TARGET_LANGUAGE_OPTIONS,
  DEFAULT_TRANSLATOR_MAX_PARAGRAPHS,
  DEFAULT_TRANSLATOR_MAX_CHARS,
  STORAGE_KEYS as TRANSLATOR_STORAGE_KEYS,
} from "./translationOptions";

type Mode = "grammar" | "translator";

const MODE_LABELS: Record<Mode, string> = {
  grammar: "Grammar Fixer",
  translator: "Translator",
};

const SOURCE_VALUES = SOURCE_LANGUAGE_OPTIONS.map((o) => o.value);
const TARGET_VALUES = TARGET_LANGUAGE_OPTIONS.map((o) => o.value);

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
  const [mode, setMode] = useState<Mode>(() => {
    try {
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem(TRANSLATOR_STORAGE_KEYS.mode);
        if (stored === "translator" || stored === "grammar") {
          return stored as Mode;
        }
      }
    } catch {}
    return "grammar";
  });
  const [sourceLang, setSourceLang] = useState<TranslatorSourceLanguage>(() => {
    try {
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem(TRANSLATOR_STORAGE_KEYS.translatorSource) as TranslatorSourceLanguage | null;
        if (stored && SOURCE_VALUES.includes(stored)) {
          return stored;
        }
      }
    } catch {}
    return "auto";
  });
  const [targetLang, setTargetLang] = useState<TranslatorTargetLanguage>(() => {
    try {
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem(TRANSLATOR_STORAGE_KEYS.translatorTarget) as TranslatorTargetLanguage | null;
        if (stored && TARGET_VALUES.includes(stored)) {
          return stored;
        }
      }
    } catch {}
    return "english";
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [serverReady, setServerReady] = useState(false);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);
  const [totalParagraphs, setTotalParagraphs] = useState(0);

  const [outputParas, setOutputParas] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleSubmit = async () => {
    setIsProcessing(true);
    setOutputParas([]);
    setProgressPercent(0);
    setTotalParagraphs(0);

    const paragraphs = text.split(/\n\s*\n+/).filter(Boolean);
    const total = paragraphs.length;
    setTotalParagraphs(total);

    if (total === 0) {
      setProgressPercent(100);
      setIsProcessing(false);
      return;
    }

    const partials: string[] = new Array(total).fill("");
    const seen: boolean[] = new Array(total).fill(false);
    let processed = 0;

    let endpoint = "fix-stream";
    const payload: Record<string, unknown> = { text, model };

    if (mode === "grammar") {
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
      payload.options = { tone, strictness, punctuationStyle, units, spellingVariant };
    } else {
      endpoint = "translate-stream";
      let maxParagraphs = DEFAULT_TRANSLATOR_MAX_PARAGRAPHS;
      let maxChars = DEFAULT_TRANSLATOR_MAX_CHARS;
      try {
        if (typeof window !== "undefined") {
          const storedParas = Number(localStorage.getItem(TRANSLATOR_STORAGE_KEYS.translatorMaxParagraphs));
          if (Number.isFinite(storedParas) && storedParas > 0) {
            maxParagraphs = Math.max(1, Math.floor(storedParas));
          }
          const storedChars = Number(localStorage.getItem(TRANSLATOR_STORAGE_KEYS.translatorMaxChars));
          if (Number.isFinite(storedChars) && storedChars > 0) {
            maxChars = Math.max(0, Math.floor(storedChars));
          }
        }
      } catch {}
      payload.options = {
        sourceLang,
        targetLang,
        chunking: {
          maxParagraphs,
          maxChars,
        },
      };
    }

    try {
      const res = await fetch(`http://localhost:3001/api/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const rawLine of lines) {
          if (!rawLine.trim()) continue;

          try {
            const obj = JSON.parse(rawLine);
            if (obj.error) continue;

            const idxRaw = obj.index;
            const idx = typeof idxRaw === "number" ? idxRaw : Number(idxRaw);
            if (!Number.isInteger(idx) || idx < 0 || idx >= total) continue;

            let valueText = "";
            if (mode === "grammar") {
              valueText = typeof obj.corrected === "string" ? obj.corrected : "";
            } else {
              if (typeof obj.translated === "string") {
                valueText = obj.translated;
              } else if (typeof obj.corrected === "string") {
                valueText = obj.corrected;
              }
            }

            partials[idx] = valueText;
            if (!seen[idx]) {
              seen[idx] = true;
              processed += 1;
            }

            setOutputParas([...partials]);

            if (total > 0) {
              setProgressPercent(Math.min(100, Math.round((processed / total) * 100)));
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

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem(TRANSLATOR_STORAGE_KEYS.mode, mode);
      }
    } catch {}
  }, [mode]);

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem(TRANSLATOR_STORAGE_KEYS.translatorSource, sourceLang);
      }
    } catch {}
  }, [sourceLang]);

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem(TRANSLATOR_STORAGE_KEYS.translatorTarget, targetLang);
      }
    } catch {}
  }, [targetLang]);

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
    setOutputParas([]);
    setProgressPercent(0);
    setTotalParagraphs(0);
  };

  const outputText = outputParas.length ? outputParas.join("\n\n") : "";
  const headingText = `${MODE_LABELS[mode]} (Ollama)`;
  const idleActionLabel = mode === "grammar" ? "Fix Grammar" : "Translate";
  const processingLabel = mode === "grammar" ? "Processing..." : "Translating...";
  const copyLabel = mode === "grammar" ? "Copy Result" : "Copy Translation";
  const copyTitle = outputText
    ? mode === "grammar"
      ? "Copy corrected result"
      : "Copy translation result"
    : "No result to copy";
  const completedCount = outputParas.filter((entry) => entry.trim().length > 0).length;
  const progressLabel = mode === "grammar" ? "Progress" : "Translation progress";

  const handleCopy = async () => {
    if (!outputText) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(outputText);
      } else {
        const ta = document.createElement("textarea");
        ta.value = outputText;
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
    const baseTitle = MODE_LABELS[mode];
    if (isProcessing) {
      document.title = `${progressPercent}% | ${baseTitle}`;
    } else {
      document.title = baseTitle;
    }
  }, [isProcessing, progressPercent, mode]);

  return (
    <div style={{ maxWidth: "1280px", margin: "2rem auto", textAlign: "left" }}>
      <h1 style={{ textAlign: "center" }}>{headingText}</h1>

      <div className="toolbar">
        <div className="mode-toggle" role="group" aria-label="Mode selection">
          <button
            type="button"
            className={`mode-toggle-btn${mode === "grammar" ? " active" : ""}`}
            onClick={() => setMode("grammar")}
            disabled={isProcessing}
          >
            Grammar
          </button>
          <button
            type="button"
            className={`mode-toggle-btn${mode === "translator" ? " active" : ""}`}
            onClick={() => setMode("translator")}
            disabled={isProcessing}
          >
            Translator
          </button>
        </div>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          style={{ width: "155px" }}
          disabled={isProcessing}
          aria-label="Model selection"
        >
          <option value="gemma3">Gemma 3 4B</option>
          <option value="deepseek-v3.1:671b-cloud">DeepSeek 671B (Cloud)</option>
          <option value="gpt-oss:120b-cloud">GPT-OSS 120B (Cloud)</option>
          <option value="llama3.2">Llama 3.2 3B</option>
          <option value="deepseek-llm">DeepSeek 7B</option>
          <option value="mistral">Mistral 7B</option>
          <option value="thinkverse/towerinstruct:latest">TowerInstruct 7B</option>
        </select>

        {mode === "translator" && (
          <>
            <select
              value={sourceLang}
              onChange={(e) => setSourceLang(e.target.value as TranslatorSourceLanguage)}
              style={{ width: "150px" }}
              disabled={isProcessing}
              aria-label="Source language"
            >
              {SOURCE_LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value as TranslatorTargetLanguage)}
              style={{ width: "150px" }}
              disabled={isProcessing}
              aria-label="Target language"
            >
              {TARGET_LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </>
        )}

        <button
          className="btn-secondary btn-icon"
          onClick={() => setSettingsOpen((v) => !v)}
          title="Settings"
          aria-label="Open settings"
          type="button"
        >
          &#9881;
        </button>
      </div>

      <Settings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => {
          // force a health refresh quickly after saving
          setServerReady(false);
        }}
      />

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
          {isProcessing ? processingLabel : serverReady ? idleActionLabel : "Waiting for Ollama..."}
        </button>
        <button
          onClick={handleClear}
          disabled={isProcessing}
          style={{ marginLeft: 12 }}
          aria-label="Clear text and results"
          type="button"
        >
          Clear
        </button>
        <button
          onClick={handleCopy}
          disabled={!outputText}
          style={{ marginLeft: 12 }}
          aria-label={copyTitle}
          title={copyTitle}
          type="button"
        >
          {copied ? "Copied!" : copyLabel}
        </button>
      </div>

      {isProcessing && (
        <div className="progress-container">
          {progressLabel}: {progressPercent}% ({completedCount}/{totalParagraphs})
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

      {mode === "grammar" && outputText && (
        <div style={{ marginTop: "2rem" }}>
          <h2>Difference View</h2>
          <InlineDiff
            oldValue={text}
            newValue={outputText}
            leftTitle="Original"
            rightTitle="Corrected"
          />
        </div>
      )}

      {mode === "translator" && outputText && (
        <div style={{ marginTop: "2rem" }}>
          <h2>Translation</h2>
          <div className="translation-view">
            <div className="translation-column">
              <h3>Original</h3>
              <div className="translation-body">{text || "(no input)"}</div>
            </div>
            <div className="translation-column">
              <h3>Translated</h3>
              <div className="translation-body">{outputText}</div>
            </div>
          </div>
        </div>
      )}

      {isProcessing && (
        <div className="floating-progress" role="status" aria-live="polite">
          <div className="floating-progress-row">
            <span>
              {progressPercent}% ({completedCount}/{totalParagraphs})
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




