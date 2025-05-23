"use strict";

import {
  KeyHelper,
  SignalProtocolAddress,
  SessionBuilder,
  SessionCipher,
} from "@privacyresearch/libsignal-protocol-typescript";

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
 *   preKeys: Array<{ preKeyId: number, preKeyPublicKey: string }>,
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
    typeof store.storePreKey !== "function" ||
    typeof store.getIdentityKeyPair !== "function"
  ) {
    console.error(
      "[initializeSignalProtocol] Invalid store object provided:",
      store
    );
    throw new Error("Invalid or incomplete store object provided.");
  }

  // --- ADDED: Check if identity keys already exist ---
  const existingIdentity = await store.getIdentityKeyPair();
  if (existingIdentity) {
    console.log(
      `[SignalUtils] Identity keys already exist for user ${userId}. Skipping regeneration.`
    );
    // We might need to return the existing bundle details here, or handle this upstream.
    // For now, let's signal upstream that no *new* bundle was generated.
    // The calling context (SignalProvider) likely needs adjustment.
    // Returning null might be one way, or a specific object indicating "already initialized".
    // Let's try returning null for now and adjust SignalProvider later if needed.
    return null; // Indicate keys existed, no new bundle generated/uploaded needed
  }
  // --- END ADDED CHECK ---

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

  // --- MODIFIED: Generate a batch of one-time pre-keys --- START ---
  // ❸ generate, store & return a batch of one-time pre-keys
  const PRE_KEY_BATCH_SIZE = 100; // Or configurable
  const preKeys = [];
  console.log(
    `[SignalUtils] Generating ${PRE_KEY_BATCH_SIZE} one-time pre-keys...`
  );
  for (let i = 0; i < PRE_KEY_BATCH_SIZE; i++) {
    // --- MODIFIED: Use local ID for generatePreKey and storePreKey --- START ---
    const localId = i + 1; // 1-based index for local store ID
    const preKey = await KeyHelper.generatePreKey(localId);

    // Use the generated localId when storing the key pair locally.
    await store.storePreKey(localId, preKey.keyPair);
    // --- MODIFIED: Use local ID for generatePreKey and storePreKey --- END ---

    preKeys.push({
      // preKeyId field remains removed as server generates the canonical ID
      preKeyPublicKey: u8ToB64(new Uint8Array(preKey.keyPair.pubKey)), // Use safe encoder
    });
  }
  console.log(
    `[SignalUtils] Generated and stored ${preKeys.length} one-time pre-keys.`
  );
  // --- MODIFIED: Generate a batch of one-time pre-keys --- END ---

  console.log(
    `[SignalUtils] Initialized Signal protocol for user ${userId}. RegID: ${registrationId}, SignedPKID: ${signedPreKey.keyId}` // Removed PreKeyID logging here as it's now a batch
  );

  // ❹ build bundle in **Base-64**
  const bundle = {
    userId,
    registrationId,
    // --- Use safe encoder --- START ---
    identityKey: u8ToB64(new Uint8Array(identity.pubKey)),
    signedPreKeyId: signedPreKey.keyId,
    signedPreKeyPublicKey: u8ToB64(new Uint8Array(signedPreKey.keyPair.pubKey)),
    signedPreKeySignature: u8ToB64(new Uint8Array(signedPreKey.signature)),
    // --- MODIFIED: Include the array of preKeys --- START ---
    preKeys: preKeys, // Send the whole batch
    // --- MODIFIED: Include the array of preKeys --- END ---
    // --- Use safe encoder --- END ---
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

// Session cache to avoid redundant setup
const sessionCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Check if a session is cached and still valid
 */
export const getCachedSession = (addressStr) => {
  const cached = sessionCache.get(addressStr);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.session;
  }
  return null;
};

/**
 * Cache a session for future use
 */
export const cacheSession = (addressStr, session) => {
  sessionCache.set(addressStr, {
    session,
    timestamp: Date.now(),
  });
};

/**
 * Clear expired sessions from cache
 */
export const clearExpiredSessions = () => {
  const now = Date.now();
  for (const [key, value] of sessionCache.entries()) {
    if (now - value.timestamp >= CACHE_TTL) {
      sessionCache.delete(key);
    }
  }
};

// Automatically clear expired sessions every 2 minutes
setInterval(clearExpiredSessions, 2 * 60 * 1000);

/**
 * Optimized encryption function with session caching
 */
export const encryptMessageOptimized = async (
  store,
  recipientId,
  deviceId,
  plaintextBuffer
) => {
  const recipientAddress = new SignalProtocolAddress(recipientId, deviceId);
  const addressStr = recipientAddress.toString();

  // Try to use cached session first
  let sessionCipher = getCachedSession(addressStr);

  if (!sessionCipher) {
    sessionCipher = new SessionCipher(store, recipientAddress);
    cacheSession(addressStr, sessionCipher);
  }

  console.log(
    `Encrypting message for ${recipientId}:${deviceId} (cached: ${!!getCachedSession(
      addressStr
    )})`
  );

  try {
    const ciphertext = await sessionCipher.encrypt(plaintextBuffer);
    console.log(
      `Message encrypted (type ${ciphertext.type}) for ${recipientId}:${deviceId}`
    );
    return ciphertext;
  } catch (error) {
    console.error("Error encrypting message:", error);
    // Remove from cache if encryption failed
    sessionCache.delete(addressStr);
    throw error;
  }
};

