// import * as signal from "@privacyresearch/libsignal-protocol-typescript"; // OLD LIBRARY
import * as signal from "@signalapp/libsignal-client"; // NEW LIBRARY
import { supabase } from "./supabaseClient";
import { IndexedDBStore, signalStore } from "./localDb"; // Import CLASS and INSTANCE

// --- Base64 & Serialization Helpers ---
// Needed for logging complex objects with ArrayBuffers
function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary_string = atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

// Simple serialization for logging, may not handle all edge cases like the one in localDb
function serializeBuffers(obj) {
  if (!obj) return obj;
  if (obj instanceof ArrayBuffer) {
    return { __type: "ArrayBuffer", data: arrayBufferToBase64(obj) };
  }
  if (typeof obj === "object") {
    const newObj = Array.isArray(obj) ? [] : {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        newObj[key] = serializeBuffers(obj[key]); // Recursive call
      }
    }
    return newObj;
  }
  return obj;
}

function deserializeBuffers(obj) {
  if (!obj) return obj;
  if (obj instanceof ArrayBuffer) {
    return base64ToArrayBuffer(obj.data);
  }
  if (typeof obj === "object") {
    const newObj = Array.isArray(obj) ? [] : {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        newObj[key] = deserializeBuffers(obj[key]); // Recursive call
      }
    }
    return newObj;
  }
  return obj;
}

// --- End Helpers ---

// Global store instance (consider scoping if needed)
// const store = new IndexedDBStore(); // Removed as signalStore is imported and used

// --- Library Initialization (Potential Requirement for WASM) ---
// TODO: Check if signal.init() or similar is needed and where to call it.
// Might need an async function that ensures initialization before use.
let isSignalInitialized = false;
async function ensureSignalInitialized() {
  if (isSignalInitialized) return;
  // Assuming an init function exists, adjust as necessary
  // await signal.init();
  isSignalInitialized = true;
  console.log("Signal WASM Library Initialized (Placeholder)");
}
// --- End Initialization ---

/**
 * Generates a new set of Signal Protocol keys for a user using @signalapp/libsignal-client.
 * NOTE: The API details here are speculative and need verification.
 */
export const generateSignalKeys = async () => {
  // await ensureSignalInitialized(); // Ensure WASM is ready
  try {
    console.log("Generating Signal keys using @signalapp/libsignal-client...");

    // --- API Calls below are speculative based on common patterns ---

    // 1. Generate Identity Key Pair
    // The new library might have a different KeyHelper or factory method.
    // Example: const identityKeyPair = await signal.IdentityKeyPair.generate();
    const identityKeyPair = await signal.protocol.IdentityKeyPair.generate();
    console.log("Identity Key Pair generated.");

    // 2. Generate Registration ID (might be done differently or not needed explicitly)
    // Example: const registrationId = signal.RegistrationId.generate();
    const registrationId = signal.protocol.RegistrationId.generate();
    console.log("Registration ID generated:", registrationId);

    // 3. Generate Signed PreKey Pair
    const signedPreKeyId = Date.now(); // Or a counter from store
    // Example: const signedPreKey = await signal.SignedPreKey.generate(identityKeyPair, signedPreKeyId);
    // It likely returns an object containing { id, keyPair, signature }
    const signedPreKeyRecord = await signal.protocol.SignedPreKeyRecord.new(
      signedPreKeyId,
      identityKeyPair
    );
    console.log("Signed PreKey generated:", signedPreKeyId);

    // 4. Generate One-Time PreKeys (e.g., 100)
    // Example: const oneTimePreKeys = await signal.PreKey.generateBatch(1, 100);
    const oneTimePreKeys = await signal.protocol.PreKeyRecord.generate(100);
    console.log(`Generated ${oneTimePreKeys.length} One-Time PreKeys.`);

    // 5. Create the PreKey Bundle (API might differ)
    // Example: const bundle = new signal.PreKeyBundle(registrationId, deviceId, preKeyId, preKeyPublic, signedPreKeyId, signedPreKeyPublic, signature, identityKey);
    // The new library might have a builder or assemble it differently.
    // We need: registrationId, identityKey (public), signedPreKey (public+sig), one *single* preKey (public)
    // The concept of a bundle might be handled differently, maybe fetched piece by piece?
    // For now, let's assemble what we *think* we need based on the old structure.

    // Find one preKey to include in the bundle (often the one with the highest ID)
    const bundlePreKey = oneTimePreKeys[oneTimePreKeys.length - 1]; // Just picking the last one

    const preKeyBundle = {
      registrationId: registrationId, // Assuming this is a usable value (number?)
      identityKey: identityKeyPair.getPublicKey().serialize(), // Assuming method to get public & serialize
      signedPreKey: {
        keyId: signedPreKeyRecord.getId(), // Assuming getId()
        publicKey: signedPreKeyRecord.getKeyPair().getPublicKey().serialize(), // Assuming nested structure
        signature: signedPreKeyRecord.getSignature(), // Assuming getSignature()
      },
      preKey: {
        keyId: bundlePreKey.getId(), // Assuming getId()
        publicKey: bundlePreKey.getKeyPair().getPublicKey().serialize(), // Assuming nested structure
      },
    };

    console.log("PreKey Bundle prepared (speculative API).");

    // 6. Return necessary parts (adjust based on actual library objects)
    // The actual objects returned by the library might be needed for storing locally.
    return {
      identityKeyPair, // The actual library object
      registrationId, // The actual library object/value
      signedPreKeyRecord, // The actual library object
      oneTimePreKeys, // Array of actual library objects
      preKeyBundle, // The assembled public bundle (might need adjustment)
    };
  } catch (error) {
    console.error("Error generating Signal keys with new library:", error);
    throw new Error(
      "Failed to generate Signal keys (new library). Check console for details."
    );
  }
};

