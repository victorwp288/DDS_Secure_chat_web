const API = import.meta.env.VITE_BACKEND_URL;

/** POST helper that automatically JSON-encodes the body */
export async function post(path, payload) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    // try to surface backend error message
    let msg = `HTTP ${res.status}`;
    try {
      const errorData = await res.json();
      if (errorData && errorData.message) {
        msg += ": " + errorData.message;
      }
    } catch {
      /* ignore JSON parsing error if response is not JSON */
    }
    throw new Error(msg);
  }
  return res.json();
}

/** GET helper */
export async function get(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) {
    // try to surface backend error message
    let msg = `HTTP ${res.status}`;
    // Add specific handling for 404 (bundle not found)
    if (res.status === 404) {
      msg = `Not found: ${path}`;
      try {
        const errorData = await res.json();
        if (errorData && errorData.detail) {
          msg += `: ${errorData.detail}`;
        }
      } catch {
        /* ignore JSON parsing error */
      }
      // Throw a specific error type or just the message
      // For simplicity, just throwing the message
    } else {
      // Generic error handling for other statuses
      try {
        const errorData = await res.json();
        if (errorData && errorData.detail) {
          // Use detail if available from FastAPI
          msg += `: ${errorData.detail}`;
        } else if (errorData && errorData.message) {
          msg += ": " + errorData.message;
        }
      } catch {
        /* ignore JSON parsing error if response is not JSON */
      }
    }
    throw new Error(msg);
  }
  return res.json();
}

/** wrapper used by signup / login to make sure keys exist */
//export const ensureKeys = (user_id) => post("/api/keys/generate", { user_id });
