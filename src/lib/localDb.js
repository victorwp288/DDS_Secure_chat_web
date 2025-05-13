// import * as signal from "@privacyresearch/libsignal-protocol-typescript"; // REMOVED: No longer needed here

// --- Fix: Separate DB Name --- START ---
const DB_NAME = "SignalKeysDB"; // Use a distinct name for the Signal key store
// --- Fix: Separate DB Name --- END ---
const DB_VERSION = 1;
const KEY_STORE_NAME = "signalKeys";
const SESSION_STORE_NAME = "signalSessions";
// Add other stores as needed by the SignalProtocolStore interface
const PREKEY_STORE_NAME = "signalPreKeys";
const SIGNED_PREKEY_STORE_NAME = "signalSignedPreKeys";
const IDENTITY_STORE_NAME = "signalIdentity";

// --- Namespace DB Connections --- START ---
// Use a Map to store DB connection promises, keyed by userId
const dbPromiseMap = new Map();

function getDb(userId) {
  if (!userId) {
    return Promise.reject(new Error("getDb requires a userId"));
  }

  if (!dbPromiseMap.has(userId)) {
    const userDbName = `${DB_NAME}_${userId}`; // Use the DB_NAME constant
    console.log(`[localDb] Creating/Opening DB promise for: ${userDbName}`);

    const promise = new Promise((resolve, reject) => {
      console.log(`Opening IndexedDB: ${userDbName} version ${DB_VERSION}`);
      const request = indexedDB.open(userDbName, DB_VERSION);

      request.onerror = (event) => {
        console.error("IndexedDB error:", event.target.error);
        reject(`IndexedDB error: ${event.target.error}`);
        dbPromiseMap.delete(userId); // Remove promise on error
      };

      request.onsuccess = (event) => {
        console.log("IndexedDB opened successfully.");
        const db = event.target.result; // Get the DB instance

        // --- Add event listeners to the DB connection itself --- START ---
        db.onclose = () => {
          console.warn("IndexedDB connection closed unexpectedly.");
          dbPromiseMap.delete(userId); // Remove promise so it reopens
        };
        db.onerror = (event) => {
          // Log errors that occur on the connection after it's opened
          console.error(
            "Unhandled IndexedDB database error:",
            event.target.error
          );
          // Optionally close and reset
          dbPromiseMap.delete(userId);
        };
        db.onversionchange = () => {
          // Handle requests to upgrade the DB from other tabs/windows
          console.warn(
            "IndexedDB version change requested. Closing old connection..."
          );
          db.close(); // Close the current connection to allow the upgrade
          dbPromiseMap.delete(userId); // Reset promise
        };
        // --- Add event listeners to the DB connection itself --- END ---

        // Resolve the promise with the db instance
        resolve(db);
      }; // End of request.onsuccess

      // Assign onupgradeneeded directly to the request
      request.onupgradeneeded = (event) => {
        console.log("IndexedDB upgrade needed.");
        const db = event.target.result;
        if (!db.objectStoreNames.contains(KEY_STORE_NAME)) {
          console.log(`Creating object store: ${KEY_STORE_NAME}`);
          db.createObjectStore(KEY_STORE_NAME);
        }
        if (!db.objectStoreNames.contains(SESSION_STORE_NAME)) {
          console.log(`Creating object store: ${SESSION_STORE_NAME}`);
          db.createObjectStore(SESSION_STORE_NAME);
        }
        if (!db.objectStoreNames.contains(PREKEY_STORE_NAME)) {
          console.log(`Creating object store: ${PREKEY_STORE_NAME}`);
          db.createObjectStore(PREKEY_STORE_NAME);
        }
        if (!db.objectStoreNames.contains(SIGNED_PREKEY_STORE_NAME)) {
          console.log(`Creating object store: ${SIGNED_PREKEY_STORE_NAME}`);
          db.createObjectStore(SIGNED_PREKEY_STORE_NAME);
        }
        if (!db.objectStoreNames.contains(IDENTITY_STORE_NAME)) {
          console.log(`Creating object store: ${IDENTITY_STORE_NAME}`);
          db.createObjectStore(IDENTITY_STORE_NAME);
        }
        console.log("IndexedDB upgrade complete.");
      };
    }); // End of new Promise
    dbPromiseMap.set(userId, promise);
  }
  return dbPromiseMap.get(userId);
}
// --- Namespace DB Connections --- END ---

