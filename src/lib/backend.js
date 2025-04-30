const API = import.meta.env.VITE_BACKEND_URL 

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

/** wrapper used by signup / login to make sure keys exist */
export const ensureKeys = (user_id) => post("/api/keys/generate", { user_id });