/**
 * Stores the user's generated pre-key bundle in Supabase.
 * NOTE: This currently stores the PUBLIC bundle. Secure storage of
 * the full key material (identity private key, pre-key private keys)
 * needs careful consideration (e.g., encrypted storage or local-only).
 * This function is a placeholder for storing the *public* bundle needed by others.
 *
 * @param {string} profileId - The user's profile ID.
 * @param {object} preKeyBundle - The public pre-key bundle generated by generateSignalKeys.
 * @returns {Promise<void>}
 * @throws {Error} If storing the bundle fails.
 */
export const storePreKeyBundle = async (profileId, preKeyBundle) => {
  if (!profileId || !preKeyBundle) {
    throw new Error("Profile ID and preKeyBundle are required.");
  }
  try {
    console.log(
      `Storing pre-key bundle for profile: ${profileId} (new library format)`
    );
    // IMPORTANT: Serialization needs review. The bundle contains ArrayBuffers
    // which need Base64 encoding for JSON storage.
    const serializedBundle = JSON.stringify(preKeyBundle, (key, value) => {
      // This simple check might fail if library uses Uint8Array or custom Buffer types
      if (value instanceof ArrayBuffer || value instanceof Uint8Array) {
        return arrayBufferToBase64(value); // Assuming this helper works
      }
      return value;
    });

    console.log("DEBUG: Storing this JSON string:", serializedBundle);

    const { data, error } = await supabase
      .from("encryption_keys")
      .upsert(
        { profile_id: profileId, prekey_bundle: serializedBundle },
        { onConflict: "profile_id" }
      )
      .select();
    if (error) throw error;
    console.log("Pre-key bundle stored successfully:", data);
  } catch (error) {
    console.error("Failed to store pre-key bundle:", error);
    throw new Error("Could not store pre-key bundle.");
  }
};

/**
 * Retrieves and deserializes a user's pre-key bundle from Supabase.
 *
 * @param {string} profileId - The profile ID of the user whose bundle is needed.
 * @returns {Promise<object|null>} The deserialized pre-key bundle, or null if not found.
 * @throws {Error} If fetching or parsing fails.
 */
