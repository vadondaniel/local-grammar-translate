import React, { useEffect, useState } from "react";
import { API_BASE_URL, DEFAULT_MODEL_ID, MODEL_OPTIONS, normalizeModelId } from "./projectConfig";
import type {
  TranslatorPunctuationStyle,
  TranslatorSourceLanguage,
  TranslatorTargetLanguage,
} from "./translationOptions";
import {
  SOURCE_LANGUAGE_OPTIONS,
  TARGET_LANGUAGE_OPTIONS,
  DEFAULT_TRANSLATOR_MAX_PARAGRAPHS,
  DEFAULT_TRANSLATOR_MAX_CHARS,
  STORAGE_KEYS as TRANSLATOR_STORAGE_KEYS,
  TRANSLATOR_PUNCTUATION_OPTIONS,
} from "./translationOptions";

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
  initialTab?: "grammar" | "translator" | "server";
}

const Settings: React.FC<SettingsProps> = ({ open, onClose, onSaved, initialTab = "grammar" }) => {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [persist, setPersist] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"grammar" | "translator" | "server">(initialTab);
  const [defaultModel, setDefaultModel] = useState<string>(DEFAULT_MODEL_ID);
  const [tone, setTone] = useState<string>("neutral");
  const [strictness, setStrictness] = useState<string>("balanced");
  const [punctuationStyle, setPunctuationStyle] = useState<string>("simple");
  const [units, setUnits] = useState<string>("unchanged");
  const [spellingVariant, setSpellingVariant] = useState<string>("en-US");
  const [translatorSource, setTranslatorSource] = useState<TranslatorSourceLanguage>("auto");
  const [translatorTarget, setTranslatorTarget] = useState<TranslatorTargetLanguage>("english");
  const [translatorDefaultModel, setTranslatorDefaultModel] = useState<string>(DEFAULT_MODEL_ID);
  const [translatorPunctuation, setTranslatorPunctuation] = useState<TranslatorPunctuationStyle>("unchanged");
  const [translatorMaxParagraphs, setTranslatorMaxParagraphs] = useState<number>(DEFAULT_TRANSLATOR_MAX_PARAGRAPHS);
  const [translatorMaxChars, setTranslatorMaxChars] = useState<number>(DEFAULT_TRANSLATOR_MAX_CHARS);

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/config`);
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
        if (savedModel) setDefaultModel(normalizeModelId(savedModel));
        else setDefaultModel(DEFAULT_MODEL_ID);
        if (savedTone) setTone(savedTone);
        if (savedStrictness) setStrictness(savedStrictness);
        if (savedPunct) setPunctuationStyle(savedPunct);
        const savedUnits = localStorage.getItem("unitsPreference");
        if (savedUnits) setUnits(savedUnits);
        const savedSpelling = localStorage.getItem("spellingVariant");
        if (savedSpelling) setSpellingVariant(savedSpelling);
        const savedSource = localStorage.getItem(TRANSLATOR_STORAGE_KEYS.translatorSource) as TranslatorSourceLanguage | null;
        if (savedSource && SOURCE_LANGUAGE_OPTIONS.some((opt) => opt.value === savedSource)) {
          setTranslatorSource(savedSource);
        }
        const savedTarget = localStorage.getItem(TRANSLATOR_STORAGE_KEYS.translatorTarget) as TranslatorTargetLanguage | null;
        if (savedTarget && TARGET_LANGUAGE_OPTIONS.some((opt) => opt.value === savedTarget)) {
          setTranslatorTarget(savedTarget);
        }
        const savedTranslatorModel = localStorage.getItem(TRANSLATOR_STORAGE_KEYS.translatorDefaultModel);
        if (savedTranslatorModel) setTranslatorDefaultModel(normalizeModelId(savedTranslatorModel));
        else setTranslatorDefaultModel(DEFAULT_MODEL_ID);
        const savedTranslatorPunctuation = localStorage.getItem(
          TRANSLATOR_STORAGE_KEYS.translatorPunctuationStyle,
        ) as TranslatorPunctuationStyle | null;
        if (
          savedTranslatorPunctuation &&
          TRANSLATOR_PUNCTUATION_OPTIONS.some((opt) => opt.value === savedTranslatorPunctuation)
        ) {
          setTranslatorPunctuation(savedTranslatorPunctuation);
        }
        const savedMaxParas = Number(localStorage.getItem(TRANSLATOR_STORAGE_KEYS.translatorMaxParagraphs));
        if (Number.isFinite(savedMaxParas) && savedMaxParas > 0) {
          setTranslatorMaxParagraphs(Math.max(1, Math.floor(savedMaxParas)));
        }
        const savedMaxChars = Number(localStorage.getItem(TRANSLATOR_STORAGE_KEYS.translatorMaxChars));
        if (Number.isFinite(savedMaxChars) && savedMaxChars >= 0) {
          setTranslatorMaxChars(Math.max(0, Math.floor(savedMaxChars)));
        }
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
          const normalizedGrammarModel = normalizeModelId(defaultModel);
          setDefaultModel(normalizedGrammarModel);
          localStorage.setItem("defaultModel", normalizedGrammarModel);
          localStorage.setItem("grammarTone", tone);
          localStorage.setItem("grammarStrictness", strictness);
          localStorage.setItem("punctuationStyle", punctuationStyle);
          localStorage.setItem("unitsPreference", units);
          localStorage.setItem("spellingVariant", spellingVariant);
          const normalizedSource = translatorSource;
          const normalizedTarget = translatorTarget;
          const normalizedModel = normalizeModelId(translatorDefaultModel);
          setTranslatorDefaultModel(normalizedModel);
          const normalizedPunctuation = translatorPunctuation;
          const normalizedMaxParas = Math.max(
            1,
            Math.floor(
              Number.isFinite(translatorMaxParagraphs) ? translatorMaxParagraphs : DEFAULT_TRANSLATOR_MAX_PARAGRAPHS,
            ),
          );
          const normalizedMaxChars = Math.max(
            0,
            Math.floor(Number.isFinite(translatorMaxChars) ? translatorMaxChars : DEFAULT_TRANSLATOR_MAX_CHARS),
          );
          setTranslatorMaxParagraphs(normalizedMaxParas);
          setTranslatorMaxChars(normalizedMaxChars);
          localStorage.setItem(TRANSLATOR_STORAGE_KEYS.translatorSource, normalizedSource);
          localStorage.setItem(TRANSLATOR_STORAGE_KEYS.translatorTarget, normalizedTarget);
          localStorage.setItem(TRANSLATOR_STORAGE_KEYS.translatorDefaultModel, normalizedModel);
          localStorage.setItem(TRANSLATOR_STORAGE_KEYS.translatorPunctuationStyle, normalizedPunctuation);
          localStorage.setItem(TRANSLATOR_STORAGE_KEYS.translatorMaxParagraphs, String(normalizedMaxParas));
          localStorage.setItem(TRANSLATOR_STORAGE_KEYS.translatorMaxChars, String(normalizedMaxChars));
        }
      } catch {}

      if (cfg) {
        const res = await fetch(`${API_BASE_URL}/config`, {
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
              className={`tab-btn ${activeTab === "translator" ? "active" : ""}`}
              onClick={() => setActiveTab("translator")}
              aria-selected={activeTab === "translator"}
              role="tab"
            >
              Translator
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

          {activeTab === "translator" && (
            <div className="modal-grid" role="tabpanel">
              <label className="form-row" style={{ gridColumn: "1 / -1" }}>
                <span>Default Model</span>
                <select
                  value={translatorDefaultModel}
                  onChange={(e) => setTranslatorDefaultModel(normalizeModelId(e.target.value))}
                >
                  {MODEL_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-row">
                <span>Default Source Language</span>
                <select value={translatorSource} onChange={(e) => setTranslatorSource(e.target.value as TranslatorSourceLanguage)}>
                  {SOURCE_LANGUAGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-row">
                <span>Default Target Language</span>
                <select value={translatorTarget} onChange={(e) => setTranslatorTarget(e.target.value as TranslatorTargetLanguage)}>
                  {TARGET_LANGUAGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-row">
                <span>Max Paragraphs Per Call</span>
                <input
                  type="number"
                  min={1}
                  value={translatorMaxParagraphs}
                  onChange={(e) => setTranslatorMaxParagraphs(Math.max(1, Number(e.target.value) || 1))}
                />
              </label>
              <label className="form-row">
                <span>Max Characters Per Call (0 = unlimited)</span>
                <input
                  type="number"
                  min={0}
                  value={translatorMaxChars}
                  onChange={(e) => setTranslatorMaxChars(Math.max(0, Number(e.target.value) || 0))}
                />
              </label>
              <label className="form-row">
                <span>Punctuation Style</span>
                <select value={translatorPunctuation} onChange={(e) => setTranslatorPunctuation(e.target.value as TranslatorPunctuationStyle)}>
                  {TRANSLATOR_PUNCTUATION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <div style={{ gridColumn: "1 / -1", color: "#6b7280", fontSize: "0.9rem" }}>
                These defaults apply when using translator mode and determine model choice, punctuation handling, and chunk size.
              </div>
            </div>
          )}

          {activeTab === "grammar" && (
            <div className="modal-grid" role="tabpanel">
              <label className="form-row" style={{ gridColumn: "1 / -1" }}>
                <span>Default Model</span>
                <select value={defaultModel} onChange={(e) => setDefaultModel(normalizeModelId(e.target.value))}>
                  {MODEL_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-row">
                <span>Tone</span>
                <select value={tone} onChange={(e) => setTone(e.target.value)}>
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
              <label className="form-row">
                <span>Spelling (English)</span>
                <select value={spellingVariant} onChange={(e) => setSpellingVariant(e.target.value)}>
                  <option value="unchanged">Unchanged</option>
                  <option value="en-US">English (US)</option>
                  <option value="en-GB">English (UK)</option>
                </select>
              </label>
              <div style={{ gridColumn: "1 / -1", color: "#6b7280", fontSize: "0.9rem" }}>
                These preferences are applied when fixing text and are remembered on refresh.
              </div>
            </div>
          )}
        </div>
        <div className="modal-actions">
          <div aria-live="polite" style={{ marginRight: "auto", minHeight: "1.2em", color: "#4b5563" }}>
            {status || " "}
          </div>
          <button onClick={save} disabled={saving || (!cfg && activeTab === "server")}>{saving ? "Saving." : "Save"}</button>
          <button className="btn-secondary" onClick={close}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
