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
    if (!cfg) return;
    setSaving(true);
    setStatus(null);
    try {
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
          <button className="btn-secondary" onClick={close} aria-label="Close settings">×</button>
        </div>
        <div className="modal-body">
          {!cfg && (
            <div>Loading… {status && <span>({status})</span>}</div>
          )}
          {cfg && (
            <div className="modal-grid">
              <label style={{ display: "flex", flexDirection: "column" }}>
                <span>Ollama Host</span>
                <input
                  type="text"
                  value={cfg.OLLAMA_HOST}
                  onChange={(e) => update({ OLLAMA_HOST: e.target.value })}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column" }}>
                <span>Ollama Port</span>
                <input
                  type="number"
                  value={cfg.OLLAMA_PORT}
                  onChange={(e) => update({ OLLAMA_PORT: Number(e.target.value) || 0 })}
                />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={cfg.OLLAMA_AUTOSTART}
                  onChange={(e) => update({ OLLAMA_AUTOSTART: e.target.checked })}
                />
                <span>Autostart Ollama (local only)</span>
              </label>
              <div />
              <label style={{ display: "flex", flexDirection: "column" }}>
                <span>Start Timeout (ms)</span>
                <input
                  type="number"
                  value={cfg.OLLAMA_START_TIMEOUT_MS}
                  onChange={(e) => update({ OLLAMA_START_TIMEOUT_MS: Number(e.target.value) || 0 })}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column" }}>
                <span>Run Timeout per Paragraph (ms)</span>
                <input
                  type="number"
                  value={cfg.OLLAMA_RUN_TIMEOUT_MS}
                  onChange={(e) => update({ OLLAMA_RUN_TIMEOUT_MS: Number(e.target.value) || 0 })}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column" }}>
                <span>Concurrency</span>
                <input
                  type="number"
                  min={1}
                  value={cfg.OLLAMA_CONCURRENCY}
                  onChange={(e) => update({ OLLAMA_CONCURRENCY: Math.max(1, Number(e.target.value) || 1) })}
                />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={persist}
                  onChange={(e) => setPersist(e.target.checked)}
                />
                <span>Persist settings to server</span>
              </label>
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button onClick={save} disabled={!cfg || saving}>{saving ? "Saving…" : "Save"}</button>
          <button className="btn-secondary" onClick={close}>Cancel</button>
          {status && <span style={{ color: "#4b5563" }}>{status}</span>}
        </div>
      </div>
    </div>
  );
};

export default Settings;
