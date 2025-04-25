import * as Signal from "@signalapp/libsignal-client";

// Placeholder for WASM/native module initialization if needed
let isSignalInitialized = false;
async function ensureSignalInitialized() {
  if (!isSignalInitialized) {
    // In a real app, you might need to load WASM here
    // e.g., await Signal.init(); if such a function exists
    // For now, assume it's handled implicitly or not needed for basic ops
    console.log("Signal native module assumed initialized.");
    isSignalInitialized = true;
  }
}

// --- In-Memory Store Implementations (Placeholders) ---

const identityKeyStore = {
  identityKeyPair: null,
  localRegistrationId: null,
  trustedKeys: new Map(), // Map<String(ProtocolAddress), PublicKey>

  async _getIdentityKey() {
    if (!this.identityKeyPair)
      throw new Error("Identity key pair not set in store");
    return this.identityKeyPair.privateKey;
  },
  async _getLocalRegistrationId() {
    if (this.localRegistrationId === null)
      throw new Error("Local registration ID not set in store");
    return this.localRegistrationId;
  },
  async _saveIdentity(address, key) {
    const addressStr = `${Signal.ProtocolAddress_Name(
      address
    )}:${Signal.ProtocolAddress_DeviceId(address)}`;
    const existingKey = this.trustedKeys.get(addressStr);
    if (existingKey && !Signal.PublicKey_Equals(existingKey, key)) {
      console.warn(
        `Identity key changed for ${addressStr}. Trust decision needed.`
      );
      // In a real app, implement trust-on-first-use (TOFU) or manual verification logic here
      // For now, we overwrite but return false indicating a change.
      this.trustedKeys.set(addressStr, key);
      return false; // Indicate key changed
    }
    this.trustedKeys.set(addressStr, key);
    return true; // Indicate key is trusted (or newly saved)
  },
  async _isTrustedIdentity(address, key, _sending) {
    const addressStr = `${Signal.ProtocolAddress_Name(
      address
    )}:${Signal.ProtocolAddress_DeviceId(address)}`;
    const trustedKey = this.trustedKeys.get(addressStr);
    if (!trustedKey) {
      // Automatically trust on first use for this example
      console.log(`Trusting new identity key for ${addressStr} on first use.`);
      this.trustedKeys.set(addressStr, key);
      return true;
    }
    const matches = Signal.PublicKey_Equals(trustedKey, key);
    if (!matches) {
      console.warn(`Untrusted identity key for ${addressStr}`);
    }
    return matches;
  },
  async _getIdentity(address) {
    const addressStr = `${Signal.ProtocolAddress_Name(
      address
    )}:${Signal.ProtocolAddress_DeviceId(address)}`;
    return this.trustedKeys.get(addressStr) || null;
  },

  // Helper to initially set the key pair and registration ID
  setIdentity(keyPair, regId) {
    this.identityKeyPair = keyPair;
    this.localRegistrationId = regId;
    // Save our own identity as trusted
    const ownAddress = Signal.ProtocolAddress_New("self", 1); // Assuming deviceId 1 for self
    this.trustedKeys.set(
      `${Signal.ProtocolAddress_Name(
        ownAddress
      )}:${Signal.ProtocolAddress_DeviceId(ownAddress)}`,
      keyPair.publicKey
    );
  },
};

const sessionStore = {
  sessions: new Map(), // Map<String(ProtocolAddress), SerializedSessionRecord>
  async _saveSession(address, record) {
    const addressStr = `${Signal.ProtocolAddress_Name(
      address
    )}:${Signal.ProtocolAddress_DeviceId(address)}`;
    const serialized = Signal.SessionRecord_Serialize(record);
    this.sessions.set(addressStr, serialized);
    console.log(`Saved session for ${addressStr}`);
  },
  async _getSession(address) {
    const addressStr = `${Signal.ProtocolAddress_Name(
      address
    )}:${Signal.ProtocolAddress_DeviceId(address)}`;
    const serialized = this.sessions.get(addressStr);
    if (serialized) {
      console.log(`Loaded session for ${addressStr}`);
      return Signal.SessionRecord_Deserialize(serialized);
    }
    console.log(`No session found for ${addressStr}`);
    return null;
  },
};