// --- Helper function to perform DB operations ---
async function performDbOperation(userId, storeName, mode, operation) {
  if (!userId) throw new Error("performDbOperation requires userId");
  const db = await getDb(userId); // Pass userId here
  return new Promise((resolve, reject) => {
    let requestResult = undefined; // Variable to store result from request.onsuccess

    // --- Wrap transaction creation in try-catch --- START ---
    try {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);

      // Add logging for transaction aborts
      transaction.onabort = (event) => {
        console.error(
          `IndexedDB transaction ABORTED on ${storeName} (Mode: ${mode}):`,
          event.target.error
        );
        reject(
          event.target.error || new Error(`Transaction aborted on ${storeName}`)
        );
      };

      const request = operation(store);

      request.onsuccess = (event) => {
        // Store the result for read operations or if needed
        requestResult = event.target.result;
        // For read operations, we could resolve here, but waiting for
        // transaction complete is safer even for reads if subsequent
        // operations depend on this read finishing *within its transaction*.
        // Let's simplify and always resolve on transaction complete/error.
      };
      request.onerror = (event) => {
        console.error(
          `IndexedDB request error on ${storeName} (Mode: ${mode}):`,
          event.target.error
        );
        // Don't reject here, let transaction.onerror handle it to ensure
        // the transaction error bubbles up properly.
      };

      transaction.oncomplete = () => {
        // Transaction succeeded, resolve with the stored result
        console.debug(
          `IndexedDB transaction complete on ${storeName}. Mode: ${mode}.`
        );
        resolve(requestResult);
      };
      transaction.onerror = (event) => {
        console.error(
          `IndexedDB transaction error on ${storeName} (Mode: ${mode}):`,
          event.target.error
        );
        reject(event.target.error); // Reject promise on transaction error
      };
    } catch (err) {
      console.error(
        `Error initiating transaction on ${storeName} (Mode: ${mode}):`,
        err
      );
      // Check if the error is the specific connection closing error
      if (err instanceof DOMException && err.name === "InvalidStateError") {
        console.warn(
          "Database connection was closed when trying to start transaction. Resetting promise..."
        );
        // Reset dbPromise to force re-initialization on next call
        dbPromiseMap.delete(userId); // Pass userId here
        // Reject with a specific error message
        reject(
          new Error(
            "Database connection was closed. Please retry the operation."
          )
        );
      } else {
        reject(err); // Re-throw other errors
      }
    }
    // --- Wrap transaction creation in try-catch --- END ---
  });
}

// --- Base64 Helpers ---
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

// --- Serialization Helpers using Base64 ---
function serializeBuffers(obj) {
  if (!obj) return obj;
  if (obj instanceof ArrayBuffer) {
    return {
      __type: "ArrayBuffer",
      // Use standard Base64 encoding
      data: arrayBufferToBase64(obj),
    };
  }
  if (typeof obj === "object") {
    const newObj = Array.isArray(obj) ? [] : {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        newObj[key] = serializeBuffers(obj[key]);
      }
    }
    return newObj;
  }
  return obj;
}

function deserializeBuffers(obj) {
  if (!obj) return obj;
  if (
    typeof obj === "object" &&
    obj.__type === "ArrayBuffer" &&
    typeof obj.data === "string"
  ) {
    // Use standard Base64 decoding
    return base64ToArrayBuffer(obj.data);
  }
  if (typeof obj === "object") {
    const newObj = Array.isArray(obj) ? [] : {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        newObj[key] = deserializeBuffers(obj[key]);
      }
    }
    return newObj;
  }
  return obj;
}

// --- SignalProtocolStore Implementation (Partial) ---

export class IndexedDBStore {
  /**
   * @param {string} userId The user ID for namespacing the database.
   */
  constructor(userId) {
    if (!userId) {
      throw new Error("IndexedDBStore requires a userId for namespacing.");
    }
    this.userId = userId;
    console.log(`[IndexedDBStore] Initialized for user: ${this.userId}`);
    // getDb(this.userId); // Don't necessarily need to trigger connection here
  }

  /**
   * Get the stored identity key pair.
   * @returns {Promise<import('@privacyresearch/libsignal-protocol-typescript').KeyPairType | undefined>}
   */
  async getIdentityKeyPair() {
    console.debug("[IndexedDBStore] getIdentityKeyPair called");
    const serialized = await performDbOperation(
      this.userId,
      IDENTITY_STORE_NAME,
      "readonly",
      (store) => store.get("identityKey") // Correct key name used before
    );
    const result = deserializeBuffers(serialized);
    console.debug(
      "[IndexedDBStore] getIdentityKeyPair result:",
      result ? `Found for ${this.userId}` : `Not Found for ${this.userId}`
    );
    return result;
  }

