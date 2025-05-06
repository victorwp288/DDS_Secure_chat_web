// import * as signal from "@privacyresearch/libsignal-protocol-typescript"; // REMOVED: No longer needed here

const DB_NAME = "SecureChatDB";
const DB_VERSION = 1;
const KEY_STORE_NAME = "signalKeys";
const SESSION_STORE_NAME = "signalSessions";
// Add other stores as needed by the SignalProtocolStore interface
const PREKEY_STORE_NAME = "signalPreKeys";
const SIGNED_PREKEY_STORE_NAME = "signalSignedPreKeys";
const IDENTITY_STORE_NAME = "signalIdentity"; // For identity key pair

let dbPromise = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      console.log(`Opening IndexedDB: ${DB_NAME} version ${DB_VERSION}`);
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (event) => {
        console.error("IndexedDB error:", event.target.error);
        reject(`IndexedDB error: ${event.target.error}`);
      };

      request.onsuccess = (event) => {
        console.log("IndexedDB opened successfully.");
        const db = event.target.result; // Get the DB instance

        // --- Add event listeners to the DB connection itself --- START ---
        db.onclose = () => {
          console.warn("IndexedDB connection closed unexpectedly.");
          dbPromise = null; // Reset promise so it reopens on next call
        };
        db.onerror = (event) => {
          // Log errors that occur on the connection after it's opened
          console.error(
            "Unhandled IndexedDB database error:",
            event.target.error
          );
          // Optionally close and reset
          dbPromise = null;
        };
        db.onversionchange = () => {
          // Handle requests to upgrade the DB from other tabs/windows
          console.warn(
            "IndexedDB version change requested. Closing old connection..."
          );
          db.close(); // Close the current connection to allow the upgrade
          dbPromise = null; // Reset promise
        };
        // --- Add event listeners to the DB connection itself --- END ---

        resolve(db); // Resolve the promise with the db instance
      };

      // This event only executes if the version number changes
      // or the database is created for the first time.
      request.onupgradeneeded = (event) => {
        console.log("IndexedDB upgrade needed.");
        const db = event.target.result;
        if (!db.objectStoreNames.contains(KEY_STORE_NAME)) {
          console.log(`Creating object store: ${KEY_STORE_NAME}`);
          // Simple key-value store for general keys/data
          db.createObjectStore(KEY_STORE_NAME);
        }
        if (!db.objectStoreNames.contains(SESSION_STORE_NAME)) {
          console.log(`Creating object store: ${SESSION_STORE_NAME}`);
          // Store sessions by address (recipientId.deviceId)
          db.createObjectStore(SESSION_STORE_NAME);
        }
        if (!db.objectStoreNames.contains(PREKEY_STORE_NAME)) {
          console.log(`Creating object store: ${PREKEY_STORE_NAME}`);
          // Store preKeys by keyId
          db.createObjectStore(PREKEY_STORE_NAME);
        }
        if (!db.objectStoreNames.contains(SIGNED_PREKEY_STORE_NAME)) {
          console.log(`Creating object store: ${SIGNED_PREKEY_STORE_NAME}`);
          // Store signedPreKeys by keyId
          db.createObjectStore(SIGNED_PREKEY_STORE_NAME);
        }
        if (!db.objectStoreNames.contains(IDENTITY_STORE_NAME)) {
          console.log(`Creating object store: ${IDENTITY_STORE_NAME}`);
          // Store identity key pair (only one entry expected)
          db.createObjectStore(IDENTITY_STORE_NAME);
        }
        console.log("IndexedDB upgrade complete.");
      };
    });
  }
  return dbPromise;
}