const preKeyStore = {
  preKeys: new Map(), // Map<Number(preKeyId), SerializedPreKeyRecord>
  async _savePreKey(preKeyId, record) {
    const serialized = Signal.PreKeyRecord_Serialize(record);
    this.preKeys.set(preKeyId, serialized);
  },
  async _getPreKey(preKeyId) {
    const serialized = this.preKeys.get(preKeyId);
    if (!serialized) throw new Error(`PreKey ${preKeyId} not found`);
    return Signal.PreKeyRecord_Deserialize(serialized);
  },
  async _removePreKey(preKeyId) {
    this.preKeys.delete(preKeyId);
  },
};

const signedPreKeyStore = {
  signedPreKeys: new Map(), // Map<Number(signedPreKeyId), SerializedSignedPreKeyRecord>
  async _saveSignedPreKey(signedPreKeyId, record) {
    const serialized = Signal.SignedPreKeyRecord_Serialize(record);
    this.signedPreKeys.set(signedPreKeyId, serialized);
  },
  async _getSignedPreKey(signedPreKeyId) {
    const serialized = this.signedPreKeys.get(signedPreKeyId);
    if (!serialized)
      throw new Error(`Signed PreKey ${signedPreKeyId} not found`);
    return Signal.SignedPreKeyRecord_Deserialize(serialized);
  },
  // Note: Removal isn't usually needed for signed prekeys like one-time prekeys
};

// Placeholder Kyber store - adjust if PQ crypto is actually used
const kyberPreKeyStore = {
  kyberKeys: new Map(),
  async _saveKyberPreKey(kyberPreKeyId, record) {
    // console.log(`Saving Kyber PreKey ${kyberPreKeyId}`);
    // const serialized = Signal.KyberPreKeyRecord_Serialize(record);
    // this.kyberKeys.set(kyberPreKeyId, serialized);
    // No-op for now
  },
  async _getKyberPreKey(kyberPreKeyId) {
    // console.log(`Getting Kyber PreKey ${kyberPreKeyId}`);
    // const serialized = this.kyberKeys.get(kyberPreKeyId);
    // if (!serialized) throw new Error(`Kyber PreKey ${kyberPreKeyId} not found`);
    // return Signal.KyberPreKeyRecord_Deserialize(serialized);
    throw new Error(
      `Kyber PreKey ${kyberPreKeyId} not found (store not implemented)`
    );
  },
  async _markKyberPreKeyUsed(kyberPreKeyId) {
    // console.log(`Marking Kyber PreKey ${kyberPreKeyId} used`);
    // No-op for now
  },
};

// --- Signal Protocol Functions ---

/**
 * Generates initial Signal keys and registration ID.
 * @returns {Promise<object>} Object containing serialized keys and registration ID.
 *   - identityKeyPair: { publicKey: Buffer, privateKey: Buffer }
 *   - registrationId: number
 *   - preKeys: Array<{ keyId: number, keyPair: { publicKey: Buffer, privateKey: Buffer } }>
 *   - signedPreKey: { keyId: number, keyPair: { publicKey: Buffer, privateKey: Buffer }, signature: Buffer, timestamp: number }
 */