  /**
   * Get the local registration ID.
   * @returns {Promise<number | undefined>}
   */
  async getLocalRegistrationId() {
    console.debug("[IndexedDBStore] getLocalRegistrationId called");
    const regId = await performDbOperation(
      this.userId,
      KEY_STORE_NAME, // Stored in KEY_STORE before
      "readonly",
      (store) => store.get("registrationId")
    );
    console.debug(
      "[IndexedDBStore] getLocalRegistrationId result:",
      regId !== undefined
        ? `${regId} for ${this.userId}`
        : `Not Found for ${this.userId}`
    );
    return regId;
  }

  async isTrustedIdentity(identifier, identityKey /*, direction */) {
    console.debug(`[IndexedDBStore] isTrustedIdentity for ${identifier}`);
    const trusted = await this.loadIdentityKey(identifier);
    if (!trusted) {
      // If not trusted, save the new identity key.
      console.debug(
        `[IndexedDBStore] No trusted identity found for ${identifier}, saving new one.`
      );
      await this.saveIdentity(identifier, identityKey);
      return true; // Trust the newly saved identity
    }
    // Compare existing trusted key with the provided one.
    const trustedB64 = arrayBufferToBase64(trusted);
    const identityKeyB64 = arrayBufferToBase64(identityKey);
    const match = trustedB64 === identityKeyB64;
    console.debug(
      `[IndexedDBStore] Trusted identity comparison for ${identifier}: ${match}`
    );
    return match;
  }

  /**
   * Load a pre-key record.
   * @param {number} keyId
   * @returns {Promise<import('@privacyresearch/libsignal-protocol-typescript').KeyPairType | undefined>}
   */
  async loadPreKey(keyId) {
    console.debug(`[IndexedDBStore] loadPreKey called for keyId: ${keyId}`);
    const serialized = await performDbOperation(
      this.userId,
      PREKEY_STORE_NAME,
      "readonly",
      (store) => store.get(Number(keyId)) // Used Number(keyId) before
    );
    const result = deserializeBuffers(serialized);
    console.debug(
      `[IndexedDBStore] loadPreKey result for ${keyId}:`,
      result ? `Found for ${this.userId}` : `Not Found for ${this.userId}`
    );
    // Ensure the return type matches KeyPairType (pubKey: ArrayBuffer, privKey: ArrayBuffer)
    if (
      result &&
      result.pubKey instanceof ArrayBuffer &&
      result.privKey instanceof ArrayBuffer
    ) {
      return result;
    } else if (serialized) {
      console.warn(
        `[IndexedDBStore] Deserialized PreKey ${keyId} is not the expected KeyPairType:`,
        result
      );
      return undefined;
    }
    return undefined;
  }

  /**
   * Load a session record for the given identifier.
   * @param {string} identifier - The identifier of the session partner (e.g., recipientId.deviceId).
   * @returns {Promise<ArrayBuffer | undefined>} The session record ArrayBuffer, or undefined if not found.
   */
  async loadSession(identifier) {
    console.debug(`[IndexedDBStore] loadSession called for: ${identifier}`);
    let serialized;
    try {
      serialized = await performDbOperation(
        this.userId,
        SESSION_STORE_NAME,
        "readonly",
        (store) => store.get(identifier)
      );
    } catch (dbError) {
      console.error(
        `[IndexedDBStore] Error fetching session record for ${identifier} from DB:`,
        dbError
      );
      return undefined; // Return undefined on DB fetch error
    }

    if (serialized === undefined || serialized === null) {
      console.debug(
        `[IndexedDBStore] No session record found in DB for ${identifier}.`
      );
      return undefined; // Return undefined if nothing was found
    }

    // --- Add Try-Catch for Deserialization & Poison Pill Removal --- START ---
    let sessionRecord;
    try {
      sessionRecord = deserializeBuffers(serialized);
    } catch (deserializationError) {
      console.error(
        `[IndexedDBStore] Corrupt session record found for ${identifier}. Failed to deserialize:`,
        deserializationError,
        "Raw data:",
        serialized
      );
      // Attempt to remove the corrupted record (poison pill removal)
      try {
        await this.removeSession(identifier); // Use the class's removeSession method
        console.warn(
          `[IndexedDBStore] Removed corrupted session record for ${identifier}.`
        );
      } catch (removeError) {
        console.error(
          `[IndexedDBStore] Failed to remove corrupted session record for ${identifier}:`,
          removeError
        );
        // Still return undefined even if removal failed
      }
      return undefined; // Return undefined if deserialization fails
    }
    // --- Add Try-Catch for Deserialization & Poison Pill Removal --- END ---

    console.debug(
      `[IndexedDBStore] loadSession result for ${identifier}:`,
      sessionRecord // Log the actual record or its type
        ? `Found (type: ${typeof sessionRecord}, isArrayBuffer: ${
            sessionRecord instanceof ArrayBuffer
          }) for ${this.userId}`
        : `Not Found or Invalid for ${this.userId}`
    );
    // --- Fix: Return the sessionRecord directly if it's not undefined --- START ---
    // The library now stores session records as objects, not necessarily direct ArrayBuffers.
    // deserializeBuffers should handle the internal structure.
    return sessionRecord; // Return the deserialized record as is (could be object or ArrayBuffer if it was stored as such directly)
    // --- Fix: Return the sessionRecord directly if it's not undefined --- END ---
  }

