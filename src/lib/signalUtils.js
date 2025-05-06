"use strict";

import {
  KeyHelper,
  SignalProtocolAddress,
  SessionBuilder,
  SessionCipher,
  //setLogger,
} from "@privacyresearch/libsignal-protocol-typescript";
// import { get } from "./backend"; // Assuming backend.js is in the same directory or adjust path - REMOVED

// --- Enable Signal Library Debug Logging ---
// Uncomment the line below to see detailed logs from the Signal library itself
//setLogger(console.log);
// ---

/**
 * Represents the public key bundle needed to establish a session.
 * @typedef {import('@privacyresearch/libsignal-protocol-typescript').PreKeyBundleType<ArrayBuffer>} PreKeyBundleType
 */

/**
 * Represents the Signal Protocol store interface.
 * You must provide an object conforming to this interface.
 * @typedef {import('@privacyresearch/libsignal-protocol-typescript').SignalProtocolStore} SignalProtocolStore
 */

/**
 * Represents the encrypted message structure.
 * @typedef {import('@privacyresearch/libsignal-protocol-typescript').MessageType} MessageType
 */

/**
 * Generates a random key ID.
 * Note: In a real application, ensure these IDs are unique and managed appropriately.
 * @returns {number} A random integer for use as a key ID.
 */
const generateKeyId = () => Math.floor(9999 * Math.random()) + 1; // Ensure ID >= 1

/**
 * Initializes the Signal protocol state for a new user/device.
 * Generates identity keys, registration ID, and pre-keys, storing them in the provided store.
 * @param {SignalProtocolStore} store - The Signal protocol store implementation.
 * @returns {Promise<{registrationId: number, identityPubKey: ArrayBuffer, signedPreKey: import('@privacyresearch/libsignal-protocol-typescript').SignedPublicPreKeyType, preKeys: import('@privacyresearch/libsignal-protocol-typescript').PreKeyType[]}>} The public components of the generated keys needed for the server bundle.
 */
export const initializeSignalProtocol = async (store) => {
  const registrationId = KeyHelper.generateRegistrationId();
  await store.storeLocalRegistrationId(registrationId);

  const identityKeyPair = await KeyHelper.generateIdentityKeyPair();
  await store.storeIdentityKeyPair(identityKeyPair);

  // --- Add diagnostic assertion --- START ---
  const check = await store.getIdentityKeyPair();
  console.assert(
    check?.pubKey?.byteLength === 33 && check?.privKey?.byteLength === 32, // Ed25519 keys
    "[Signal Init] Identity key check failed immediately after storing!",
    check
  );
  // --- Add diagnostic assertion --- END ---

  // Generate multiple pre-keys (e.g., 100) as recommended by the protocol
  const preKeys = [];
  const preKeyPromises = [];
  for (let i = 0; i < 10; i++) {
    // Reduced for simplicity, use more (e.g., 100) in production
    const preKeyId = generateKeyId();
    preKeyPromises.push(
      KeyHelper.generatePreKey(preKeyId).then((preKey) => {
        preKeys.push({ keyId: preKey.keyId, publicKey: preKey.keyPair.pubKey });
        return store.storePreKey(`${preKey.keyId}`, preKey.keyPair);
      })
    );
  }
  await Promise.all(preKeyPromises);

  const signedPreKeyId = generateKeyId();
  const signedPreKey = await KeyHelper.generateSignedPreKey(
    identityKeyPair,
    signedPreKeyId
  );
  await store.storeSignedPreKey(signedPreKeyId, signedPreKey.keyPair);

  const publicSignedPreKey = {
    keyId: signedPreKeyId,
    publicKey: signedPreKey.keyPair.pubKey,
    signature: signedPreKey.signature,
  };

  console.log("Signal Protocol Initialized");

  // Return the public parts needed for the directory/server bundle
  return {
    registrationId,
    identityPubKey: identityKeyPair.pubKey,
    signedPreKey: publicSignedPreKey,
    preKeys: preKeys, // Only returning a subset for registration, store handles all
  };
};