export const getPreKeyBundle = async (profileId) => {
  if (!profileId) {
    throw new Error("Profile ID is required to fetch a pre-key bundle.");
  }

  try {
    console.log(`Fetching pre-key bundle for profile: ${profileId}`);
    const { data, error } = await supabase
      .from("encryption_keys")
      .select("prekey_bundle")
      .eq("profile_id", profileId)
      .single();
    if (error) {
      if (error.code === "PGRST116") {
        console.warn(`Pre-key bundle not found for profile: ${profileId}`);
        return null;
      }
      console.error("Error fetching pre-key bundle from Supabase:", error);
      throw error;
    }
    if (!data || !data.prekey_bundle) {
      console.warn(`Pre-key bundle data is missing for profile: ${profileId}`);
      return null;
    }

    console.log("Raw pre-key bundle fetched:", data.prekey_bundle);

    // Parse the JSON string
    let parsedBundle;
    try {
      parsedBundle = JSON.parse(data.prekey_bundle);
    } catch (parseError) {
      console.error("Error parsing pre-key bundle JSON:", parseError);
      throw new Error("Failed to parse pre-key bundle.");
    }

    // --- Manually Deserialize Specific Fields ---
    if (!parsedBundle || typeof parsedBundle !== "object") {
      throw new Error("Parsed bundle is not a valid object.");
    }

    // Helper to safely decode a field
    const decodeField = (fieldValue) => {
      if (typeof fieldValue === "string") {
        try {
          return base64ToArrayBuffer(fieldValue);
        } catch (e) {
          console.error(
            "Base64 decoding failed for field value:",
            fieldValue,
            e
          );
          throw new Error(
            `Invalid Base64 data encountered during bundle deserialization.`
          );
        }
      } else {
        console.error(
          "Expected string for Base64 decoding, got:",
          typeof fieldValue,
          fieldValue
        );
        throw new Error(
          `Invalid data type encountered during bundle deserialization (expected string).`
        );
      }
    };

    const finalBundle = {
      ...parsedBundle, // Copy other fields like registrationId
      identityKey: decodeField(parsedBundle.identityKey),
      signedPreKey: parsedBundle.signedPreKey
        ? {
            ...parsedBundle.signedPreKey, // Copy keyId
            publicKey: decodeField(parsedBundle.signedPreKey.publicKey),
            signature: decodeField(parsedBundle.signedPreKey.signature),
          }
        : undefined,
      // Also deserialize the one-time preKeys (if present in the bundle structure)
      preKeys: Array.isArray(parsedBundle.preKeys)
        ? parsedBundle.preKeys.map((pk) => ({
            ...pk, // Copy keyId
            publicKey: decodeField(pk.publicKey),
          }))
        : [], // Or handle if preKeys might be structured differently or optional
    };

    // Validate essential parts exist after deserialization
    if (
      !finalBundle.identityKey ||
      !finalBundle.signedPreKey ||
      !finalBundle.signedPreKey.publicKey ||
      !finalBundle.signedPreKey.signature
    ) {
      throw new Error(
        "PreKeyBundle missing essential keys after deserialization."
      );
    }

    // --- Log the final structure ---
    console.log("Deserialized pre-key bundle (manual):", finalBundle);

    return finalBundle;
  } catch (error) {
    console.error(`Failed to get pre-key bundle for ${profileId}:`, error);
    throw new Error(
      `Could not retrieve or process pre-key bundle for profile ${profileId}.`
    );
  }
};

/**
 * Establishes a Signal session with a recipient.
 * Fetches the recipient's pre-key bundle, builds the session, and stores it locally.
 *
 * @param {string} recipientId - The profile ID of the recipient.
 * @param {number} [deviceId=1] - The device ID of the recipient (defaults to 1).
 * @returns {Promise<void>} Resolves when the session is built and stored, rejects on error.
 * @throws {Error} If bundle not found, session build fails, or local keys are missing.
 */
export const establishSession = async (recipientId, deviceId = 1) => {
  // await ensureSignalInitialized();
  console.log(
    `[establishSession] Attempting for: ${recipientId}.${deviceId} (new library)`
  );
  // TODO: Rewrite using new library API
  // 1. Get recipient address object (e.g., signal.SignalProtocolAddress)
  // 2. Fetch and prepare preKeyBundle (using adjusted getPreKeyBundle)
  // 3. Instantiate SessionBuilder (e.g., signal.SessionBuilder)
  // 4. Call processPreKeyBundle (or equivalent method)
  // 5. Handle storage via signalStore (API might need changes in localDb.js)
  throw new Error("establishSession not implemented for new library yet.");
};

