import { useState } from "react";
import { api } from "../api/client";
import { decryptFile } from "../crypto/decryptFile";
import EncryptionPasswordModal from "./EncryptionPasswordModal";

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function triggerDownload(buffer, filename, mimeType) {
  const blob = new Blob([buffer], { type: mimeType || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "download";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function FileList({ files, onChanged, onError }) {
  const [downloadTarget, setDownloadTarget] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  async function handleDecrypt(password) {
    const file = downloadTarget;
    const [metadata, ciphertextBuffer] = await Promise.all([
      api.getFileMetadata(file.id),
      api.downloadFile(file.id),
    ]);

    try {
      const plaintext = await decryptFile(
        ciphertextBuffer,
        metadata.iv,
        metadata.salt,
        password,
        metadata.kdf_iterations
      );
      triggerDownload(plaintext, file.encrypted_name, file.mime_type);
      setDownloadTarget(null);
    } catch (err) {
      throw err;
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this file permanently?")) return;
    setDeletingId(id);
    try {
      await api.deleteFile(id);
      onChanged?.();
    } catch (err) {
      onError?.(err.message || "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  if (files.length === 0) {
    return <p className="empty-state">No files yet. Upload one above.</p>;
  }

  return (
    <>
      <ul className="file-list">
        {files.map((f) => (
          <li key={f.id} className="file-row">
            <div className="file-info">
              <div className="name">{f.encrypted_name || `file-${f.id}`}</div>
              <div className="meta">
                {formatSize(f.original_size_bytes)} · {new Date(f.created_at).toLocaleString()}
              </div>
            </div>
            <div className="file-actions">
              <button className="btn-secondary" onClick={() => setDownloadTarget(f)}>
                Download
              </button>
              <button
                className="btn-danger"
                onClick={() => handleDelete(f.id)}
                disabled={deletingId === f.id}
              >
                {deletingId === f.id ? "..." : "Delete"}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {downloadTarget && (
        <EncryptionPasswordModal
          title="Decrypt & download"
          hint={`Enter the encryption password used when "${downloadTarget.encrypted_name}" was uploaded.`}
          confirmLabel="Decrypt & Download"
          onConfirm={handleDecrypt}
          onCancel={() => setDownloadTarget(null)}
        />
      )}
    </>
  );
}