/**
 * Builds a Signal session with a recipient using their PreKeyBundle.
 * @param {SignalProtocolStore} store - The Signal protocol store implementation.
 * @param {string} recipientId - The recipient's identifier.
 * @param {number} deviceId - The recipient's device ID.
 * @param {PreKeyBundleType} preKeyBundle - The recipient's pre-key bundle fetched from the server.
 * @returns {Promise<void>}
A promise that resolves when the session is built and stored, or rejects on identity key mismatch.
 */
export const buildSession = async (
  store,
  recipientId,
  deviceId,
  preKeyBundle
) => {
  const recipientAddress = new SignalProtocolAddress(recipientId, deviceId);
  const sessionBuilder = new SessionBuilder(store, recipientAddress);

  console.log(`Building session with ${recipientId}:${deviceId}`);
  try {
    await sessionBuilder.processPreKey(preKeyBundle);
    console.log(`Session built with ${recipientId}:${deviceId}`);
  } catch (error) {
    console.error("Error processing pre-key bundle:", error);
    throw error; // Re-throw for handling upstream
  }
};

/**
 * Encrypts a message for a recipient.
 * Establishes a session if one doesn't exist (via PreKeyWhisperMessage).
 * @param {SignalProtocolStore} store - The Signal protocol store implementation.
 * @param {string} recipientId - The recipient's identifier.
 * @param {number} deviceId - The recipient's device ID.
 * @param {ArrayBuffer} plaintextBuffer - The message content to encrypt as an ArrayBuffer.
 * @returns {Promise<MessageType>} The encrypted message object (contains type and body).
 */
export const encryptMessage = async (
  store,
  recipientId,
  deviceId,
  plaintextBuffer
) => {
  const recipientAddress = new SignalProtocolAddress(recipientId, deviceId);
  const sessionCipher = new SessionCipher(store, recipientAddress);

  // --- Log session state before encryption --- START
  try {
    const session = await store.loadSession(recipientAddress.toString());
    console.log(
      `[encryptMessage] Session state loaded for ${recipientId}:${deviceId} before encrypt:`,
      session
    );
  } catch (e) {
    console.warn(
      `[encryptMessage] Could not load session for logging before encrypt`,
      e
    );
  }
  // --- Log session state before encryption --- END

  console.log(`Encrypting message for ${recipientId}:${deviceId}`);
  try {
    const ciphertext = await sessionCipher.encrypt(plaintextBuffer);
    console.log(
      `Message encrypted (type ${ciphertext.type}) for ${recipientId}:${deviceId}`
    );

    // ─── DEBUG: what did SessionCipher give us? ───────────────────────────────
    if (ciphertext.type === 3) {
      // Log specifically for PreKeyWhisperMessages
      try {
        // Convert binary string safely to bytes (1 char -> 1 byte)
        const raw = Uint8Array.from(ciphertext.body, (c) => c.charCodeAt(0));
        // const raw = typeof ciphertext.body === 'string' // Alternate handling if body could be buffer
        //                 ? Uint8Array.from(ciphertext.body, c => c.charCodeAt(0))
        //                 : new Uint8Array(ciphertext.body);
        console.log(
          `[DBG-TX] type=${ciphertext.type}  len=${raw.byteLength}`,
          `sha256=${await crypto.subtle
            .digest("SHA-256", raw)
            .then((buf) =>
              [...new Uint8Array(buf)]
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("")
            )}`
        );
      } catch (dbgError) {
        console.error("[DBG-TX] Error logging debug info:", dbgError);
      }
    }
    // ─── END DEBUG ───────────────────────────────────────────────────────────

    return ciphertext;
  } catch (error) {
    console.error("Error encrypting message:", error);
    throw error;
  }
};