  /**
   * Load a signed pre-key record.
   * @param {number} keyId - The key ID of the signed pre-key.
   * @returns {Promise<import('@privacyresearch/libsignal-protocol-typescript').KeyPairType | undefined>}
   */
  async loadSignedPreKey(keyId) {
    console.debug(
      `[IndexedDBStore] loadSignedPreKey called for keyId: ${keyId}`
    );
    const serialized = await performDbOperation(
      this.userId,
      SIGNED_PREKEY_STORE_NAME,
      "readonly",
      (store) => store.get(Number(keyId)) // Used Number(keyId) before
    );
    const result = deserializeBuffers(serialized);
    console.debug(
      `[IndexedDBStore] loadSignedPreKey result for ${keyId}:`,
      result ? `Found for ${this.userId}` : `Not Found for ${this.userId}`
    );
    // Ensure the return type matches KeyPairType
    if (
      result &&
      result.pubKey instanceof ArrayBuffer &&
      result.privKey instanceof ArrayBuffer
    ) {
      return result;
    } else if (serialized) {
      console.warn(
        `[IndexedDBStore] Deserialized SignedPreKey ${keyId} is not the expected KeyPairType:`,
        result
      );
      return undefined;
    }
    return undefined;
  }

  /**
   * Load the public identity key for the given identifier.
   * @param {string} identifier - The identifier of the remote user (e.g., recipientId.deviceId).
   * @returns {Promise<ArrayBuffer | undefined>} The public identity key ArrayBuffer, or undefined if not found.
   */
  async loadIdentityKey(identifier) {
    console.debug(`[IndexedDBStore] loadIdentityKey called for: ${identifier}`);
    const serialized = await performDbOperation(
      this.userId,
      IDENTITY_STORE_NAME,
      "readonly",
      (store) => store.get(`identity_${identifier}`)
    );
    const identityKey = deserializeBuffers(serialized);
    console.debug(
      `[IndexedDBStore] loadIdentityKey result for ${identifier}:`,
      identityKey instanceof ArrayBuffer
        ? `Found for ${this.userId}`
        : `Not Found for ${this.userId}`
    );
    return identityKey instanceof ArrayBuffer ? identityKey : undefined;
  }

  /**
   * Store the identity key pair for the local user.
   * @param {import('@privacyresearch/libsignal-protocol-typescript').KeyPairType} identityKeyPair
   * @returns {Promise<void>}
   */
  async storeIdentityKeyPair(identityKeyPair) {
    console.debug("[IndexedDBStore] storeIdentityKeyPair called");
    const serialized = serializeBuffers(identityKeyPair);
    await performDbOperation(
      this.userId,
      IDENTITY_STORE_NAME,
      "readwrite",
      (store) => store.put(serialized, "identityKey") // Correct key name used before
    );
    console.debug(
      `[IndexedDBStore] Stored identity key pair for ${this.userId}.`
    );
  }

  /**
   * Store the local registration ID.
   * @param {number} registrationId
   * @returns {Promise<void>}
   */
  async storeLocalRegistrationId(registrationId) {
    console.debug("[IndexedDBStore] storeLocalRegistrationId called");
    await performDbOperation(
      this.userId,
      KEY_STORE_NAME, // Stored in KEY_STORE before
      "readwrite",
      (store) => store.put(registrationId, "registrationId")
    );
    console.debug(
      `[IndexedDBStore] Stored local registration ID for ${this.userId}.`
    );
  }

