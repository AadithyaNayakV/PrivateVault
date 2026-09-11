// 127.0.0.1 (not "localhost") to avoid browsers/Node preferring an IPv6
// resolution (::1) that uvicorn isn't listening on by default.
const API_BASE = "http://127.0.0.1:8000/api";

// Token is kept in localStorage for simplicity in this prototype. This is a
// known XSS-exposure trade-off (an in-memory-only token would be safer but
// doesn't survive a page refresh) — documented in the project write-up.
const TOKEN_KEY = "privatevault_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function request(path, { method = "GET", body, isJson = true, isForm = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (isJson && body !== undefined) headers["Content-Type"] = "application/json";

  const resp = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      const data = await resp.json();
      detail = data.detail || detail;
    } catch {
      // ignore non-JSON error bodies
    }
    const error = new Error(detail);
    error.status = resp.status;
    throw error;
  }

  return resp;
}

export const api = {
  register: (email, password) =>
    request("/auth/register", { method: "POST", body: { email, password } }).then((r) => r.json()),

  login: (email, password) =>
    request("/auth/login", { method: "POST", body: { email, password } }).then((r) => r.json()),

  me: () => request("/auth/me").then((r) => r.json()),

  listFiles: () => request("/files").then((r) => r.json()),

  uploadFile: (formData) =>
    request("/files/upload", { method: "POST", body: formData, isJson: false, isForm: true }).then((r) =>
      r.json()
    ),

  getFileMetadata: (id) => request(`/files/${id}/metadata`).then((r) => r.json()),

  downloadFile: (id) => request(`/files/${id}/download`).then((r) => r.arrayBuffer()),

  deleteFile: (id) => request(`/files/${id}`, { method: "DELETE" }),

  auditLogs: () => request("/audit-logs").then((r) => r.json()),
};