/**
 * Original encryption function (for backward compatibility)
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
 * @param {string} myUserId - The ID of the user receiving the message (current user).
 * @param {number} myDeviceId - The device ID of the user receiving the message.
 * @param {string} theirUserId - The sender's identifier.
 * @param {number} theirDeviceId - The sender's device ID.
 * @param {MessageType} ciphertext - The incoming encrypted message object (body is expected to be a *Uint8Array*).
 * @returns {Promise<ArrayBuffer | null>} A promise resolving to the decrypted plaintext ArrayBuffer, or null if decryption fails.
 */
export const decryptMessage = async (
  store,
  myUserId,
  myDeviceId,
  theirUserId,
  theirDeviceId,
  ciphertext
) => {
  const senderAddress = new SignalProtocolAddress(theirUserId, theirDeviceId);
  const sessionCipher = new SessionCipher(store, senderAddress);
  const senderAddressString = senderAddress.toString();
  const recipientAddressString = new SignalProtocolAddress(
    myUserId,
    myDeviceId
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
            // --- ADDED: Clear cached identity for sender --- START ---
            // (Assuming senderAddressString is the correct identifier for the identity store)
            console.warn(
              `[Decrypt Retry] Clearing cached identity for ${senderAddressString} due to Bad MAC.`
            );
            await store.saveIdentity(senderAddressString, null); // Clear the possibly stale identity
            // --- ADDED: Clear cached identity for sender --- END ---
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

/**
 * Converts an array of pre-key bundle objects from the backend into a Map.
 * Assumes the backend returns objects with snake_case field names and hex-encoded bytea values (e.g., \x...).
 * @param {Array<object>} rows - Array of bundle objects from /signal/bundles/:userId.
 * @returns {Map<number, PreKeyBundleType>} A map of deviceId to PreKeyBundle.
 */
export function bundlesToMap(rows) {
  const map = new Map();
  if (!Array.isArray(rows)) {
    console.error("[bundlesToMap] Input is not an array:", rows);
    return map; // Return empty map
  }
  rows.forEach((r) => {
    try {
      // Use camelCase first, fallback to snake_case (handles potential inconsistencies)
      const deviceIdNum = Number(r.deviceId ?? r.device_id);
      if (isNaN(deviceIdNum) || deviceIdNum === 0) {
        // Added check for 0 which is invalid for Signal
        console.warn(
          "[bundlesToMap] Skipping row due to invalid or zero deviceId:",
          r
        );
        return; // Use return inside forEach to skip iteration
      }

      // Ensure required fields are present before processing (using camelCase)
      if (
        !r.registrationId ||
        !r.identityKey ||
        !r.signedPreKeyId ||
        !r.signedPreKeyPublicKey ||
        !r.signedPreKeySignature
      ) {
        console.warn(
          "[bundlesToMap] Skipping row due to missing required fields (check uses camelCase names):",
          r
        );
        return; // Use return inside forEach
      }

      // Decode using base64ToArrayBuffer and camelCase properties from 'r'
      const bundleForMap = {
        deviceId: deviceIdNum,
        registrationId: r.registrationId,
        identityKey: b64ToU8(r.identityKey).buffer,

        signedPreKey: {
          keyId: r.signedPreKeyId,
          publicKey: b64ToU8(r.signedPreKeyPublicKey).buffer,
          signature: b64ToU8(r.signedPreKeySignature).buffer,
        },

        // preKey is optional
        preKey:
          r.preKeyId && r.preKeyPublicKey
            ? {
                keyId: r.preKeyId,
                publicKey: b64ToU8(r.preKeyPublicKey).buffer,
              }
            : undefined,
      };

      // Check for nulls from base64ToArrayBuffer
      if (
        !bundleForMap.identityKey ||
        !bundleForMap.signedPreKey.publicKey ||
        !bundleForMap.signedPreKey.signature ||
        (bundleForMap.preKey && !bundleForMap.preKey.publicKey)
      ) {
        console.warn(
          "[bundlesToMap] Skipping row due to base64 decoding failure after construction:",
          r,
          bundleForMap
        );
        return; // Use return inside forEach
      }

      // Use the numeric deviceIdNum as the map key
      map.set(deviceIdNum, bundleForMap);
    } catch (error) {
      // Catch errors during processing of a single row
      console.error(
        `[bundlesToMap] Error processing row:`,
        error,
        "Row data:",
        r
      );
      // Continue to the next row implicitly via forEach
    }
  });
  return map;
}

// --- Replace Base64 Helpers with Safe Versions --- START ---

/**
 * Converts Uint8Array to a URL-safe Base64 string (no '+', '/', '=').
 * @param {Uint8Array} u8 - The Uint8Array to encode.
 * @returns {string} The URL-safe Base64 encoded string.
 */
export const u8ToB64 = (u8) =>
  btoa(String.fromCharCode(...u8))
    .replace(/\+/g, "-") // Convert '+' to '-'
    .replace(/\//g, "_") // Convert '/' to '_'
    .replace(/=+$/, ""); // Remove trailing '=' padding

/**
 * Converts a URL-safe Base64 string back to a Uint8Array.
 * @param {string} b64 - The URL-safe Base64 string.
 * @returns {Uint8Array} The decoded Uint8Array.
 * @throws {Error} If the input is invalid Base64.
 */
export const b64ToU8 = (b64) => {
  // Add back padding and revert URL-safe replacements
  const base64Standard = b64.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (base64Standard.length % 4)) % 4;
  const base64Padded = base64Standard + "=".repeat(padding);
  return Uint8Array.from(atob(base64Padded), (c) => c.charCodeAt(0));
};

// --- Replace Base64 Helpers with Safe Versions --- END ---
