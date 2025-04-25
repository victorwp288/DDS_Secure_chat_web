import { createClient } from "@supabase/supabase-js";
// NOTE: SignalClient is loaded dynamically inside the handler now

// --- Base64 Helpers (needed for decoding fetched bundle) ---
// ... (helpers remain the same) ...
// --- End Helpers ---

// --- Supabase Client Initialization ---
// ... (Supabase init remains the same) ...
// --- End Supabase Init ---

export default async function handler(req, res) {
  // Load CJS module dynamically inside ESM handler
  const SignalClient = (await import("@signalapp/libsignal-client")).default;
  // Add a check in case the dynamic import somehow fails
  if (!SignalClient?.SignalProtocolAddress) {
    console.error(
      "API/encrypt: Failed to dynamically load SignalClient library."
    );
    return res
      .status(500)
      .json({ message: "Server internal error: Library load failure." });
  }

  if (!supabase) {
    return res.status(500).json({ message: "Server configuration error." });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res
      .status(405)
      .json({ message: `Method ${req.method} Not Allowed` });
  }

  // --- TODO: Proper Sender Authentication ---
  // ... (Authentication logic remains the same) ...
  const senderId = req.body.senderId; // TEMPORARY: Get senderId from body for now
  if (!senderId) {
    return res.status(400).json({ message: "Missing senderId" });
  }
  const senderAddress = new SignalClient.SignalProtocolAddress(senderId, 1);
  // --- End TODO ---

  const { recipientId, plaintext } = req.body;

  if (!recipientId || typeof plaintext !== "string") {
    return res.status(400).json({
      message: "Bad Request: recipientId and plaintext (string) are required.",
    });
  }

  const recipientAddress = new SignalClient.SignalProtocolAddress(
    recipientId,
    1
  ); // Assume device 1

  console.log(
    `API/encrypt: Request from ${senderId} to encrypt for ${recipientId}`
  );

  try {
    // --- TODO: Secure State Loading ---
    // ... (comments remain the same) ...
    const senderStore = new SignalClient.InMemorySignalProtocolStore();
    // ... (comments and warning remain the same) ...
    // --- End TODO ---

    // ... (rest of the logic: session check, bundle fetch, encrypt, etc. remains the same,
    //      using SignalClient.ClassName as needed) ...

    const responsePayload = {
      type: ciphertext.type,
      body: arrayBufferToBase64(ciphertext.body), // Ensure body is Base64 encoded
    };

    return res.status(200).json(responsePayload);
  } catch (error) {
    // ... (error handling remains the same) ...
  }
}