/**
 * Decrypts an incoming message.
 * Handles both PreKeyWhisperMessages (establishing a session) and WhisperMessages.
 * @param {SignalProtocolStore} store - The Signal protocol store implementation.
 * @param {string} recipientId - The ID of the user receiving the message (current user).
 * @param {string} senderId - The sender's identifier.
 * @param {number} senderDeviceId - The sender's device ID.
 * @param {MessageType} ciphertext - The incoming encrypted message object (body is expected to be a *Uint8Array*).
 * @returns {Promise<ArrayBuffer | null>} A promise resolving to the decrypted plaintext ArrayBuffer, or null if decryption fails.
 */
export const decryptMessage = async (
  store,
  recipientId, // Keep for logging context
  senderId,
  senderDeviceId,
  ciphertext
) => {
  const senderAddress = new SignalProtocolAddress(senderId, senderDeviceId);
  const sessionCipher = new SessionCipher(store, senderAddress);
  const senderAddressString = senderAddress.toString();
  // Assuming recipient device ID is always 1 for logging
  const recipientAddressString = new SignalProtocolAddress(
    recipientId,
    1
  ).toString();

  console.log(
    `Attempting decryption of message type ${ciphertext.type} from ${senderAddressString} to ${recipientAddressString}`
  );

  // Expect ciphertext.body to be Uint8Array
  const bodyUint8Array = ciphertext.body;
  if (!(bodyUint8Array instanceof Uint8Array)) {
    console.error(
      `[decryptMessage] Expected ciphertext.body to be a Uint8Array, but got: ${typeof bodyUint8Array}`
    );
    return null;
  }

  try {
    let plaintextBuffer = null;

    // --- 1. PreKey-Whisper (type 3) --- Using .catch for Bad MAC ---
    if (ciphertext.type === 3) {
      console.log(`Processing PreKeyWhisperMessage (Type 3)...`);
      plaintextBuffer = await sessionCipher
        .decryptPreKeyWhisperMessage(
          bodyUint8Array.buffer, // ⬅ Pass ArrayBuffer
          "binary" // ⬅ Add correct encoding type for ArrayBuffer
        )
        .catch(async (err) => {
          if (err instanceof Error && err.message?.includes("Bad MAC")) {
            console.warn(
              `Bad MAC error on PreKeyWhisperMessage from ${senderAddressString}. Session likely stale. Wiping session and retrying...`
            );
            await store.removeSession(senderAddressString); // Use removeSession
            const freshCipher = new SessionCipher(store, senderAddress);
            // Retry decryption with the fresh cipher
            return freshCipher.decryptPreKeyWhisperMessage(
              bodyUint8Array.buffer, // Pass ArrayBuffer directly again
              "binary" // ⬅ Add correct encoding type for ArrayBuffer
            );
          } else {
            // Re-throw errors other than Bad MAC
            console.error(
              `Non-MAC decryption error (PreKeyWhisperMessage) from ${senderAddressString}:`,
              err
            );
            throw err;
          }
        });
      console.log(
        plaintextBuffer
          ? `Successfully processed PreKeyWhisperMessage from ${senderAddressString}`
          : `Failed to process PreKeyWhisperMessage from ${senderAddressString} after potential retry.`
      );
    }
    // --- 2. Normal Whisper (type 1) -----------------------------------------
    else if (ciphertext.type === 1) {
      console.log(
        `Decrypting WhisperMessage (Type 1) from ${senderAddressString}...`
      );
      try {
        plaintextBuffer = await sessionCipher.decryptWhisperMessage(
          bodyUint8Array.buffer, // ⬅ Pass ArrayBuffer
          "binary" // ⬅ Add correct encoding type for ArrayBuffer
        );
        console.log(
          `Successfully decrypted WhisperMessage from ${senderAddressString}`
        );
      } catch (e) {
        // Bad MAC on Type 1 usually indicates out-of-order or state mismatch.
        // We log it but currently don't attempt automatic recovery like for Type 3.
        if (e instanceof Error && e.message?.includes("Bad MAC")) {
          console.error(
            `🛑 Bad MAC error decrypting WhisperMessage (Type 1) from ${senderAddressString}. This could be due to out-of-order messages or session state mismatch. No automatic retry. Raw error:`,
            e
          );
          plaintextBuffer = null; // Indicate decryption failure
        } else {
          console.error(
            `Non-MAC decryption error (WhisperMessage) from ${senderAddressString}:`,
            e
          );
          throw e; // Re-throw other errors
        }
      }
    } else {
      console.warn(
        `Received message with unknown type: ${ciphertext.type} from ${senderAddressString}`
      );
      throw new Error(`Unknown message type: ${ciphertext.type}`);
    }

    // --- Log decrypted plaintext if successful --- START ---
    if (plaintextBuffer) {
      try {
        console.log(
          `📩 Decrypted content from ${senderAddressString}: "`,
          arrayBufferToString(plaintextBuffer).substring(0, 50) + "...", // Use existing helper
          `"`
        );
      } catch (logError) {
        console.warn(
          "Could not log decrypted plaintext (decoding error?)",
          logError
        );
      }
    }
    // --- Log decrypted plaintext if successful --- END ---

    return plaintextBuffer;
  } catch (error) {
    // Catch errors from the retry logic or re-thrown errors
    console.error(
      `Decryption failed catastrophically for message from ${senderAddressString}:`,
      error
    );
    return null; // Indicate decryption failure
  }
};