export async function generateSignalKeys() {
  await ensureSignalInitialized();

  // 1. Identity Key Pair
  const identityPrivKey = Signal.PrivateKey_Generate();
  const identityPubKey = Signal.PrivateKey_GetPublicKey(identityPrivKey);
  const identityKeyPairRaw = {
    publicKey: identityPubKey,
    privateKey: identityPrivKey,
  };

  // 2. Registration ID (Generate manually as library doesn't expose a helper)
  const registrationId = Math.floor(Math.random() * 16380) + 1; // Range used by original libsignal

  // Store identity info (using raw objects before serializing for return)
  identityKeyStore.setIdentity(identityKeyPairRaw, registrationId);

  // 3. PreKeys (Generate a batch, e.g., 100)
  const preKeys = [];
  const preKeyPromises = [];
  const startPreKeyId = 1; // Or fetch highest known ID + 1
  for (let i = 0; i < 100; i++) {
    const preKeyId = startPreKeyId + i;
    const prePrivKey = Signal.PrivateKey_Generate();
    const prePubKey = Signal.PrivateKey_GetPublicKey(prePrivKey);
    const record = Signal.PreKeyRecord_New(preKeyId, prePubKey, prePrivKey);
    preKeys.push({
      keyId: preKeyId,
      keyPair: {
        publicKey: Signal.PublicKey_Serialize(prePubKey),
        privateKey: Signal.PrivateKey_Serialize(prePrivKey), // Store private part too
      },
    });
    preKeyPromises.push(preKeyStore._savePreKey(preKeyId, record));
  }
  await Promise.all(preKeyPromises);
  console.log(`Generated and stored ${preKeys.length} pre-keys.`);

  // 4. Signed PreKey
  const signedPreKeyId = 1; // Or fetch highest known ID + 1
  const signedPrivKey = Signal.PrivateKey_Generate();
  const signedPubKey = Signal.PrivateKey_GetPublicKey(signedPrivKey);
  const timestamp = Date.now();
  // Sign the *public* signed prekey with the *private* identity key
  const signature = Signal.PrivateKey_Sign(
    identityPrivKey,
    Signal.PublicKey_Serialize(signedPubKey)
  );
  const signedPreKeyRecord = Signal.SignedPreKeyRecord_New(
    signedPreKeyId,
    timestamp,
    signedPubKey,
    signedPrivKey,
    signature
  );
  await signedPreKeyStore._saveSignedPreKey(signedPreKeyId, signedPreKeyRecord);
  console.log(`Generated and stored signed pre-key ID ${signedPreKeyId}.`);

  const signedPreKey = {
    keyId: signedPreKeyId,
    keyPair: {
      publicKey: Signal.PublicKey_Serialize(signedPubKey),
      privateKey: Signal.PrivateKey_Serialize(signedPrivKey), // Store private part too
    },
    signature: signature,
    timestamp: timestamp,
  };

  return {
    identityKeyPair: {
      publicKey: Signal.PublicKey_Serialize(identityPubKey),
      privateKey: Signal.PrivateKey_Serialize(identityPrivKey),
    },
    registrationId: registrationId,
    preKeys: preKeys, // Already serialized
    signedPreKey: signedPreKey, // Already serialized/prepared
  };
}

/**
 * Establishes a Signal session using the recipient's pre-key bundle.
 * @param {string} recipientId - Identifier for the recipient (e.g., phone number, UUID).
 * @param {number} deviceId - The recipient's device ID.
 * @param {object} preKeyBundleData - The recipient's pre-key bundle data.
 *   - identityKey: Buffer (serialized PublicKey)
 *   - registrationId: number
 *   - preKey: { keyId: number, publicKey: Buffer (serialized PublicKey) } | null
 *   - signedPreKey: { keyId: number, publicKey: Buffer (serialized PublicKey), signature: Buffer }
 *   - kyberPreKey: { keyId: number, publicKey: Buffer (serialized KyberPublicKey), signature: Buffer } | null // Optional PQ crypto
 */