  /**
   * Store a pre-key record.
   * @param {number} keyId
   * @param {import('@privacyresearch/libsignal-protocol-typescript').KeyPairType} preKey
   * @returns {Promise<void>}
   */
  async storePreKey(keyId, preKey) {
    console.debug(`[IndexedDBStore] storePreKey called for keyId: ${keyId}`);
    const serialized = serializeBuffers(preKey);
    await performDbOperation(
      this.userId,
      PREKEY_STORE_NAME,
      "readwrite",
      (store) => store.put(serialized, Number(keyId)) // Used Number(keyId) before
    );
    console.debug(
      `[IndexedDBStore] Stored pre-key ${keyId} for ${this.userId}.`
    );
  }

  /**
   * Store a session record for the given identifier.
   * @param {string} identifier - The identifier of the session partner (e.g., recipientId.deviceId).
   * @param {ArrayBuffer} session - The session record ArrayBuffer.
   * @returns {Promise<void>}
   */
  async storeSession(identifier, session) {
    console.debug(`[IndexedDBStore] storeSession called for: ${identifier}`);
    const serialized = serializeBuffers(session); // Session is ArrayBuffer
    await performDbOperation(
      this.userId,
      SESSION_STORE_NAME,
      "readwrite",
      (store) => store.put(serialized, identifier)
    );
    console.debug(
      `[IndexedDBStore] Stored session for ${identifier} for ${this.userId}.`
    );
  }

  /**
   * Store a signed pre-key record.
   * @param {number} keyId
   * @param {import('@privacyresearch/libsignal-protocol-typescript').KeyPairType} signedPreKey
   * @returns {Promise<void>}
   */
  async storeSignedPreKey(keyId, signedPreKey) {
    console.debug(
      `[IndexedDBStore] storeSignedPreKey called for keyId: ${keyId}`
    );
    const serialized = serializeBuffers(signedPreKey);
    await performDbOperation(
      this.userId,
      SIGNED_PREKEY_STORE_NAME,
      "readwrite",
      (store) => store.put(serialized, Number(keyId)) // Used Number(keyId) before
    );
    console.debug(
      `[IndexedDBStore] Stored signed pre-key ${keyId} for ${this.userId}.`
    );
  }

  /**
   * Associate a public identity key with an identifier.
   * Marks the identity as trusted.
   * @param {string} identifier - The identifier of the remote user (e.g., recipientId.deviceId).
   * @param {ArrayBuffer} identityKey - The public identity key ArrayBuffer.
   * @returns {Promise<void>}
   */
  async saveIdentity(identifier, identityKey) {
    console.debug(`[IndexedDBStore] saveIdentity called for: ${identifier}`);
    const serialized = serializeBuffers(identityKey);
    await performDbOperation(
      this.userId,
      IDENTITY_STORE_NAME,
      "readwrite",
      (store) => store.put(serialized, `identity_${identifier}`)
    );
    console.debug(
      `[IndexedDBStore] Saved identity for ${identifier} for ${this.userId}.`
    );
  }

  /**
   * Remove a pre-key record.
   * @param {number} keyId
   * @returns {Promise<void>}
   */
  async removePreKey(keyId) {
    console.debug(`[IndexedDBStore] removePreKey called for keyId: ${keyId}`);
    await performDbOperation(
      this.userId,
      PREKEY_STORE_NAME,
      "readwrite",
      (store) => store.delete(Number(keyId)) // Used Number(keyId) before
    );
    console.debug(
      `[IndexedDBStore] Removed pre-key ${keyId} for ${this.userId}.`
    );
  }

  /**
   * Remove a session record.
   * @param {string} identifier - The identifier of the session partner (e.g., recipientId.deviceId).
   * @returns {Promise<void>}
   */
  async removeSession(identifier) {
    console.debug(`[IndexedDBStore] removeSession called for: ${identifier}`);
    await performDbOperation(
      this.userId,
      SESSION_STORE_NAME,
      "readwrite",
      (store) => store.delete(identifier)
    );
    console.debug(
      `[IndexedDBStore] Removed session for ${identifier} for ${this.userId}.`
    );
  }

