// src/lib/backend.js

// e.g. VITE_BACKEND_URL = "https://dds-secure-chat-web.vercel.app/api"
const API = import.meta.env.VITE_BACKEND_URL;

// helper to avoid double-slashes or duplicate "/api"
function buildUrl(path) {
  // remove trailing slash from API, if any
  const base = API.replace(/\/+$/, "");
  // ensure path starts with a single slash
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

/** POST helper that automatically JSON-encodes the body */
export async function post(path, payload) {
  const url = buildUrl(path);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const errorData = await res.json();
      if (errorData?.message) msg += `: ${errorData.message}`;
    } catch {
      /* ignore JSON parse errors */
    }
    throw new Error(msg);
  }
  return res.json();
}

/** GET helper */
export async function get(path) {
  const url = buildUrl(path);
  const res = await fetch(url);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    if (res.status === 404) {
      msg = `Not found: ${path}`;
      try {
        const { detail } = await res.json();
        if (detail) msg += `: ${detail}`;
      } catch {}
    } else {
      try {
        const err = await res.json();
        if (err?.detail) msg += `: ${err.detail}`;
        else if (err?.message) msg += `: ${err.message}`;
      } catch {}
    }
    throw new Error(msg);
  }
  return res.json();
}
