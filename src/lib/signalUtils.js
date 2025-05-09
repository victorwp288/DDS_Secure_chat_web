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

// --- Add bufToB64 helper ---
function bufToB64(buf) {
  // Ensure buf is ArrayBuffer
  if (!(buf instanceof ArrayBuffer)) {
    console.error("[bufToB64] Input is not ArrayBuffer:", buf);
    if (buf === null || buf === undefined) return null; // Handle null/undefined gracefully if they sneak in
    throw new Error("bufToB64: Expected ArrayBuffer input.");
  }
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
// --- End bufToB64 helper ---

/**
 * Initializes the Signal protocol state for the current device.
 * Generates identity keys, registration ID, a signed pre-key, and a one-time pre-key,
 * storing them in the provided store.
 * It then returns a bundle formatted for server registration with Base64 encoded keys.
 * @param {import('@privacyresearch/libsignal-protocol-typescript').SignalProtocolStore} store - The Signal protocol store implementation.
 * @param {string} userId - The user's identifier, to be included in the returned bundle.
 * @returns {Promise<{
 *   userId: string,
 *   registrationId: number,
 *   identityKey: string, // Base64 encoded
 *   signedPreKeyId: number,
 *   signedPreKeyPublicKey: string, // Base64 encoded
 *   signedPreKeySignature: string, // Base64 encoded
 *   preKeyId: number,
 *   preKeyPublicKey: string // Base64 encoded
 * }>} An object containing the user ID, registration ID, and Base64 encoded public identity key,
 *      signed pre-key components, and one-time pre-key components, formatted for the server.
 */
export const initializeSignalProtocol = async (store, userId) => {
  if (!userId || typeof userId !== "string" || userId.trim() === "") {
    console.error(
      "[initializeSignalProtocol] Invalid or missing userId:",
      userId
    );
    throw new Error("userId must be a non-empty string.");
  }
  // Basic check for store
  if (
    !store ||
    typeof store.storeIdentityKeyPair !== "function" ||
    typeof store.storeLocalRegistrationId !== "function" ||
    typeof store.storeSignedPreKey !== "function" ||
    typeof store.storePreKey !== "function"
  ) {
    console.error(
      "[initializeSignalProtocol] Invalid store object provided:",
      store
    );
    throw new Error("Invalid or incomplete store object provided.");
  }

  // ❶ identity & registration
  const identity = await KeyHelper.generateIdentityKeyPair();
  const registrationId = KeyHelper.generateRegistrationId();

  await store.storeIdentityKeyPair(identity);
  await store.storeLocalRegistrationId(registrationId);

  // ❷ signed-pre-key
  // Use a seed for the ID; the library returns the actual ID in the generated object.
  // Max value for signedPreKeyId is 2147483647 (2^31 - 1).
  const signedPreKeyIdSeed = Math.floor(Math.random() * (2 ** 31 - 2)) + 1; // Range: 1 to 2^31 - 2
  const signedPreKey = await KeyHelper.generateSignedPreKey(
    identity,
    signedPreKeyIdSeed
  );
  // signedPreKey is { keyId: number, keyPair: KeyPairType, signature: ArrayBuffer }
  // Store using the keyId from the signedPreKey object and its keyPair.
  console.log(`[SignalUtils] Storing SignedPreKey ID: ${signedPreKey.keyId}`);
  await store.storeSignedPreKey(signedPreKey.keyId, signedPreKey.keyPair);
  console.log(`[SignalUtils] Stored SignedPreKey ID: ${signedPreKey.keyId}`);

  // ❸ first one-time pre-key
  // Max value for preKeyId for libsignal-protocol-typescript is 16777215 (0xFFFFFF).
  const preKeyIdSeed = Math.floor(Math.random() * 16777214) + 1; // Range: 1 to 2^24 - 2
  const preKey = await KeyHelper.generatePreKey(preKeyIdSeed);
  // preKey is { keyId: number, keyPair: KeyPairType }
  // Store using the keyId from the preKey object (as a string) and its keyPair.
  console.log(`[SignalUtils] Storing PreKey ID: ${preKey.keyId}`);
  await store.storePreKey(preKey.keyId, preKey.keyPair);
  console.log(`[SignalUtils] Stored PreKey ID: ${preKey.keyId}`);

  console.log(
    `[SignalUtils] Initialized Signal protocol for user ${userId}. RegID: ${registrationId}, SignedPKID: ${signedPreKey.keyId}, PreKeyID: ${preKey.keyId}`
  );

  // ❹ build bundle in **Base-64**
  const bundle = {
    userId,
    registrationId,
    identityKey: bufToB64(identity.pubKey),
    signedPreKeyId: signedPreKey.keyId, // Use the keyId from the generated object
    signedPreKeyPublicKey: bufToB64(signedPreKey.keyPair.pubKey),
    signedPreKeySignature: bufToB64(signedPreKey.signature),
    preKeyId: preKey.keyId, // Use the keyId from the generated object
    preKeyPublicKey: bufToB64(preKey.keyPair.pubKey),
  };

  // console.log("[SignalUtils] Generated bundle for server:", JSON.stringify(bundle, (k,v) => typeof v === 'string' && v.length > 30 ? v.substring(0,30) + '...' : v, 2));
  return bundle;
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

  console.log(`Encrypting message for ${recipientId}:${deviceId}`);
  try {
    const ciphertext = await sessionCipher.encrypt(plaintextBuffer);
    console.log(
      `Message encrypted (type ${ciphertext.type}) for ${recipientId}:${deviceId}`
    );

    if (ciphertext.type === 3) {
      try {
        const raw = Uint8Array.from(ciphertext.body, (c) => c.charCodeAt(0));
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
  recipientId,
  senderId,
  senderDeviceId,
  ciphertext
) => {
  const senderAddress = new SignalProtocolAddress(senderId, senderDeviceId);
  const sessionCipher = new SessionCipher(store, senderAddress);
  const senderAddressString = senderAddress.toString();
  const recipientAddressString = new SignalProtocolAddress(
    recipientId,
    1 // TODO: This recipient device ID might need to come from context if store is keyed by full address
  ).toString();

  console.log(
    `Attempting decryption of message type ${ciphertext.type} from ${senderAddressString} to ${recipientAddressString}`
  );

  const bodyUint8Array = ciphertext.body;
  if (!(bodyUint8Array instanceof Uint8Array)) {
    console.error(
      `[decryptMessage] Expected ciphertext.body to be a Uint8Array, but got: ${typeof bodyUint8Array}`
    );
    return null;
  }

  try {
    let plaintextBuffer = null;

    if (ciphertext.type === 3) {
      console.log(`Processing PreKeyWhisperMessage (Type 3)...`);
      plaintextBuffer = await sessionCipher
        .decryptPreKeyWhisperMessage(bodyUint8Array.buffer, "binary")
        .catch(async (err) => {
          if (err instanceof Error && err.message?.includes("Bad MAC")) {
            console.warn(
              `Bad MAC error on PreKeyWhisperMessage from ${senderAddressString}. Session likely stale. Wiping session and retrying...`
            );
            await store.removeSession(senderAddressString);
            const freshCipher = new SessionCipher(store, senderAddress);
            return freshCipher.decryptPreKeyWhisperMessage(
              bodyUint8Array.buffer,
              "binary"
            );
          } else {
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
    } else if (ciphertext.type === 1) {
      console.log(
        `Decrypting WhisperMessage (Type 1) from ${senderAddressString}...`
      );
      try {
        plaintextBuffer = await sessionCipher.decryptWhisperMessage(
          bodyUint8Array.buffer,
          "binary"
        );
        console.log(
          `Successfully decrypted WhisperMessage from ${senderAddressString}`
        );
      } catch (e) {
        if (e instanceof Error && e.message?.includes("Bad MAC")) {
          console.error(
            `🛑 Bad MAC error decrypting WhisperMessage (Type 1) from ${senderAddressString}. This could be due to out-of-order messages or session state mismatch. No automatic retry. Raw error:`,
            e
          );
          plaintextBuffer = null;
        } else {
          console.error(
            `Non-MAC decryption error (WhisperMessage) from ${senderAddressString}:`,
            e
          );
          throw e;
        }
      }
    } else {
      console.warn(
        `Received message with unknown type: ${ciphertext.type} from ${senderAddressString}`
      );
      throw new Error(`Unknown message type: ${ciphertext.type}`);
    }

    if (plaintextBuffer) {
      try {
        console.log(
          `📩 Decrypted content from ${senderAddressString}: "`,
          arrayBufferToString(plaintextBuffer).substring(0, 50) + "...",
          `"`
        );
      } catch (logError) {
        console.warn(
          "Could not log decrypted plaintext (decoding error?)",
          logError
        );
      }
    }
    return plaintextBuffer;
  } catch (error) {
    console.error(
      `Decryption failed catastrophically for message from ${senderAddressString}:`,
      error
    );
    return null;
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
 * @returns {ArrayBuffer | null} Null if input is invalid or conversion fails.
 */
export function base64ToArrayBuffer(base64) {
  if (!base64 || typeof base64 !== "string") {
    console.warn("[base64ToArrayBuffer] Received invalid input:", base64);
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
    console.error("Error converting Base64 to ArrayBuffer:", base64, error);
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
 * Helper function to convert PostgreSQL bytea hex escape format ('\\x...') to a Uint8Array.
 * @param {string | null | undefined} hexString The '\\x...' formatted string.
 * @returns {Uint8Array} The resulting Uint8Array.
 * @throws {Error} If the input format is invalid.
 */
export function hexToUint8Array(hexString) {
  if (
    !hexString ||
    typeof hexString !== "string" ||
    !hexString.startsWith("\\x")
  ) {
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
// Removed: import { post } from "./backend"; // No longer posting from here

/**
 * Ensures that the local Signal identity keys exist in the store.
 * If keys don't exist, it initializes them and stores them using the provided userId for context.
 * This function NO LONGER posts to the backend; that's handled by SignalContext.
 * @param {string} userId The user's ID, used for context if needed by initializeSignalProtocol.
 * @returns {Promise<import('@privacyresearch/libsignal-protocol-typescript').KeyPairType | undefined>}
 *          The identity key pair, or undefined if initialization failed.
 */
export async function ensureIdentity(userId) {
  // userId is now passed
  console.log(
    "[ensureIdentity] Checking for existing identity keys for user:",
    userId
  );
  const existingKeyPair = await signalStore.getIdentityKeyPair();
  const existingRegId = await signalStore.getLocalRegistrationId();

  if (existingKeyPair && existingRegId) {
    console.log("[ensureIdentity] Identity keys and Reg ID found.");
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
    "[ensureIdentity] No local identity/regId found. Generating fresh keys for user:",
    userId
  );
  try {
    // Call initializeSignalProtocol, which now takes userId and returns the bundle for the server
    // However, ensureIdentity itself doesn't need the bundle, just ensures keys are in store.
    // initializeSignalProtocol already stores the keys.
    await initializeSignalProtocol(signalStore, userId);
    console.log(
      "[ensureIdentity] New keys generated and stored by initializeSignalProtocol for user:",
      userId
    );

    const newKeyPair = await signalStore.getIdentityKeyPair(); // Verify they are stored
    const newRegId = await signalStore.getLocalRegistrationId();
    console.log(
      "[ensureIdentity] New Identity PubKey (first 10 bytes):",
      newKeyPair?.pubKey ? buf2hex(newKeyPair.pubKey.slice(0, 10)) : "N/A"
    );
    console.log("[ensureIdentity] New Registration ID:", newRegId);

    // Removed backend posting from here. SignalContext will handle it.
    return newKeyPair;
  } catch (error) {
    console.error("[ensureIdentity] Failed to initialize keys:", error);
    return undefined;
  }
}
// --- Add ensureIdentity --- END ---

/**
 * Converts an array of pre-key bundle objects from the backend into a Map.
 * @param {Array<object>} arr - Array of bundle objects from /api/signal/bundles/:userId.
 * Each object is expected to have deviceId, registrationId, identityKey (Base64),
 * signedPreKeyId, signedPreKeyPublicKey (Base64), signedPreKeySignature (Base64),
 * preKeyId, preKeyPublicKey (Base64).
 * @returns {Map<number, PreKeyBundleType>} A map of deviceId to PreKeyBundle.
 */
export function bundlesToMap(arr) {
  const map = new Map();
  if (!Array.isArray(arr)) {
    console.error("[bundlesToMap] Input is not an array:", arr);
    return map; // Return empty map
  }
  for (const b of arr) {
    // Validate basic structure of b
    if (b && typeof b.deviceId === "number" && b.identityKey) {
      // Basic check
      const identityKeyBuffer = base64ToArrayBuffer(b.identityKey);
      const signedPreKeyPublicKeyBuffer = base64ToArrayBuffer(
        b.signedPreKeyPublicKey
      );
      const signedPreKeySignatureBuffer = base64ToArrayBuffer(
        b.signedPreKeySignature
      );
      const preKeyPublicKeyBuffer = base64ToArrayBuffer(b.preKeyPublicKey);

      // Check for nulls from base64ToArrayBuffer which indicates conversion failure
      if (
        !identityKeyBuffer ||
        !signedPreKeyPublicKeyBuffer ||
        !signedPreKeySignatureBuffer ||
        !preKeyPublicKeyBuffer
      ) {
        console.warn(
          "[bundlesToMap] Failed to convert one or more keys from Base64 for deviceId:",
          b.deviceId,
          "Bundle data:",
          b
        );
        continue; // Skip this bundle if any key conversion fails
      }

      map.set(b.deviceId, {
        registrationId: b.registrationId,
        identityKey: identityKeyBuffer,
        signedPreKey: {
          keyId: b.signedPreKeyId,
          publicKey: signedPreKeyPublicKeyBuffer,
          signature: signedPreKeySignatureBuffer,
        },
        preKey: {
          keyId: b.preKeyId,
          publicKey: preKeyPublicKeyBuffer,
        },
      });
    } else {
      console.warn("[bundlesToMap] Skipping invalid bundle object:", b);
    }
  }
  return map;
}