/**
 * Helper to convert ArrayBuffer to Base64 string.
 * Useful for transmitting binary data (like keys or ciphertexts) as strings.
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
export function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

/**
 * Helper to convert Base64 string back to ArrayBuffer.
 * @param {string} base64
 * @returns {ArrayBuffer}
 */
export function base64ToArrayBuffer(base64) {
  if (!base64) {
    console.warn("[base64ToArrayBuffer] Received null or empty input.");
    return null;
  }
  try {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
  } catch (error) {
    console.error("Error converting Base64 to ArrayBuffer:", error);
    return null;
  }
}

/**
 * Helper to convert string to ArrayBuffer.
 * @param {string} str
 * @returns {ArrayBuffer}
 */
export function stringToArrayBuffer(str) {
  return new TextEncoder().encode(str).buffer;
}

/**
 * Helper to convert ArrayBuffer to string.
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
export function arrayBufferToString(buffer) {
  return new TextDecoder().decode(new Uint8Array(buffer));
}

/**
 * Helper function to convert an ArrayBuffer or Uint8Array to a plain hexadecimal string.
 * @param {ArrayBuffer | Uint8Array} buffer The data to convert.
 * @returns {string} The hexadecimal string representation (e.g., "a1b2c3d4").
 */
export function buf2hex(buffer) {
  const byteArray =
    buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return [...byteArray].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/**
 * Helper function to convert PostgreSQL bytea hex escape format ('\x...') to a Uint8Array.
 * @param {string | null | undefined} hexString The '\x...' formatted string.
 * @returns {Uint8Array} The resulting Uint8Array.
 * @throws {Error} If the input format is invalid.
 */
export function hexToUint8Array(hexString) {
  if (
    !hexString ||
    typeof hexString !== "string" ||
    !hexString.startsWith("\\x")
  ) {
    // Note: In JS string literals, '\\x' becomes \x
    throw new Error(
      `[hexToUint8Array] Invalid or non-hex string format received: ${hexString}`
    );
  }
  const hex = hexString.substring(2);

  if (hex.length % 2 !== 0) {
    throw new Error(
      `[hexToUint8Array] Hex string (after prefix removal) must have an even number of digits: ${hex}`
    );
  }

  const byteArray = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.substring(i, i + 2), 16);
    if (isNaN(byte)) {
      throw new Error(
        `[hexToUint8Array] Invalid hex character pair found: ${hex.substring(
          i,
          i + 2
        )}`
      );
    }
    byteArray[i / 2] = byte;
  }
  return byteArray;
}

