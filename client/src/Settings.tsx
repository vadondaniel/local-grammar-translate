import React, { useEffect, useState } from "react";

type Config = {
  OLLAMA_HOST: string;
  OLLAMA_PORT: number;
  OLLAMA_AUTOSTART: boolean;
  OLLAMA_START_TIMEOUT_MS: number;
  OLLAMA_RUN_TIMEOUT_MS: number;
  OLLAMA_CONCURRENCY: number;
};

interface SettingsProps {
  open: boolean;
  onClose: () => void;
  onSaved?: (cfg: Config) => void;
}

const Settings: React.FC<SettingsProps> = ({ open, onClose, onSaved }) => {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [persist, setPersist] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"grammar" | "server">("grammar");
  const [defaultModel, setDefaultModel] = useState<string>("gemma3");
  const [tone, setTone] = useState<string>("neutral");
  const [strictness, setStrictness] = useState<string>("balanced");
  const [punctuationStyle, setPunctuationStyle] = useState<string>("simple");
  const [units, setUnits] = useState<string>("unchanged");

  useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch("http://localhost:3001/api/config");
        const data = await res.json();
        if (!active) return;
        if (res.ok && data?.ok && data?.config) {
          setCfg(data.config);
          setStatus(null);
        } else {
          setStatus(data?.error || "Failed to load settings");
        }
      } catch {
        if (!active) return;
        setStatus("Failed to contact server");
      }
    })();
    // Load grammar default model from localStorage when dialog opens
    try {
      if (typeof window !== "undefined") {
        const savedModel = localStorage.getItem("defaultModel");
        const savedTone = localStorage.getItem("grammarTone");
        const savedStrictness = localStorage.getItem("grammarStrictness");
        const savedPunct = localStorage.getItem("punctuationStyle");
        if (savedModel) setDefaultModel(savedModel);
        if (savedTone) setTone(savedTone);
        if (savedStrictness) setStrictness(savedStrictness);
        if (savedPunct) setPunctuationStyle(savedPunct);
        const savedUnits = localStorage.getItem("unitsPreference");
        if (savedUnits) setUnits(savedUnits);
      }
    } catch {}
    return () => { active = false; };
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (open && e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const update = (patch: Partial<Config>) => {
    if (!cfg) return;
    setCfg({ ...cfg, ...patch });
  };

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      // Always persist grammar default locally
      try {
        if (typeof window !== "undefined") {
          localStorage.setItem("defaultModel", defaultModel);
          localStorage.setItem("grammarTone", tone);
          localStorage.setItem("grammarStrictness", strictness);
          localStorage.setItem("punctuationStyle", punctuationStyle);
          localStorage.setItem("unitsPreference", units);
        }
      } catch {}

      if (cfg) {
        const res = await fetch("http://localhost:3001/api/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...cfg, persist }),
        });
        const data = await res.json();
        if (res.ok && data?.ok) {
          setStatus(persist ? "Saved (persisted)" : "Saved");
          onSaved?.(data.config);
        } else {
          setStatus(data?.error || "Save failed");
        }
      } else {
        // Only grammar settings saved
        setStatus("Saved");
      }
    } catch {
      setStatus("Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const close = () => onClose();

  return (
    <div className="modal-overlay" onClick={close} role="presentation">
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <strong>Settings</strong>
          <button className="btn-secondary" onClick={close} aria-label="Close settings">x</button>
        </div>
        <div className="modal-body">
          {/* Tabs */}
          <div className="tabs">
            <button
              className={`tab-btn ${activeTab === "grammar" ? "active" : ""}`}
              onClick={() => setActiveTab("grammar")}
              aria-selected={activeTab === "grammar"}
              role="tab"
            >
              Grammar
            </button>
            <button
              className={`tab-btn ${activeTab === "server" ? "active" : ""}`}
              onClick={() => setActiveTab("server")}
              aria-selected={activeTab === "server"}
              role="tab"
            >
              Server
            </button>
          </div>

          {/* Panels */}
          {activeTab === "server" && (
            <div className="modal-grid" role="tabpanel">
              {!cfg && (
                <div>Loading. {status && <span>({status})</span>}</div>
              )}
              {cfg && (
                <>
                  <label className="form-row">
                    <span>Ollama Host</span>
                    <input
                      type="text"
                      value={cfg.OLLAMA_HOST}
                      onChange={(e) => update({ OLLAMA_HOST: e.target.value })}
                    />
                  </label>
                  <label className="form-row">
                    <span>Ollama Port</span>
                    <input
                      type="number"
                      value={cfg.OLLAMA_PORT}
                      onChange={(e) => update({ OLLAMA_PORT: Number(e.target.value) || 0 })}
                    />
                  </label>
                  <label className="form-row inline" style={{ gridColumn: "1 / -1" }}>
                    <input
                      type="checkbox"
                      checked={cfg.OLLAMA_AUTOSTART}
                      onChange={(e) => update({ OLLAMA_AUTOSTART: e.target.checked })}
                    />
                    <span>Autostart Ollama (local only)</span>
                  </label>
                  <label className="form-row">
                    <span>Start Timeout (ms)</span>
                    <input
                      type="number"
                      value={cfg.OLLAMA_START_TIMEOUT_MS}
                      onChange={(e) => update({ OLLAMA_START_TIMEOUT_MS: Number(e.target.value) || 0 })}
                    />
                  </label>
                  <label className="form-row">
                    <span>Run Timeout per Paragraph (ms)</span>
                    <input
                      type="number"
                      value={cfg.OLLAMA_RUN_TIMEOUT_MS}
                      onChange={(e) => update({ OLLAMA_RUN_TIMEOUT_MS: Number(e.target.value) || 0 })}
                    />
                  </label>
                  <label className="form-row">
                    <span>Concurrency</span>
                    <input
                      type="number"
                      min={1}
                      value={cfg.OLLAMA_CONCURRENCY}
                      onChange={(e) => update({ OLLAMA_CONCURRENCY: Math.max(1, Number(e.target.value) || 1) })}
                    />
                  </label>
                  <label className="form-row inline" style={{ gridColumn: "1 / -1" }}>
                    <input
                      type="checkbox"
                      checked={persist}
                      onChange={(e) => setPersist(e.target.checked)}
                    />
                    <span>Persist settings to server</span>
                  </label>
                </>
              )}
            </div>
          )}

          {activeTab === "grammar" && (
            <div className="modal-grid" role="tabpanel">
              <label className="form-row" style={{ gridColumn: "1 / -1" }}>
                <span>Default Model</span>
                <select value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)}>
                  <option value="gemma3">Gemma 3 4B</option>
                  <option value="deepseek-v3.1:671b-cloud">DeepSeek 671B (Cloud)</option>
                  <option value="gpt-oss:120b-cloud">GPT-OSS 120B (Cloud)</option>
                  <option value="llama3.2">Llama 3.2 3B</option>
                  <option value="deepseek-llm">DeepSeek 7B</option>
                  <option value="mistral">Mistral 7B</option>
                  <option value="thinkverse/towerinstruct:latest">TowerInstruct 7B</option>
                </select>
              </label>
              <label className="form-row">
                <span>Tone</span>
                <select value={tone} onChange={(e) => setTone(e.target.value)}>
                  <option value="unchanged">Unchanged</option>
                  <option value="neutral">Neutral</option>
                  <option value="formal">Formal</option>
                  <option value="friendly">Friendly</option>
                  <option value="academic">Academic</option>
                  <option value="technical">Technical</option>
                </select>
              </label>
              <label className="form-row">
                <span>Strictness</span>
                <select value={strictness} onChange={(e) => setStrictness(e.target.value)}>
                  <option value="lenient">Lenient</option>
                  <option value="balanced">Balanced</option>
                  <option value="strict">Strict</option>
                </select>
              </label>
              <label className="form-row">
                <span>Punctuation Style</span>
                <select value={punctuationStyle} onChange={(e) => setPunctuationStyle(e.target.value)}>
                  <option value="unchanged">Unchanged</option>
                  <option value="auto">Auto</option>
                  <option value="simple">Simple ASCII (" ' - ...)</option>
                  <option value="smart">Typographic (“ ” ‘ ’ – — …)</option>
                </select>
              </label>
              <label className="form-row">
                <span>Units</span>
                <select value={units} onChange={(e) => setUnits(e.target.value)}>
                  <option value="unchanged">Unchanged</option>
                  <option value="metric">Metric (SI)</option>
                  <option value="imperial">Imperial/US</option>
                  <option value="auto">Auto</option>
                </select>
              </label>
              <div style={{ gridColumn: "1 / -1", color: "#6b7280", fontSize: "0.9rem" }}>
                These preferences are applied when fixing text and are remembered on refresh.
              </div>
            </div>
          )}
        </div>
        <div className="modal-actions">
          {status && <span style={{ color: "#4b5563" }}>{status}</span>}
          <button onClick={save} disabled={saving || (!cfg && activeTab === "server")}>{saving ? "Saving." : "Save"}</button>
          <button className="btn-secondary" onClick={close}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
