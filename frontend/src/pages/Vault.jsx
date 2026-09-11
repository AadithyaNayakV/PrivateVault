import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../api/AuthContext";
import { api } from "../api/client";
import FileUploader from "../components/FileUploader";
import FileList from "../components/FileList";

export default function Vault() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  async function loadFiles() {
    setLoading(true);
    try {
      const data = await api.listFiles();
      setFiles(data);
    } catch (err) {
      showToast(err.message || "Failed to load files", true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFiles();
  }, []);

  function showToast(message, isError = false) {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 4000);
  }

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="vault-page">
      <div className="vault-header">
        <h1>PrivateVault</h1>
        <div>
          <span className="email">{user?.email}</span>{" "}
          <button className="btn-secondary" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </div>

      <div className="warning-banner">
        Files are encrypted in your browser before upload. If you forget your encryption
        password, your files cannot be recovered — PrivateVault never stores or sees it.
      </div>

      <FileUploader
        onUploaded={() => {
          showToast("File encrypted and uploaded.");
          loadFiles();
        }}
        onError={(msg) => showToast(msg, true)}
      />

      {loading ? (
        <p className="empty-state">Loading files...</p>
      ) : (
        <FileList
          files={files}
          onChanged={() => {
            showToast("File deleted.");
            loadFiles();
          }}
          onError={(msg) => showToast(msg, true)}
        />
      )}

      {toast && <div className={`toast ${toast.isError ? "error" : ""}`}>{toast.message}</div>}
    </div>
  );
}
