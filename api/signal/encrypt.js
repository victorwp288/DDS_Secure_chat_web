import { createClient } from "@supabase/supabase-js";
import { Buffer } from "node:buffer";
import process from "node:process";
// NOTE: SignalClient is loaded dynamically inside the handler now

// --- Base64 Helpers (needed for decoding fetched bundle) ---
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

let supabase;
if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error("API/encrypt: Supabase URL or Service Role Key missing.");
  // Allow handler to return error without crashing container
} else {
  try {
    supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    console.log("API/encrypt: Supabase client initialized.");
  } catch (error) {
    console.error("API/encrypt: Error initializing Supabase client:", error);
    supabase = null; // Ensure it's null on error
  }
}
// --- End Supabase Init ---

export default async function handler(req, res) {
  // Load CJS module dynamically inside ESM handler
  const SignalClient = await import("@signalapp/libsignal-client");

  // Check if the import worked and has expected properties
  if (!SignalClient?.SignalProtocolAddress) {
    console.error(
      "API/encrypt: Failed to dynamically load SignalClient library correctly."
    );
    return res
      .status(500)
      .json({ message: "Server internal error: Library load failure." });
  }

  if (!supabase) {
    // Handle case where Supabase client failed to initialize earlier
    return res.status(500).json({
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
  // Use Authorization header (Bearer token) to get sender's user ID
  // const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  // if (authError || !user) { return res.status(401).json({ message: 'Unauthorized' }); }
  // const senderId = user.id;
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
    // 1. Receive sender's ENCRYPTED state blob and DERIVED symmetric key from client request.
    // 2. Decrypt the state blob IN MEMORY using the derived key.
    // 3. Load the decrypted state (identity key, registration id, sessions etc.) into the store.
    // For now, we simulate by creating a TEMPORARY in-memory store.
    // THIS IS INSECURE FOR PRODUCTION - KEYS ARE EPHEMERAL.
    const senderStore = new SignalClient.InMemorySignalProtocolStore();
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
      const sessionBuilder = new SignalClient.SessionBuilder(
        senderStore,
        senderAddress
      );
      // Ensure identity key exists in store before processing bundle (even if temporary)
      // In the real implementation, this would be part of the loaded decrypted state.
      if (!(await senderStore.getIdentityKeyPair())) {
        console.warn(
          "API/encrypt: No identity key in temp store, cannot process bundle!"
        );
        // For the simulation to proceed, we might need to generate a dummy one,
        // but this highlights the dependency on loaded state.
        // return res.status(500).json({ message: 'Internal error: Sender identity missing.' });
      }
      await sessionBuilder.processPreKeyBundle(recipientAddress, decodedBundle);
      console.log(`API/encrypt: Session established with ${recipientAddress}.`);
      // Note: The session state is now only in senderStore (memory) for this request.
      // In the secure model, the client would need to re-encrypt and store this updated state.
    }

    // Encrypt the message
    const sessionCipher = new SignalClient.SessionCipher(
      senderStore,
      senderAddress
    );
    const messageBuffer = Buffer.from(plaintext, "utf8"); // Use imported Buffer

    const ciphertext = await sessionCipher.encrypt(
      recipientAddress,
      messageBuffer
    );
    console.log(`API/encrypt: Encryption complete. Type: ${ciphertext.type}`);

    const responsePayload = {
      type: ciphertext.type,
      body: arrayBufferToBase64(ciphertext.body), // arrayBufferToBase64 uses Buffer internally
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
    if (error.message?.includes("Sender identity missing")) {
      return res.status(500).json({ message: error.message });
    }
    // Add specific check for identity key error during processPreKeyBundle
    if (
      error.message?.includes("Identity key changed") ||
      error.message?.includes("Unregistered user")
    ) {
      console.warn(
        `API/encrypt: Identity key issue during session establishment: ${error.message}`
      );
      return res
        .status(400)
        .json({ message: `Session conflict: ${error.message}` }); // Use 400 for client-fixable session issues
    }
    if (error.message?.includes("own identity key")) {
      // Error from encrypting without identity
      console.error(
        "API/encrypt: Encryption failed due to missing sender identity key in store."
      );
      return res.status(500).json({
        message:
          "Internal Server Error: Sender identity configuration problem.",
      });
    }
    // Generic error for others
    return res
      .status(500)
      .json({ message: "Internal Server Error during encryption." });
  }
}
