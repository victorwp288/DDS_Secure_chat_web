import { createClient } from "@supabase/supabase-js";
import {
  SignalProtocolAddress,
  SessionBuilder,
  SessionCipher,
  InMemorySignalProtocolStore, // We'll use this for temporary in-memory state
} from "@signalapp/libsignal-client";

// --- Base64 Helpers (needed for decoding fetched bundle) ---
// (Simplified: Assuming these exist or are copied from elsewhere if needed)
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
  // ... (Implementation similar to frontend, but using Node Buffer potentially)
  if (!bundle) return null;
  try {
    return {
      registrationId: bundle.registrationId,
      identityKey: base64ToArrayBuffer(bundle.identityKey),
      signedPreKey: {
        keyId: bundle.signedPreKeyId,
        publicKey: base64ToArrayBuffer(bundle.signedPreKeyPublicKey),
        signature: base64ToArrayBuffer(bundle.signedPreKeySignature),
      },
      preKey:
        bundle.preKeyId !== undefined && bundle.preKeyPublicKey !== undefined
          ? {
              keyId: bundle.preKeyId,
              publicKey: base64ToArrayBuffer(bundle.preKeyPublicKey),
            }
          : undefined,
    };
  } catch (error) {
    console.error("API/encrypt: Failed to decode pre-key bundle:", error);
    return null;
  }
}
// --- End Helpers ---

// --- Supabase Client Initialization ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error("API/encrypt: Supabase URL or Service Role Key missing.");
}

let supabase;
try {
  supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  console.log("API/encrypt: Supabase client initialized.");
} catch (error) {
  console.error("API/encrypt: Error initializing Supabase client:", error);
  supabase = null;
}
// --- End Supabase Init ---

export default async function handler(req, res) {
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
  // Use Authorization header (Bearer token) to get sender's user ID
  // const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  // if (authError || !user) { return res.status(401).json({ message: 'Unauthorized' }); }
  // const senderId = user.id;
  const senderId = req.body.senderId; // TEMPORARY: Get senderId from body for now
  if (!senderId) {
    return res.status(400).json({ message: "Missing senderId" });
  }
  const senderAddress = new SignalProtocolAddress(senderId, 1);
  // --- End TODO ---

  const { recipientId, plaintext } = req.body;

  if (!recipientId || typeof plaintext !== "string") {
    return res.status(400).json({
      message: "Bad Request: recipientId and plaintext (string) are required.",
    });
  }

  const recipientAddress = new SignalProtocolAddress(recipientId, 1); // Assume device 1

  console.log(
    `API/encrypt: Request from ${senderId} to encrypt for ${recipientId}`
  );

  try {
    // --- TODO: Secure State Loading ---
    // 1. Receive sender's ENCRYPTED state blob and DERIVED symmetric key from client request.
    // 2. Decrypt the state blob IN MEMORY using the derived key.
    // 3. Load the decrypted state (identity key, registration id, sessions etc.) into the store.
    // For now, we simulate by creating a TEMPORARY in-memory store.
    // THIS IS INSECURE FOR PRODUCTION - KEYS ARE EPHEMERAL.
    const senderStore = new InMemorySignalProtocolStore();
    // In a real scenario, you'd load the DECRYPTED keys here:
    // e.g., await senderStore.storeIdentityKeyPair(decryptedIdentityKeyPair);
    //      await senderStore.storeLocalRegistrationId(decryptedRegistrationId);
    //      // ... load sessions etc.
    console.warn(
      `API/encrypt: WARNING - Using temporary in-memory store for sender ${senderId}. Keys are not persisted or secure.`
    );
    // --- End TODO ---

    // Check if session exists (in our temporary store)
    const sessionExists = await senderStore.loadSession(
      recipientAddress.toString()
    );

    if (!sessionExists) {
      console.log(
        `API/encrypt: No session for ${recipientAddress}, fetching bundle...`
      );
      // Fetch recipient's bundle from Supabase
      const {
        data: bundleData,
        error: bundleError,
        status,
      } = await supabase
        .from("encryption_keys")
        .select("prekey_bundle")
        .eq("profile_id", recipientId)
        .maybeSingle();

      if (bundleError) {
        console.error(
          `API/encrypt: Supabase bundle fetch error for ${recipientId}:`,
          bundleError
        );
        return res
          .status(status || 500)
          .json({ message: `Database error: ${bundleError.message}` });
      }
      if (!bundleData?.prekey_bundle) {
        console.log(`API/encrypt: Bundle not found for ${recipientId}`);
        return res
          .status(404)
          .json({ message: "Recipient key bundle not found." });
      }

      const decodedBundle = decodePreKeyBundle(bundleData.prekey_bundle);
      if (!decodedBundle) {
        return res
          .status(500)
          .json({ message: "Failed to decode recipient bundle." });
      }

      // Process the bundle using the sender's (temporary) store
      const sessionBuilder = new SessionBuilder(senderStore, senderAddress);
      await sessionBuilder.processPreKeyBundle(recipientAddress, decodedBundle);
      console.log(`API/encrypt: Session established with ${recipientAddress}.`);
      // Note: The session state is now only in senderStore (memory) for this request.
      // In the secure model, the client would need to re-encrypt and store this updated state.
    }

    // Encrypt the message
    const sessionCipher = new SessionCipher(senderStore, senderAddress);
    const messageBuffer = Buffer.from(plaintext, "utf8"); // Use Buffer for Node.js

    const ciphertext = await sessionCipher.encrypt(
      recipientAddress,
      messageBuffer
    );
    console.log(`API/encrypt: Encryption complete. Type: ${ciphertext.type}`);

    const responsePayload = {
      type: ciphertext.type,
      body: arrayBufferToBase64(ciphertext.body), // Ensure body is Base64 encoded
    };

    // IMPORTANT: Discard the in-memory store and decrypted state here.
    // senderStore = null; // (Implicitly done when function exits)

    return res.status(200).json(responsePayload);
  } catch (error) {
    console.error(
      `API/encrypt: Unexpected error for ${senderId} -> ${recipientId}:`,
      error
    );
    // Avoid leaking specific internal errors
    if (error.message?.includes("Recipient key bundle not found")) {
      return res.status(404).json({ message: error.message });
    }
    if (error.message?.includes("decode recipient bundle")) {
      return res.status(500).json({ message: error.message });
    }
    // Generic error for others
    return res
      .status(500)
      .json({ message: "Internal Server Error during encryption." });
  }
}