/**
 * Encrypts a message for a recipient using the established Signal session.
 *
 * @param {string} recipientId - The profile ID of the recipient.
 * @param {string} plaintext - The plaintext message to encrypt.
 * @param {number} [deviceId=1] - The device ID of the recipient (defaults to 1).
 * @returns {Promise<object>} The ciphertext object (containing type and body as Base64 string).
 * @throws {Error} If session not found or encryption fails.
 */
export const encryptMessage = async (recipientId, plaintext, deviceId = 1) => {
  // await ensureSignalInitialized();
  console.log(
    `[encryptMessage] Attempting for: ${recipientId}.${deviceId} (new library)`
  );
  // TODO: Rewrite using new library API
  // 1. Get recipient address object
  // 2. Instantiate SessionCipher (e.g., signal.SessionCipher)
  // 3. Call encrypt (input might be Uint8Array)
  // 4. Process result (ciphertext format might differ, ensure body is Base64 encoded for return)
  throw new Error("encryptMessage not implemented for new library yet.");
};

/**
 * Decrypts an incoming message using the established Signal session.
 *
 * @param {string} senderId - The profile ID of the message sender.
 * @param {object} ciphertext - The ciphertext object { type: number, body: string (Base64) }.
 * @param {number} [deviceId=1] - The device ID of the sender (defaults to 1).
 * @returns {Promise<string>} The decrypted plaintext message.
 * @throws {Error} If session not found, decryption fails (MAC error, etc.), or type is unknown.
 */
export const decryptMessage = async (senderId, ciphertext, deviceId = 1) => {
  // await ensureSignalInitialized();
  console.log(
    `[decryptMessage] Attempting for: ${senderId}.${deviceId} (new library)`
  );
  // TODO: Rewrite using new library API
  // 1. Get sender address object
  // 2. Instantiate SessionCipher
  // 3. Decode Base64 body from ciphertext.body
  // 4. Call decryptPreKeyWhisperMessage or decryptWhisperMessage based on ciphertext.type
  // 5. Return plaintext string
  throw new Error("decryptMessage not implemented for new library yet.");
};

// TODO: Add functions for:
// - Building a session (SessionBuilder)
// - Storing/Loading session state (locally, e.g., IndexedDB)
// - Encrypting a message
// - Decrypting a message (PreKeyMessage and regular Message)
// - Serializing/Deserializing keys and session state

// --- Base64 Helpers (Moved from localDb.js for potential reuse here, or keep central) ---
// Ensure these helpers are available, either imported or defined here/globally.
// Assuming they are imported or defined elsewhere for now.
// import { arrayBufferToBase64, base64ToArrayBuffer, serializeBuffers } from './utils'; // Example import
// Or copy them here if needed and not already present/imported:
// function arrayBufferToBase64(buffer) {
//   let binary = "";
//   const bytes = new Uint8Array(buffer);
//   const len = bytes.byteLength;
//   for (let i = 0; i < len; i++) {
//     binary += String.fromCharCode(bytes[i]);
//   }
//   return btoa(binary);
// }
//
// function base64ToArrayBuffer(base64) {
//   const binary_string = atob(base64);
//   const len = binary_string.length;
//   const bytes = new Uint8Array(len);
//   for (let i = 0; i < len; i++) {
//     bytes[i] = binary_string.charCodeAt(i);
//   }
//   return bytes.buffer;
// }
//
// function serializeBuffers(obj) {
//   if (!obj) return obj;
//   if (obj instanceof ArrayBuffer) {
//     return { __type: "ArrayBuffer", data: arrayBufferToBase64(obj) };
//   }
//   if (typeof obj === "object") {
//     const newObj = Array.isArray(obj) ? [] : {};
//     for (const key in obj) {
//       if (Object.prototype.hasOwnProperty.call(obj, key)) {
//         newObj[key] = serializeBuffers(obj[key]);
//       }
//     }
//     return newObj;
//   }
//   return obj;
// }

// --- End Base64 Helpers ---
