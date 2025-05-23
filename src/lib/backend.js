// src/lib/backend.js

// e.g. VITE_BACKEND_URL = "https://dds-secure-chat-web.vercel.app/api"
const API = import.meta.env.VITE_BACKEND_URL;

// helper to avoid double-slashes or duplicate "/api"
export function buildUrl(path, explicitBaseUrl) {
  let finalBaseUrl;

  if (arguments.length === 2) {
    // Second argument was explicitly passed (could be a string, undefined, null, etc.)
    finalBaseUrl = explicitBaseUrl;
  } else {
    // Second argument was not passed, use API as the default
    finalBaseUrl = API;
  }

  if (!finalBaseUrl) {
    throw new Error(
      "API base URL is not configured. Please set VITE_BACKEND_URL or pass baseUrl to buildUrl."
    );
  }

  // remove trailing slash from finalBaseUrl, if any
  const base = String(finalBaseUrl).replace(/\/+$/, "");

  // determine suffix based on path
  let suffix = "";
  if (path === "") {
    suffix = "/"; // For empty path, add a trailing slash
  } else if (path !== undefined && path !== null) {
    // For non-empty, defined, non-null path
    suffix = String(path).startsWith("/") ? String(path) : `/${String(path)}`;
  }
  // If path is undefined or null, suffix remains "", which is correct for tests like 'should handle undefined path'

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
      } catch {
        console.error("Error parsing JSON response:", res.statusText);
      }
    } else {
      try {
        const err = await res.json();
        if (err?.detail) msg += `: ${err.detail}`;
        else if (err?.message) msg += `: ${err.message}`;
      } catch {
        console.error("Error parsing JSON response:", res.statusText);
      }
    }
    throw new Error(msg);
  }
  return res.json();
}