export async function establishSession(
  recipientId,
  deviceId,
  preKeyBundleData
) {
  await ensureSignalInitialized();
  const address = Signal.ProtocolAddress_New(recipientId, deviceId);

  // Deserialize keys from the bundle data
  const identityKey = Signal.PublicKey_Deserialize(
    preKeyBundleData.identityKey
  );
  const registrationId = preKeyBundleData.registrationId;
  const preKeyId = preKeyBundleData.preKey
    ? preKeyBundleData.preKey.keyId
    : null;
  const preKeyPublic = preKeyBundleData.preKey
    ? Signal.PublicKey_Deserialize(preKeyBundleData.preKey.publicKey)
    : null;
  const signedPreKeyId = preKeyBundleData.signedPreKey.keyId;
  const signedPreKeyPublic = Signal.PublicKey_Deserialize(
    preKeyBundleData.signedPreKey.publicKey
  );
  const signedPreKeySignature = preKeyBundleData.signedPreKey.signature;

  // Handle optional Kyber/PQ keys (stubbed for now)
  const kyberPreKeyId = preKeyBundleData.kyberPreKey
    ? preKeyBundleData.kyberPreKey.keyId
    : null;
  const kyberPreKeyPublic = preKeyBundleData.kyberPreKey
    ? Signal.KyberPublicKey_Deserialize(preKeyBundleData.kyberPreKey.publicKey)
    : null;
  const kyberPreKeySignature = preKeyBundleData.kyberPreKey
    ? preKeyBundleData.kyberPreKey.signature
    : Buffer.alloc(0); // Provide empty buffer if null

  // Construct the PreKeyBundle object needed by the library
  // Note: The `PreKeyBundle_New` function expects the Kyber signature even if Kyber key is null.
  // Check if Kyber key exists, if not, pass an empty buffer for its signature.
  const actualKyberSignature = kyberPreKeyPublic
    ? kyberPreKeySignature
    : Buffer.alloc(0);

  const bundle = Signal.PreKeyBundle_New(
    registrationId,
    deviceId,
    preKeyId,
    preKeyPublic, // Pass the wrapper or null
    signedPreKeyId,
    signedPreKeyPublic, // Pass the wrapper
    signedPreKeySignature,
    identityKey, // Pass the wrapper
    kyberPreKeyId,
    kyberPreKeyPublic, // Pass the wrapper or null
    actualKyberSignature // Pass the actual signature or empty buffer
  );

  console.log(`Processing pre-key bundle for ${recipientId}:${deviceId}`);
  try {
    await Signal.SessionBuilder_ProcessPreKeyBundle(
      bundle,
      address,
      sessionStore,
      identityKeyStore,
      Date.now()
    );
    console.log(
      `Session established successfully with ${recipientId}:${deviceId}`
    );
  } catch (error) {
    console.error(
      `Failed to process pre-key bundle for ${recipientId}:${deviceId}`,
      error
    );
    throw error;
  }
}

/**
 * Encrypts a message for a recipient.
 * @param {string} recipientId - Identifier for the recipient.
 * @param {number} deviceId - The recipient's device ID.
 * @param {string | Buffer} message - The plaintext message.
 * @returns {Promise<{type: number, body: Buffer}>} The encrypted message (CiphertextMessage).
 *          type: 1 (PreKeySignalMessage) or 3 (SignalMessage)
 *          body: Serialized ciphertext Buffer
 */
export async function encryptMessage(recipientId, deviceId, message) {
  await ensureSignalInitialized();
  const address = Signal.ProtocolAddress_New(recipientId, deviceId);
  const plaintextBuffer = Buffer.isBuffer(message)
    ? message
    : Buffer.from(message, "utf8");

  console.log(`Encrypting message for ${recipientId}:${deviceId}`);
  try {
    const ciphertextMessage = await Signal.SessionCipher_EncryptMessage(
      plaintextBuffer,
      address,
      sessionStore,
      identityKeyStore,
      Date.now()
    );

    const messageType = Signal.CiphertextMessage_Type(ciphertextMessage);
    const serializedCiphertext =
      Signal.CiphertextMessage_Serialize(ciphertextMessage);

    console.log(
      `Encryption successful for ${recipientId}:${deviceId}. Type: ${
        messageType === 1 ? "PreKey" : "Signal"
      }`
    );
    return {
      type: messageType, // 1 for PreKeySignalMessage, 3 for SignalMessage
      body: serializedCiphertext,
    };
  } catch (error) {
    console.error(
      `Failed to encrypt message for ${recipientId}:${deviceId}`,
      error
    );
    throw error;
  }
}

