// import * as signal from "@privacyresearch/libsignal-protocol-typescript"; // OLD LIBRARY
// import * as signal from "@signalapp/libsignal-client"; // NEW LIBRARY
// import { supabase } from "./supabaseClient"; // Removed unused import
// import { IndexedDBStore, signalStore } from "./localDb"; // No longer needed here

// --- Base64 Helpers Removed (Now implemented where needed, e.g., SignupPage) ---
// function arrayBufferToBase64(buffer) { ... }
// function base64ToArrayBuffer(base64) { ... }

// Removed unused helpers
// function serializeBuffers(obj) { ... }
// function deserializeBuffers(obj) { ... }

// --- End Helpers ---

// --- Removed Initialization (No longer relevant here) ---
// let isSignalInitialized = false;
// async function ensureSignalInitialized() { ... }

// --- Removed Signal Protocol Functions (Moved to Backend API) ---

// export const generateSignalKeys = async () => { ... }; // REMOVED

// export const storePreKeyBundle = async (profileId, preKeyBundle) => { ... }; // REMOVED (Needs redesign for API)

/**
 * Retrieves and deserializes a user's public pre-key bundle from Supabase.
 * Placeholder - Actual implementation might change based on backend API.
 */
export const getPreKeyBundle = async (profileId) => {
  console.log(`[getPreKeyBundle] Fetching for profile: ${profileId}`);
  // TODO: Implement fetching the public bundle parts needed for session establishment
  // This might involve a dedicated API endpoint or direct Supabase fetch if secured properly.
  throw new Error("getPreKeyBundle not implemented yet.");
  // Original implementation removed...
};

/**
 * Establishes a Signal session with a recipient.
 * Placeholder - This logic now primarily lives on the backend.
 */
export const establishSession = async (recipientId, deviceId = 1) => {
  console.log(`[establishSession] Placeholder for: ${recipientId}.${deviceId}`);
  // TODO: This will likely involve calling a backend API endpoint
  // that takes the recipientId, fetches their bundle, and processes it.
  throw new Error("establishSession frontend placeholder - use API endpoint.");
};

/**
 * Encrypts a message for a recipient.
 * Placeholder - Use backend API endpoint.
 */
export const encryptMessage = async (recipientId, plaintext, deviceId = 1) => {
  console.log(`[encryptMessage] Placeholder for: ${recipientId}.${deviceId}`);
  // TODO: Replace with fetch call to backend API /api/signal/encrypt
  throw new Error("encryptMessage frontend placeholder - use API endpoint.");
};

/**
 * Decrypts an incoming message.
 * Placeholder - Use backend API endpoint.
 */
export const decryptMessage = async (senderId, ciphertext, deviceId = 1) => {
  console.log(`[decryptMessage] Placeholder for: ${senderId}.${deviceId}`);
  // TODO: Replace with fetch call to backend API /api/signal/decrypt
  // Need to pass senderId and the ciphertext object { type, body }
  throw new Error("decryptMessage frontend placeholder - use API endpoint.");
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