// --- Helper function to perform DB operations ---
async function performDbOperation(storeName, mode, operation) {
  const db = await getDb();
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
        dbPromise = null;
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
  // Remove constructor dependency injection
  constructor() {
    console.log("IndexedDBStore initialized (standard).");
    getDb();
  }

  // --- Getters ---
  async getIdentityKeyPair() {
    console.log("IndexedDBStore: getIdentityKeyPair");
    const kp = await performDbOperation(
      IDENTITY_STORE_NAME,
      "readonly",
      (store) => store.get("identityKey")
    );
    // Use standard deserializer
    return kp ? deserializeBuffers(kp) : undefined;
  }
  // ... other getters using deserializeBuffers will now use standard Base64 ...
  async getLocalRegistrationId() {
    console.log("IndexedDBStore: getLocalRegistrationId");
    return performDbOperation(KEY_STORE_NAME, "readonly", (store) =>
      store.get("registrationId")
    );
  }
  async isTrustedIdentity(identifier, identityKey /*, direction */) {
    console.log(`IndexedDBStore: isTrustedIdentity for ${identifier}`);
    const trusted = await this.loadIdentityKey(identifier);
    if (!trusted) {
      await this.saveIdentity(identifier, identityKey);
      return true;
    }
    // Comparison still needs ArrayBuffers, rely on deserializeBuffers
    // Convert identityKey to ArrayBuffer if it isn't already?
    // Let's assume loadIdentityKey returns ArrayBuffer correctly via deserializeBuffers
    // We need a way to compare ArrayBuffers. Standard === won't work.
    // For now, let's serialize back to Base64 for comparison (less efficient but simple)
    const trustedB64 = arrayBufferToBase64(trusted);
    const identityKeyB64 = arrayBufferToBase64(identityKey);
    return trustedB64 === identityKeyB64;
  }
  async loadPreKey(keyId) {
    console.log(`[DB Store] loadPreKey called for key ID: ${keyId}`);
    const keyPair = await performDbOperation(
      PREKEY_STORE_NAME,
      "readonly",
      (store) => store.get(Number(keyId))
    );
    if (!keyPair) {
      console.warn(`[DB Store] loadPreKey: Key ID ${keyId} not found.`);
    } else {
      console.log(`[DB Store] loadPreKey: Found key for ID ${keyId}.`);
    }
    return keyPair ? deserializeBuffers(keyPair) : undefined;
  }
  async loadSession(identifier) {
    console.log(`IndexedDBStore: loadSession for ${identifier}`);
    if (!identifier) {
      throw new Error("Cannot load session with invalid identifier");
    }
    const session = await performDbOperation(
      SESSION_STORE_NAME,
      "readonly",
      (store) => store.get(identifier)
    );
    console.log(
      `[DB Store] loadSession(${identifier}) result: ${
        session ? "Found" : "Not Found"
      }`,
      session // Log the raw session object
    );
    return session ? deserializeBuffers(session) : undefined; // Re-enable deserialization
  }
  async loadSignedPreKey(keyId) {
    console.log(`[DB Store] loadSignedPreKey called for key ID: ${keyId}`);
    const keyPair = await performDbOperation(
      SIGNED_PREKEY_STORE_NAME,
      "readonly",
      (store) => store.get(keyId)
    );
    if (!keyPair) {
      console.warn(`[DB Store] loadSignedPreKey: Key ID ${keyId} not found.`);
    } else {
      console.log(`[DB Store] loadSignedPreKey: Found key for ID ${keyId}.`);
    }
    return keyPair ? deserializeBuffers(keyPair) : undefined;
  }
  async loadIdentityKey(identifier) {
    console.log(`IndexedDBStore: loadIdentityKey for ${identifier}`);
    const key = await performDbOperation(
      IDENTITY_STORE_NAME,
      "readonly",
      (store) => store.get(`identity_${identifier}`)
    );
    return key ? deserializeBuffers(key) : undefined;
  }

  // --- Setters ---
  async storeIdentityKeyPair(identityKeyPair) {
    console.log("IndexedDBStore: storeIdentityKeyPair");
    // Use standard serializer
    const serializableKP = serializeBuffers(identityKeyPair);
    return performDbOperation(IDENTITY_STORE_NAME, "readwrite", (store) =>
      store.put(serializableKP, "identityKey")
    );
  }
  // ... other setters using serializeBuffers will now use standard Base64 ...
  async storeLocalRegistrationId(registrationId) {
    console.log("IndexedDBStore: storeLocalRegistrationId");
    return performDbOperation(KEY_STORE_NAME, "readwrite", (store) =>
      store.put(registrationId, "registrationId")
    );
  }
  async storePreKey(keyId, preKey) {
    console.log(`IndexedDBStore: storePreKey for ${keyId}`);
    return performDbOperation(PREKEY_STORE_NAME, "readwrite", (store) =>
      store.put(serializeBuffers(preKey), Number(keyId))
    );
  }
  async storeSession(identifier, session) {
    console.log(`IndexedDBStore: storeSession for ${identifier}`);
    if (!identifier) {
      throw new Error("Cannot store session with invalid identifier");
    }
    console.log(
      `[DB Store] storeSession(${identifier}) data:`,
      serializeBuffers(session)
    );
    return performDbOperation(SESSION_STORE_NAME, "readwrite", (store) =>
      store.put(serializeBuffers(session), identifier)
    );
  }
  async storeSignedPreKey(keyId, signedPreKey) {
    console.log(`IndexedDBStore: storeSignedPreKey for ${keyId}`);
    const serializableKey = serializeBuffers(signedPreKey);
    return performDbOperation(SIGNED_PREKEY_STORE_NAME, "readwrite", (store) =>
      store.put(serializableKey, keyId)
    );
  }
  async saveIdentity(identifier, identityKey) {
    console.log(`IndexedDBStore: saveIdentity for ${identifier}`);
    const serializableKey = serializeBuffers(identityKey);
    return performDbOperation(IDENTITY_STORE_NAME, "readwrite", (store) =>
      store.put(serializableKey, `identity_${identifier}`)
    );
  }

  // --- Removers ---
  async removePreKey(keyId) {
    console.warn(
      `[DB Store] NO-OP: removePreKey called for ${keyId}, but deletion is disabled.`
    );
    if (keyId === undefined || keyId === null) {
      throw new Error("Cannot remove PreKey with invalid keyId");
    }
    // Do nothing - keep the key
    return Promise.resolve(); // Return resolved promise to satisfy libsignal
    /* Original implementation:
    return performDbOperation(PREKEY_STORE_NAME, "readwrite", (store) =>
      store.delete(Number(keyId))
    );
    */
  }

  async removeSession(identifier) {
    console.warn(`IndexedDBStore: removeSession for ${identifier}`);
    if (!identifier) {
      throw new Error("Cannot remove session with invalid identifier");
    }
    return performDbOperation(SESSION_STORE_NAME, "readwrite", (store) =>
      store.delete(identifier)
    );
  }

  async removeSignedPreKey(keyId) {
    console.warn(`IndexedDBStore: removeSignedPreKey for ${keyId}`);
    if (keyId === undefined || keyId === null) {
      throw new Error("Cannot remove SignedPreKey with invalid keyId");
    }
    return performDbOperation(SIGNED_PREKEY_STORE_NAME, "readwrite", (store) =>
      store.delete(keyId)
    );
  }

  async removeAllSessions(identifier) {
    console.warn(`IndexedDBStore: removeAllSessions for ${identifier}`);
    // This is more complex - it implies removing all sessions associated
    // with a recipient identifier (e.g., "recipientId" part without deviceId).
    // For simplicity with deviceId=1, this might be the same as removeSession.
    // If multiple devices were supported, you'd need to iterate and delete.
    if (!identifier) {
      throw new Error("Cannot remove sessions with invalid identifier base");
    }
    // Assuming identifier might be just the recipientId for this method
    // We need to delete "recipientId.1", "recipientId.2" etc.
    // For now, just implement for the default deviceId 1
    const fullIdentifier = `${identifier}.1`;
    return this.removeSession(fullIdentifier);
  }

  /**
   * Delete the cached identity-public-key for a peer.
   * @param {string} identifier – full "recipientId.deviceId" string,
   *                              e.g. "2a2d1c4c-7336-41e9-a6d5-cfb980162071.1"
   */
  async removeIdentity(identifier) {
    console.warn(`IndexedDBStore: removeIdentity for ${identifier}`);
    if (!identifier) {
      throw new Error("Cannot remove identity with invalid identifier");
    }
    // Note: The key in the store is prefixed with 'identity_'
    return performDbOperation(IDENTITY_STORE_NAME, "readwrite", (store) =>
      store.delete(`identity_${identifier}`)
    );
  }

  // --- Misc ---

  // --- Add missing methods --- START ---
  async containsSession(identifier) {
    console.log(`IndexedDBStore: containsSession for ${identifier}`);
    if (!identifier) {
      console.warn("[DB Store] containsSession called with invalid identifier");
      return false; // Or throw? Let's return false for boolean check.
    }
    // Check if a session exists by attempting to get it (returns undefined if not found)
    const session = await performDbOperation(
      SESSION_STORE_NAME,
      "readonly",
      (store) => store.get(identifier) // Use get instead of loadSession to avoid deserialization cost
    );
    const exists = session !== undefined; // Check if *any* value was retrieved
    console.log(`[DB Store] containsSession(${identifier}) result: ${exists}`);
    return exists;
  }

  // libsignal older builds might call sessionExists, alias for compatibility
  // Although current error is for containsSession, this is safe to include
  sessionExists(identifier) {
    return this.containsSession(identifier);
  }

  // libsignal expects deleteSession
  async deleteSession(identifier) {
    console.log(`IndexedDBStore: deleteSession for ${identifier}`);
    // Delegate to the existing removeSession logic
    return this.removeSession(identifier);
  }

  // libsignal expects deleteAllSessions
  async deleteAllSessions(identifierBase) {
    console.log(`IndexedDBStore: deleteAllSessions for ${identifierBase}`);
    // Delegate to the existing removeAllSessions logic
    // Note: The current removeAllSessions only handles deviceId 1.
    // Needs refinement if multiple devices are supported.
    return this.removeAllSessions(identifierBase);
  }
  // --- Add missing methods --- END ---

  /**
   * Clears the entire IndexedDB database used by the store.
   * USE WITH CAUTION - This deletes all keys and sessions.
   */
  async clearAllData() {
    console.warn("Clearing all data from SecureChatDB...");
    // Close the connection if open
    if (dbPromise) {
      const db = await dbPromise;
      db.close();
      dbPromise = null; // Reset the promise
    }
    return new Promise((resolve, reject) => {
      const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
      deleteRequest.onsuccess = () => {
        console.log("SecureChatDB deleted successfully.");
        resolve();
      };
      deleteRequest.onerror = (event) => {
        console.error("Error deleting database:", event.target.error);
        reject("Error deleting database");
      };
      deleteRequest.onblocked = () => {
        console.warn(
          "Database deletion blocked. Ensure all connections are closed."
        );
        reject("Database deletion blocked");
      };
    });
  }

  // The libsignal library might expect a Direction enum or similar
  // We can define it here if needed, or adjust isTrustedIdentity if the library passes it
  // static Direction = { SENDING: 1, RECEIVING: 2 };
}

// RE-INSTATE instance creation and export from here
export const signalStore = new IndexedDBStore();

// Optional: Export db functions if needed directly elsewhere
// export { dbSet, dbGet, dbRemove };