/**
 * Decrypts a received Signal message.
 * @param {string} senderId - Identifier for the sender.
 * @param {number} deviceId - The sender's device ID.
 * @param {number} messageType - The type of the message (1 for PreKeySignalMessage, 3 for SignalMessage).
 * @param {Buffer} messageBuffer - The serialized ciphertext Buffer.
 * @returns {Promise<Buffer>} The decrypted plaintext Buffer.
 */
export async function decryptMessage(
  senderId,
  deviceId,
  messageType,
  messageBuffer
) {
  await ensureSignalInitialized();
  const address = Signal.ProtocolAddress_New(senderId, deviceId);

  console.log(
    `Decrypting message type ${messageType} from ${senderId}:${deviceId}`
  );
  let plaintextBuffer;

  try {
    if (messageType === 1) {
      // PreKeySignalMessage
      const preKeyMessage =
        Signal.PreKeySignalMessage_Deserialize(messageBuffer);
      plaintextBuffer = await Signal.SessionCipher_DecryptPreKeySignalMessage(
        preKeyMessage,
        address,
        sessionStore,
        identityKeyStore,
        preKeyStore,
        signedPreKeyStore,
        kyberPreKeyStore // Pass Kyber store even if unused
      );
      console.log(`Decrypted PreKeySignalMessage from ${senderId}:${deviceId}`);
    } else if (messageType === 3) {
      // SignalMessage
      const signalMessage = Signal.SignalMessage_Deserialize(messageBuffer);
      plaintextBuffer = await Signal.SessionCipher_DecryptSignalMessage(
        signalMessage,
        address,
        sessionStore,
        identityKeyStore
      );
      console.log(`Decrypted SignalMessage from ${senderId}:${deviceId}`);
    } else {
      throw new Error(`Unsupported message type: ${messageType}`);
    }
    return plaintextBuffer;
  } catch (error) {
    console.error(
      `Failed to decrypt message from ${senderId}:${deviceId}`,
      error
    );
    throw error;
  }
}

/**
 * Clears all stored Signal data (keys, sessions). Use with caution.
 */
export function clearSignalData() {
  identityKeyStore.identityKeyPair = null;
  identityKeyStore.localRegistrationId = null;
  identityKeyStore.trustedKeys.clear();
  sessionStore.sessions.clear();
  preKeyStore.preKeys.clear();
  signedPreKeyStore.signedPreKeys.clear();
  kyberPreKeyStore.kyberKeys.clear(); // Assuming it has a clear method or similar structure
  console.log("Cleared all in-memory Signal data.");
  isSignalInitialized = false; // Force re-check on next operation
}

