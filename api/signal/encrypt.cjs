// Import createClient using require as this is a CJS file
const { createClient } = require("@supabase/supabase-js");
// Import Buffer using require
const { Buffer } = require("node:buffer");
// Import process using require
const process = require("node:process");
// Use require for the Signal library
const SignalClient = require("@signalapp/libsignal-client");

// --- Base64 Helpers ---
function base64ToArrayBuffer(base64) {
  const binary_string = Buffer.from(base64, "base64").toString("binary");
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}
function arrayBufferToBase64(buffer) {
  return Buffer.from(buffer).toString("base64");
}
function decodePreKeyBundle(bundle) {
  // ... (Implementation remains the same) ...
}
// --- End Helpers ---

// --- Supabase Client Initialization ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase;
if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error("API/encrypt: Supabase URL or Service Role Key missing.");
} else {
  try {
    supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    console.log("API/encrypt: Supabase client initialized.");
  } catch (error) {
    console.error("API/encrypt: Error initializing Supabase client:", error);
    supabase = null;
  }
}
// --- End Supabase Init ---

// Use module.exports for CJS file
module.exports = async (req, res) => {
  // Check if SignalClient loaded correctly (it should have loaded synchronously with require)
  if (!SignalClient?.SignalProtocolAddress) {
    console.error(
      "API/encrypt: Failed to load SignalClient library via require."
    );
    // Use res.status().json() for CJS handler
    return res
      .status(500)
      .json({ message: "Server internal error: Library load failure." });
  }

  if (!supabase) {
    return res
      .status(500)
      .json({
        message: "Server configuration error: Database connection failed.",
      });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res
      .status(405)
      .json({ message: `Method ${req.method} Not Allowed` });
  }

  // --- TODO: Proper Sender Authentication ---
  const senderId = req.body.senderId;
  if (!senderId) {
    return res.status(400).json({ message: "Missing senderId" });
  }
  const senderAddress = new SignalClient.SignalProtocolAddress(senderId, 1);
  // --- End TODO ---

  const { recipientId, plaintext } = req.body;

  if (!recipientId || typeof plaintext !== "string") {
    return res
      .status(400)
      .json({
        message:
          "Bad Request: recipientId and plaintext (string) are required.",
      });
  }

  const recipientAddress = new SignalClient.SignalProtocolAddress(
    recipientId,
    1
  );

  console.log(
    `API/encrypt: Request from ${senderId} to encrypt for ${recipientId}`
  );

  try {
    // --- TODO: Secure State Loading ---
    const senderStore = new SignalClient.InMemorySignalProtocolStore();
    console.warn(
      `API/encrypt: WARNING - Using temporary in-memory store for sender ${senderId}. Keys are not persisted or secure.`
    );
    // --- End TODO ---

    const sessionExists = await senderStore.loadSession(
      recipientAddress.toString()
    );

    if (!sessionExists) {
      console.log(
        `API/encrypt: No session for ${recipientAddress}, fetching bundle...`
      );
      const { data: bundleData, error: bundleError, status } = await supabase;
      // ... (bundle fetching remains the same) ...

      const decodedBundle = decodePreKeyBundle(bundleData.prekey_bundle);
      if (!decodedBundle) {
        return res
          .status(500)
          .json({ message: "Failed to decode recipient bundle." });
      }

      const sessionBuilder = new SignalClient.SessionBuilder(
        senderStore,
        senderAddress
      );
      // ... (identity key check placeholder remains the same) ...
      await sessionBuilder.processPreKeyBundle(recipientAddress, decodedBundle);
      console.log(`API/encrypt: Session established with ${recipientAddress}.`);
    }

    const sessionCipher = new SignalClient.SessionCipher(
      senderStore,
      senderAddress
    );
    const messageBuffer = Buffer.from(plaintext, "utf8");

    const ciphertext = await sessionCipher.encrypt(
      recipientAddress,
      messageBuffer
    );
    console.log(`API/encrypt: Encryption complete. Type: ${ciphertext.type}`);

    const responsePayload = {
      type: ciphertext.type,
      body: arrayBufferToBase64(ciphertext.body),
    };

    return res.status(200).json(responsePayload);
  } catch (error) {
    // ... (error handling remains the same, adjusted for potential new errors) ...
    console.error(
      `API/encrypt: Unexpected error for ${senderId} -> ${recipientId}:`,
      error
    );
    // Add specific check for potential new errors if needed
    if (error.message?.includes("own identity key")) {
      // Example check
      console.error(
        "API/encrypt: Encryption failed due to missing sender identity key in store."
      );
      return res
        .status(500)
        .json({
          message:
            "Internal Server Error: Sender identity configuration problem.",
        });
    }
    // Generic error
    return res
      .status(500)
      .json({ message: "Internal Server Error during encryption." });
  }
};
