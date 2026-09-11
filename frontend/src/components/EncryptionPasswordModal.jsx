import { useState } from "react";

export default function EncryptionPasswordModal({ title, hint, confirmLabel, onConfirm, onCancel }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleConfirm(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await onConfirm(password);
    } catch (err) {
      setError(err.message || "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>{title}</h2>
        <p className="hint">{hint}</p>
        <form onSubmit={handleConfirm}>
          <div className="field">
            <label htmlFor="enc-password">Encryption password</label>
            <input
              id="enc-password"
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="error-text">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy || !password}>
              {busy ? "Working..." : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