// --- Example Usage (Optional - Can be removed or run separately) ---
/*
async function runExample() {
    try {
        console.log("Generating keys for Alice...");
        const aliceKeys = await generateSignalKeys();
        console.log("Alice Keys Generated:", !!aliceKeys);
        // Simulate storing/retrieving Alice's identity for session establishment later
        const aliceIdentityPubKey = Signal.PublicKey_Deserialize(aliceKeys.identityKeyPair.publicKey);
        const aliceIdentityPrivKey = Signal.PrivateKey_Deserialize(aliceKeys.identityKeyPair.privateKey);
        identityKeyStore.setIdentity({ publicKey: aliceIdentityPubKey, privateKey: aliceIdentityPrivKey }, aliceKeys.registrationId);


        console.log("
Generating keys for Bob...");
        // Simulate Bob's side (in a separate instance/context)
        const bobStore = { // Create separate stores for Bob
            identityKeyStore: { ...identityKeyStore, trustedKeys: new Map() }, // Clone and reset trusted keys
            sessionStore: { ...sessionStore, sessions: new Map() },
            preKeyStore: { ...preKeyStore, preKeys: new Map() },
            signedPreKeyStore: { ...signedPreKeyStore, signedPreKeys: new Map() },
            kyberPreKeyStore: { ...kyberPreKeyStore, kyberKeys: new Map() }
        };
        // Temporarily switch global stores to Bob's context for generation
        const originalStores = { identityKeyStore, sessionStore, preKeyStore, signedPreKeyStore, kyberPreKeyStore };
        Object.assign(global, bobStore); // Hacky way to switch context for generateSignalKeys

        const bobKeys = await generateSignalKeys(); // Bob generates his keys using his stores
        console.log("Bob Keys Generated:", !!bobKeys);

        // Restore Alice's context
         Object.assign(global, originalStores);
         identityKeyStore.setIdentity({ publicKey: aliceIdentityPubKey, privateKey: aliceIdentityPrivKey }, aliceKeys.registrationId); // Ensure Alice's ID is back

        // --- Session Establishment (Alice initiates with Bob) ---
        console.log("
Alice establishing session with Bob...");
        // Alice needs Bob's pre-key bundle components
        const bobPreKeyBundleData = {
            identityKey: bobKeys.identityKeyPair.publicKey,
            registrationId: bobKeys.registrationId,
            preKey: bobKeys.preKeys[0], // Use one of Bob's pre-keys
             signedPreKey: bobKeys.signedPreKey,
             kyberPreKey: null // Assuming no PQ crypto for simplicity
        };

        // Ensure Alice trusts Bob's identity key (simulate adding it)
         // In real app, this might happen via QR scan, contact list, etc.
         const bobAddress = Signal.ProtocolAddress_New("bob", 1);
         const bobIdentityKey = Signal.PublicKey_Deserialize(bobKeys.identityKeyPair.publicKey);
         await identityKeyStore._saveIdentity(bobAddress, bobIdentityKey); // Alice saves Bob's ID

        await establishSession("bob", 1, bobPreKeyBundleData); // Alice uses Bob's bundle

        // --- Encryption (Alice sends to Bob) ---
        console.log("
Alice encrypting message for Bob...");
        const messageToBob = "Hello Bob!";
        const encryptedMsg = await encryptMessage("bob", 1, messageToBob);
        console.log("Encrypted Message:", encryptedMsg);

        // --- Decryption (Bob receives from Alice) ---
        console.log("
Bob decrypting message from Alice...");
        // Bob needs Alice's address info and the encrypted message
        // Switch context to Bob
        Object.assign(global, bobStore);
         const bobIdentityPubKey = Signal.PublicKey_Deserialize(bobKeys.identityKeyPair.publicKey);
         const bobIdentityPrivKey = Signal.PrivateKey_Deserialize(bobKeys.identityKeyPair.privateKey);
         identityKeyStore.setIdentity({ publicKey: bobIdentityPubKey, privateKey: bobIdentityPrivKey }, bobKeys.registrationId); // Bob loads his ID


         // Bob needs to establish session from Alice's perspective (using the message)
         // The decryption call handles session creation implicitly if it's a PreKeySignalMessage
         // Ensure Bob trusts Alice's identity key
         const aliceAddress = Signal.ProtocolAddress_New("alice", 1); // Assuming Alice is device 1
         await identityKeyStore._saveIdentity(aliceAddress, aliceIdentityPubKey); // Bob saves Alice's ID

         const decryptedBuffer = await decryptMessage("alice", 1, encryptedMsg.type, encryptedMsg.body);
         console.log("Decrypted Message:", decryptedBuffer.toString('utf8'));

         if (decryptedBuffer.toString('utf8') !== messageToBob) {
             throw new Error("Decryption failed: Message mismatch!");
         }

        console.log("
Example completed successfully!");
         // Restore Alice's context if needed
         Object.assign(global, originalStores);


    } catch (error) {
        console.error("
--- Example Failed ---");
        console.error(error);
    } finally {
        clearSignalData(); // Clean up stores
    }
}

// Uncomment to run the example when the script executes
// runExample();
*/
