// api.js -----------------------------------------------------------
const API = "http://localhost:3001";

async function post(path, payload) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text(); // easier to read error
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

// exported high-level helpers
export const api = {
  genKeys: (user_id) => post("/api/keys/generate", { user_id }),
  initSess: (sender_id, recipient_id) =>
    post("/api/sessions/initiate", { sender_id, recipient_id }),
  encrypt: (sender_id, recipient_id, plaintext) =>
    post("/api/messages/encrypt", { sender_id, recipient_id, plaintext }),
  decrypt: (recipient_id, sender_id, header_b64, ciphertext_b64) =>
    post("/api/messages/decrypt", {
      recipient_id,
      sender_id,
      header_b64,
      ciphertext_b64,
    }),
};