// --- Add ensureIdentity --- START ---
import { signalStore } from "./localDb"; // Import the store instance
import { post } from "./backend"; // Assuming post helper exists for your API

/**
 * Ensures that the local Signal identity keys exist in the store.
 * If keys don't exist, it initializes them, stores them, and POSTs
 * the public bundle to the backend API.
 * @returns {Promise<import('@privacyresearch/libsignal-protocol-typescript').KeyPairType | undefined>}
 *          The identity key pair, or undefined if initialization failed.
 */
export async function ensureIdentity(userId) {
  console.log("[ensureIdentity] Checking for existing identity keys...");
  const existingKeyPair = await signalStore.getIdentityKeyPair();
  const existingRegId = await signalStore.getLocalRegistrationId();

  if (existingKeyPair && existingRegId) {
    console.log("[ensureIdentity] Identity keys and Reg ID found.");
    // Add diagnostic log
    console.log(
      "[ensureIdentity] Existing Identity PubKey (first 10 bytes):",
      existingKeyPair.pubKey
        ? buf2hex(existingKeyPair.pubKey.slice(0, 10))
        : "N/A"
    );
    console.log("[ensureIdentity] Existing Registration ID:", existingRegId);
    return existingKeyPair;
  }

  console.warn(
    "[ensureIdentity] No local identity/regId found. Generating fresh keys..."
  );
  try {
    const bundle = await initializeSignalProtocol(signalStore); // This generates and stores keys
    console.log("[ensureIdentity] New keys generated and stored.");

    // Log new keys for comparison
    const newKeyPair = await signalStore.getIdentityKeyPair();
    const newRegId = await signalStore.getLocalRegistrationId();
    console.log(
      "[ensureIdentity] New Identity PubKey (first 10 bytes):",
      newKeyPair?.pubKey ? buf2hex(newKeyPair.pubKey.slice(0, 10)) : "N/A"
    );
    console.log("[ensureIdentity] New Registration ID:", newRegId);

    // Prepare bundle for backend: Convert ArrayBuffers to Base64
    const serializableBundle = {
      userId: userId,
      registrationId: bundle.registrationId,
      identityKey: arrayBufferToBase64(bundle.identityPubKey),
      signedPreKeyId: bundle.signedPreKey.keyId,
      signedPreKeyPublicKey: arrayBufferToBase64(bundle.signedPreKey.publicKey),
      signedPreKeySignature: arrayBufferToBase64(bundle.signedPreKey.signature),
      preKeyId: bundle.preKeys[0].keyId,
      preKeyPublicKey: arrayBufferToBase64(bundle.preKeys[0].publicKey),
    };

    console.log("[ensureIdentity] Posting serializable bundle to backend:", {
      registrationId: serializableBundle.registrationId,
      identityKey: serializableBundle.identityKey?.substring(0, 20) + "...", // Log truncated keys
      signedPreKeyId: serializableBundle.signedPreKey?.keyId,
      preKeyId: serializableBundle.preKey?.keyId,
    });

    // TODO: Replace '/api/signal/register' with your actual backend endpoint
    await post("/api/signal/store-bundle", serializableBundle);
    console.log("[ensureIdentity] Bundle successfully posted to backend.");

    // Return the newly generated key pair
    return newKeyPair; // Should be the same as bundle.identityPubKey + the private key
  } catch (error) {
    console.error("[ensureIdentity] Failed to initialize or post keys:", error);
    // Depending on the error, you might want to clear the failed attempt
    // await signalStore.clearAllData(); // Use with caution!
    return undefined; // Indicate failure
  }
}
// --- Add ensureIdentity --- END ---
