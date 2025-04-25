import * as signal from "@privacyresearch/libsignal-protocol-typescript";
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

// --- End Helpers ---

// Global store instance (consider scoping if needed)
// const store = new IndexedDBStore(); // Removed as signalStore is imported and used

/**
 * Generates a new set of Signal Protocol keys for a user.
 * This includes an Identity Key pair, a Signed PreKey pair, and a batch of One-Time PreKeys.
 *
 * @returns {Promise<object>} An object containing the generated keys and the serialized preKeyBundle.
 * @throws {Error} If key generation fails.
 */
export const generateSignalKeys = async () => {
  try {
    console.log("Generating Signal keys...");

    // 1. Generate Identity Key Pair
    const identityKeyPair = await signal.KeyHelper.generateIdentityKeyPair();
    console.log("Identity Key Pair generated.");

    // 2. Generate Registration ID
    const registrationId = await signal.KeyHelper.generateRegistrationId();
    console.log("Registration ID generated:", registrationId);

    // 3. Generate Signed PreKey Pair
    // The keyId needs to be unique within the user's signed prekeys (e.g., timestamp or counter)
    const signedPreKeyId = Date.now(); // Using timestamp for simplicity, consider a more robust approach
    const signedPreKeyKeyPair = await signal.KeyHelper.generateSignedPreKey(
      identityKeyPair,
      signedPreKeyId
    );
    console.log("Signed PreKey Pair generated:", signedPreKeyId);

    // 4. Generate One-Time PreKeys (e.g., 100)
    const oneTimePreKeys = [];
    // Libsignal needs key IDs starting from 1 for one-time keys
    // Store the highest ID used for future batches.
    const baseId = 1; // Start IDs from 1
    for (let i = 0; i < 100; i++) {
      const keyId = baseId + i;
      const preKey = await signal.KeyHelper.generatePreKey(keyId);
      oneTimePreKeys.push(preKey);
    }
    console.log(`Generated ${oneTimePreKeys.length} One-Time PreKeys.`);

    // 5. Create the PreKey Bundle
    // This bundle is what others will fetch to initiate a session with this user.
    // It needs the public parts of the keys.
    const preKeyBundle = {
      registrationId: registrationId,
      identityKey: identityKeyPair.pubKey,
      signedPreKey: {
        keyId: signedPreKeyId,
        publicKey: signedPreKeyKeyPair.keyPair.pubKey,
        signature: signedPreKeyKeyPair.signature,
      },
      // We only include the public part of one-time prekeys in the bundle usually.
      // However, the setup often requires the server *storing* the private keys too,
      // associated with their IDs, so the user can retrieve them when needed.
      // For simplicity here, the bundle might just signal availability.
      // The server-side logic would manage delivering one-time keys securely.
      // Let's serialize the *public* one-time keys for the bundle structure.
      preKeys: oneTimePreKeys.map((p) => ({
        keyId: p.keyId,
        publicKey: p.keyPair.pubKey,
      })),
    };

    console.log("PreKey Bundle prepared (public parts).");

    // 6. Return all necessary parts (including private keys for storage)
    return {
      identityKeyPair, // Includes private key
      registrationId,
      signedPreKeyKeyPair, // Return the whole signedPreKey object { keyId, keyPair, signature }
      oneTimePreKeys, // Array of { keyId, keyPair } including private keys
      preKeyBundle, // The public bundle for sharing
    };
  } catch (error) {
    console.error("Error generating Signal keys:", error);
    throw new Error("Failed to generate Signal keys.");
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
    console.log(`Storing pre-key bundle for profile: ${profileId}`);
    const serializedBundle = JSON.stringify(preKeyBundle, (key, value) => {
      if (value instanceof ArrayBuffer) {
        return arrayBufferToBase64(value);
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
  if (!recipientId) {
    throw new Error("Recipient ID is required to establish a session.");
  }

  const address = new signal.SignalProtocolAddress(recipientId, deviceId);
  const addressString = address.toString();
  console.log(`[establishSession] Attempting for: ${addressString}`);

  // Remove the check for existing session to ensure we always process the bundle
  // const existingSession = await signalStore.loadSession(addressString);
  // if (existingSession) {
  //   console.log(`Session already exists for ${addressString}. Re-processing bundle anyway.`);
  //   // return; // Don't return early
  // }

  console.log(
    `[establishSession] Fetching pre-key bundle for ${addressString}...`
  );

  // 1. Fetch Recipient's PreKey Bundle
  const bundle = await getPreKeyBundle(recipientId);
  if (!bundle) {
    throw new Error(
      `[establishSession] Could not find pre-key bundle for recipient ${recipientId}. User may not exist or hasn't generated keys.`
    );
  }
  // --- Log the bundle structure ---
  console.log(
    `[establishSession] Pre-key bundle fetched for ${recipientId}. Structure:`,
    JSON.stringify(serializeBuffers(bundle)) // Log serializable form
  );
  // --- End Log ---

  // 2. Build Session (Always attempt)
  const sessionBuilder = new signal.SessionBuilder(signalStore, address);

  try {
    console.log(
      `[establishSession] Processing pre-key bundle with sessionBuilder for ${addressString}...`
    );
    // --- Log before processPreKey ---
    const existingSessionBefore = await signalStore.loadSession(addressString);
    console.log(
      `[establishSession] Session state BEFORE processPreKey for ${addressString}:`,
      existingSessionBefore
        ? JSON.stringify(serializeBuffers(existingSessionBefore))
        : "null"
    );
    // --- End Log ---
    await sessionBuilder.processPreKey(bundle);
    // --- Log after processPreKey ---
    const existingSessionAfter = await signalStore.loadSession(addressString);
    console.log(
      `[establishSession] Session state AFTER processPreKey for ${addressString}:`,
      existingSessionAfter
        ? JSON.stringify(serializeBuffers(existingSessionAfter))
        : "null"
    );
    // --- End Log ---
    console.log(
      `[establishSession] Session successfully established/updated and stored for ${addressString}.`
    );
  } catch (error) {
    console.error(
      `[establishSession] Error processing pre-key bundle for ${addressString}:`,
      error
    );
    throw new Error(
      `[establishSession] Failed to establish session with ${recipientId}: ${error.message}`
    );
  }
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
  if (!recipientId || typeof plaintext !== "string") {
    throw new Error("Recipient ID and plaintext message are required.");
  }
  const address = new signal.SignalProtocolAddress(recipientId, deviceId);
  const sessionCipher = new signal.SessionCipher(signalStore, address);
  try {
    const plaintextBuffer = new TextEncoder().encode(plaintext).buffer;
    console.log(
      `Encrypting plaintext (length ${plaintextBuffer.byteLength})...`
    );
    const ciphertext = await sessionCipher.encrypt(plaintextBuffer);

    // --- Log and Encode Body ---
    console.log(
      "DEBUG: Raw Ciphertext Body Type:",
      typeof ciphertext.body,
      ciphertext.body instanceof ArrayBuffer
    );
    const encodedBody = arrayBufferToBase64(ciphertext.body);
    // --- End Log and Encode ---

    return {
      type: ciphertext.type,
      body: encodedBody,
    };
  } catch (error) {
    console.error(`Error encrypting message for ${address.toString()}:`, error);
    throw new Error(`Encryption failed for ${recipientId}: ${error.message}`);
  }
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
  if (
    !senderId ||
    !ciphertext ||
    typeof ciphertext.body !== "string" ||
    typeof ciphertext.type !== "number"
  ) {
    throw new Error(
      "[decryptMessage] Sender ID and ciphertext object {type, body} are required."
    );
  }
  const address = new signal.SignalProtocolAddress(senderId, deviceId);
  const addressString = address.toString();
  console.log(
    `[decryptMessage] Attempting decryption for sender ${addressString}. Type: ${ciphertext.type}, Body Length (Base64): ${ciphertext.body.length}`
  );

  // --- Log loaded session state ---
  let sessionBeforeDecryption;
  try {
    sessionBeforeDecryption = await signalStore.loadSession(addressString);
    console.log(
      `[decryptMessage] Session state BEFORE decryption for ${addressString}:`,
      sessionBeforeDecryption
        ? JSON.stringify(serializeBuffers(sessionBeforeDecryption))
        : "null"
    );
  } catch (loadErr) {
    console.error(
      `[decryptMessage] CRITICAL: Failed to load session state for ${addressString} before decryption:`,
      loadErr
    );
    throw new Error(
      `[decryptMessage] Cannot decrypt, failed to load session state: ${loadErr.message}`
    );
  }
  // --- End Log ---

  const sessionCipher = new signal.SessionCipher(signalStore, address);
  let plaintextBuffer;
  try {
    // --- Decode Body ---
    const ciphertextBodyBuffer = base64ToArrayBuffer(ciphertext.body);
    // --- End Decode ---

    if (ciphertext.type === 3) {
      // --- Log before PreKey decrypt ---
      console.log(
        `[decryptMessage] Calling decryptPreKeyWhisperMessage (length ${ciphertextBodyBuffer.byteLength}) for ${addressString}...`
      );
      // --- End Log ---
      plaintextBuffer = await sessionCipher.decryptPreKeyWhisperMessage(
        ciphertextBodyBuffer
      );
    } else if (ciphertext.type === 1) {
      // --- Log before Whisper decrypt ---
      console.log(
        `[decryptMessage] Calling decryptWhisperMessage (length ${ciphertextBodyBuffer.byteLength}) for ${addressString}...`
      );
      // --- End Log ---
      plaintextBuffer = await sessionCipher.decryptWhisperMessage(
        ciphertextBodyBuffer
      );
    } else {
      throw new Error(
        `[decryptMessage] Unknown ciphertext type: ${ciphertext.type}`
      );
    }

    // --- Log session state AFTER successful decryption ---
    try {
      const sessionAfterDecryption = await signalStore.loadSession(
        addressString
      );
      console.log(
        `[decryptMessage] Session state AFTER successful decryption for ${addressString}:`,
        sessionAfterDecryption
          ? JSON.stringify(serializeBuffers(sessionAfterDecryption))
          : "null"
      );
    } catch (loadErr) {
      console.warn(
        `[decryptMessage] Failed to load session state after successful decryption for ${addressString}:`,
        loadErr
      );
    }
    // --- End Log ---

    // Use TextDecoder
    const plaintext = new TextDecoder().decode(plaintextBuffer);
    console.log(
      `[decryptMessage] Decrypted plaintext length: ${plaintext.length}`
    );
    return plaintext;
  } catch (error) {
    // --- Log session state AFTER FAILED decryption ---
    try {
      const sessionAfterFailedDecryption = await signalStore.loadSession(
        addressString
      );
      console.error(
        `[decryptMessage] Session state AFTER FAILED decryption for ${addressString}:`,
        sessionAfterFailedDecryption
          ? JSON.stringify(serializeBuffers(sessionAfterFailedDecryption))
          : "null"
      );
    } catch (loadErr) {
      console.error(
        `[decryptMessage] Failed to load session state after failed decryption for ${addressString}:`,
        loadErr
      );
    }
    // --- End Log ---
    console.error(
      `[Decrypt Error Detail] Error decrypting message from ${address.toString()}:`,
      error
    );
    console.error(
      `Error decrypting message from ${address.toString()}:`,
      error
    );
    throw new Error(`Decryption failed for ${senderId}: ${error.message}`);
  }
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
