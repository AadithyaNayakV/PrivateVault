import { useRef, useState } from "react";
import { api } from "../api/client";
import { encryptFile } from "../crypto/encryptFile";
import EncryptionPasswordModal from "./EncryptionPasswordModal";

export default function FileUploader({ onUploaded, onError }) {
  const inputRef = useRef(null);
  const [pendingFile, setPendingFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFiles(files) {
    if (files && files.length > 0) {
      setPendingFile(files[0]);
    }
  }

  async function handleConfirm(password) {
    const file = pendingFile;
    const { ciphertext, iv, salt, kdfIterations, encryptedName } = await encryptFile(file, password);

    const formData = new FormData();
    formData.append("file", ciphertext, "ciphertext.bin");
    formData.append("iv", iv);
    formData.append("salt", salt);
    formData.append("kdf_iterations", String(kdfIterations));
    formData.append("encrypted_name", encryptedName);
    formData.append("mime_type", file.type || "application/octet-stream");
    formData.append("original_size_bytes", String(file.size));

    try {
      await api.uploadFile(formData);
      setPendingFile(null);
      if (inputRef.current) inputRef.current.value = "";
      onUploaded?.();
    } catch (err) {
      onError?.(err.message || "Upload failed");
      throw err;
    }
  }

  return (
    <div
      className="uploader"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      style={{ borderColor: dragOver ? "#5b8cff" : undefined }}
    >
      <p>Drag & drop a file here, or</p>
      <input
        ref={inputRef}
        type="file"
        onChange={(e) => handleFiles(e.target.files)}
        style={{ display: "none" }}
        id="file-input"
      />
      <button type="button" className="btn-secondary" onClick={() => inputRef.current?.click()}>
        Choose file
      </button>

      {pendingFile && (
        <EncryptionPasswordModal
          title="Encrypt & upload"
          hint={`Encrypting "${pendingFile.name}" locally before it ever leaves your browser. If you forget this password, the file cannot be recovered — PrivateVault never sees it.`}
          confirmLabel="Encrypt & Upload"
          onConfirm={handleConfirm}
          onCancel={() => {
            setPendingFile(null);
            if (inputRef.current) inputRef.current.value = "";
          }}
        />
      )}
    </div>
  );
}