  /**
   * Remove a signed pre-key record.
   * @param {number} keyId
   * @returns {Promise<void>}
   */
  async removeSignedPreKey(keyId) {
    console.debug(
      `[IndexedDBStore] removeSignedPreKey called for keyId: ${keyId}`
    );
    await performDbOperation(
      this.userId,
      SIGNED_PREKEY_STORE_NAME,
      "readwrite",
      (store) => store.delete(Number(keyId)) // Used Number(keyId) before
    );
    console.debug(
      `[IndexedDBStore] Removed signed pre-key ${keyId} for ${this.userId}.`
    );
  }

  /**
   * Remove all session records for a given base identifier (user ID).
   * This is NOT part of the standard SignalProtocolStore interface but can be useful.
   * @param {string} identifierBase - The base identifier (e.g., user ID).
   * @returns {Promise<void>}
   */
  async removeAllSessions(identifierBase) {
    console.warn(
      `[IndexedDBStore] removeAllSessions called for base: ${identifierBase} for user ${this.userId}. This is a non-standard operation.`
    );
    await performDbOperation(
      this.userId,
      SESSION_STORE_NAME,
      "readwrite",
      (store) => {
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            // Check if the key (identifier) starts with the base identifier
            if (String(cursor.key).startsWith(identifierBase + ".")) {
              console.debug(
                `[IndexedDBStore] Removing session via removeAllSessions: ${cursor.key} for user ${this.userId}`
              );
              cursor.delete();
            }
            cursor.continue();
          }
        };
        // Return the request object for the helper to handle completion/error
        return cursorReq;
      }
    );
    console.warn(
      `[IndexedDBStore] Finished removeAllSessions for ${identifierBase} for user ${this.userId}.`
    );
  }

  /**
   * Remove the identity key associated with an identifier.
   * @param {string} identifier - The identifier of the remote user (e.g., recipientId.deviceId).
   * @returns {Promise<void>}
   */
  async removeIdentity(identifier) {
    console.debug(`[IndexedDBStore] removeIdentity called for: ${identifier}`);
    // Remove the trusted identity marker
    await performDbOperation(
      this.userId,
      IDENTITY_STORE_NAME,
      "readwrite",
      (store) => store.delete(`identity_${identifier}`)
    );
    // Note: This does NOT remove the local user's identity key pair stored under "identityKey".
    console.debug(
      `[IndexedDBStore] Removed identity trust for ${identifier} for ${this.userId}.`
    );
  }

  /**
   * Check if a session record exists for the given identifier.
   * @param {string} identifier - The identifier of the session partner (e.g., recipientId.deviceId).
   * @returns {Promise<boolean>}
   */
  async containsSession(identifier) {
    console.debug(`[IndexedDBStore] containsSession called for: ${identifier}`);
    const count = await performDbOperation(
      this.userId,
      SESSION_STORE_NAME,
      "readonly",
      (store) => store.count(identifier)
    );
    const exists = count > 0;
    console.debug(
      `[IndexedDBStore] containsSession result for ${identifier}: ${exists} for user ${this.userId}`
    );
    return exists;
  }

  // libsignal older builds might call sessionExists, alias for compatibility
  sessionExists(identifier) {
    return this.containsSession(identifier);
  }

  // libsignal expects deleteSession
  async deleteSession(identifier) {
    console.warn("deleteSession is deprecated/non-standard? Use removeSession");
    return this.removeSession(identifier);
  }

  // libsignal expects deleteAllSessions
  async deleteAllSessions(identifierBase) {
    console.warn(
      "deleteAllSessions is non-standard. Using custom implementation."
    );
    return this.removeAllSessions(identifierBase);
  }

  /**
   * Clears all data from all signal-related object stores for the specific user instance.
   * USE WITH CAUTION.
   * @returns {Promise<void[]>}
   */
  async clearAllData() {
    console.warn(
      `[IndexedDBStore] CLEARING ALL DATA for user ${this.userId}...`
    );
    const storesToClear = [
      KEY_STORE_NAME,
      SESSION_STORE_NAME,
      PREKEY_STORE_NAME,
      SIGNED_PREKEY_STORE_NAME,
      IDENTITY_STORE_NAME,
    ];

    const clearPromises = storesToClear.map((storeName) =>
      performDbOperation(this.userId, storeName, "readwrite", (store) =>
        store.clear()
      )
    );

    return Promise.all(clearPromises).then(() => {
      console.warn(
        `[IndexedDBStore] ALL DATA CLEARED for user ${this.userId}.`
      );
    });
  }
}
