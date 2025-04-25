import * as signal from '@signalapp/libsignal-client';
import { get, set, del } from 'idb-keyval';

// Utility to convert ArrayBuffer/Uint8Array to base64 for storage
function bufferToBase64(buffer) {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  return btoa(String.fromCharCode(...bytes));
}

// Utility to convert base64 to Uint8Array
function base64ToBuffer(base64) {
  if (!base64) return new Uint8Array(0);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Utility to safely convert data to Uint8Array
function safeUint8Array(data) {
  if (!data) return new Uint8Array(0);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (data instanceof Uint8Array) return data;
  if (Array.isArray(data)) return new Uint8Array(data);
  if (typeof data === 'string') return new TextEncoder().encode(data);
  throw new Error(`Unsupported data type: ${typeof data}`);
}

class CryptoStore {
  constructor(userId) {
    this.userId = userId;
  }

  // Helper to generate storage key
  #getKey(key) {
    return `${this.userId}-${key}`;
  }

  // Basic CRUD operations
  async put(key, value) {
    try {
      // Serialize ArrayBuffer/Uint8Array to base64 for storage
      if (value instanceof ArrayBuffer || value instanceof Uint8Array) {
        value = bufferToBase64(value);
      } else if (typeof value === 'object' && value !== null) {
        // Serialize key pairs or complex objects
        const serialized = {};
        for (const [k, v] of Object.entries(value)) {
          serialized[k] = v instanceof ArrayBuffer || v instanceof Uint8Array ? bufferToBase64(v) : v;
        }
        value = serialized;
      }
      await set(this.#getKey(key), value);
    } catch (e) {
      console.error('Storage put failed:', { key, error: e });
      throw e;
    }
  }

  async get(key) {
    try {
      const value = await get(this.#getKey(key));
      if (!value) return null;
      // Deserialize base64 to Uint8Array for buffers
      if (typeof value === 'string') {
        return base64ToBuffer(value);
      } else if (typeof value === 'object' && value !== null) {
        // Deserialize key pairs or complex objects
        const deserialized = {};
        for (const [k, v] of Object.entries(value)) {
          deserialized[k] = typeof v === 'string' && v.length > 0 ? base64ToBuffer(v) : v;
        }
        return deserialized;
      }
      return value;
    } catch (e) {
      console.error('Storage get failed:', { key, error: e });
      throw e;
    }
  }

  async remove(key) {
    try {
      await del(this.#getKey(key));
    } catch (e) {
      console.error('Storage remove failed:', { key, error: e });
      throw e;
    }
  }

  // Identity Management
  async getIdentityKeyPair() {
    const keyPair = await this.get('identityKey');
    if (!keyPair) return null;
    return signal.PrivateKey.deserialize(keyPair.privKey).getKeyPair();
  }

  async saveIdentity(identifier, identityKey) {
    await this.put(`identity-${identifier}`, identityKey);
    return true;
  }

  async isTrustedIdentity(identifier, identityKey) {
    const existing = await this.get(`identity-${identifier}`);
    if (!existing) return true; // Trust on first use
    return existing.toString() === identityKey.toString();
  }

  // PreKey Management
  async storePreKey(keyId, keyPair) {
    await this.put(`preKey-${keyId}`, {
      pubKey: keyPair.getPublicKey().serialize(),
      privKey: keyPair.getPrivateKey().serialize(),
    });
  }

  async getPreKey(keyId) {
    const key = await this

.get(`preKey-${keyId}`);
    if (!key) return null;
    const pubKey = signal.PublicKey.deserialize(key.pubKey);
    const privKey = signal.PrivateKey.deserialize(key.privKey);
    return { keyId, keyPair: new signal.KeyPair(pubKey, privKey) };
  }

  async removePreKey(keyId) {
    await this.remove(`preKey-${keyId}`);
  }

  // Signed PreKey Management
  async storeSignedPreKey(keyId, signedPreKey) {
    await this.put(`signedPreKey-${keyId}`, {
      pubKey: signedPreKey.getPublicKey().serialize(),
      privKey: signedPreKey.getPrivateKey().serialize(),
      signature: signedPreKey.getSignature(),
    });
  }

  async getSignedPreKey(keyId) {
    const key = await this.get(`signedPreKey-${keyId}`);
    if (!key) return null;
    const pubKey = signal.PublicKey.deserialize(key.pubKey);
    const privKey = signal.PrivateKey.deserialize(key.privKey);
    return {
      keyId,
      keyPair: new signal.KeyPair(pubKey, privKey),
      signature: key.signature,
    };
  }

  // Session Management
  async storeSession(identifier, record) {
    await this.put(`session-${identifier}`, record);
  }

  async getSession(identifier) {
    return this.get(`session-${identifier}`);
  }

  async removeSession(identifier) {
    await this.remove(`session-${identifier}`);
  }

  async getAllSessions() {
    const sessions = [];
    // Note: idb-keyval doesn't support iterating all keys, so we need to maintain a session list
    // For simplicity, assume sessions are tracked elsewhere or extend idb-keyval
    return sessions;
  }
}

async function initializeKeys(userId) {
  try {
    // Verify WebCrypto
    if (!global.crypto?.subtle?.importKey) {
      throw new Error('WebCrypto implementation incomplete - subtle crypto missing');
    }

    const store = new CryptoStore(userId);
    const identityKeyPair = await signal.PrivateKey.generate();
    const registrationId = signal.ProtocolAddress.new(userId, 1).deviceId();

    await store.put('identityKey', {
      pubKey: identityKeyPair.getPublicKey().serialize(),
      privKey: identityKeyPair.serialize(),
    });
    await store.put('registrationId', registrationId);

    return { store, identityKeyPair, registrationId };
  } catch (error) {
    console.error('Key initialization failed:', {
      error,
      cryptoAvailable: !!global.crypto,
      subtleAvailable: !!global.crypto?.subtle,
    });
    throw error;
  }
}

async function generatePreKeys(userId, preKeyId, signedPreKeyId) {
  try {
    const { store, identityKeyPair } = await initializeKeys(userId);

    const preKey = await signal.PreKeyRecord.new(preKeyId, await signal.PrivateKey.generate());
    const signedPreKey = await signal.SignedPreKeyRecord.new(
      signedPreKeyId,
      Date.now(),
      await signal.PrivateKey.generate(),
      identityKeyPair
    );

    await store.storePreKey(preKeyId, preKey.getKeyPair());
    await store.storeSignedPreKey(signedPreKeyId, signedPreKey);

    return {
      identityKey: identityKeyPair.getPublicKey().serialize(),
      registrationId: await store.get('registrationId'),
      preKey: {
        keyId: preKeyId,
        publicKey: preKey.getKeyPair().getPublicKey().serialize(),
      },
      signedPreKey: {
        keyId: signedPreKeyId,
        publicKey: signedPreKey.getKeyPair().getPublicKey().serialize(),
        signature: signedPreKey.getSignature(),
      },
    };
  } catch (error) {
    console.error('PreKey generation failed:', { error });
    throw error;
  }
}

async function initiateX3DH(senderId, recipientId, preKeyBundle) {
  try {
    const { store } = await initializeKeys(senderId);
    const recipientAddress = signal.ProtocolAddress.new(recipientId, 1);

    // Create a safe prekey bundle
    const safeBundle = signal.PreKeyBundle.new(
      preKeyBundle.registrationId,
      recipientAddress.deviceId(),
      preKeyBundle.preKey.keyId,
      signal.PublicKey.deserialize(safeUint8Array(preKeyBundle.preKey.publicKey)),
      preKeyBundle.signedPreKey.keyId,
      signal.PublicKey.deserialize(safeUint8Array(preKeyBundle.signedPreKey.publicKey)),
      safeUint8Array(preKeyBundle.signedPreKey.signature),
      signal.PublicKey.deserialize(safeUint8Array(preKeyBundle.identityKey))
    );

    const sessionBuilder = new signal.SessionBuilder(
      store,
      recipientAddress
    );
    await sessionBuilder.processPreKey(safeBundle);

    return { success: true };
  } catch (error) {
    console.error('Session initiation failed:', {
      error,
      bundle: preKeyBundle,
      arrayTypes: {
        identityKey: preKeyBundle.identityKey?.constructor?.name,
        preKeyPublic: preKeyBundle.preKey.publicKey?.constructor?.name,
        signedPreKeyPublic: preKeyBundle.signedPreKey.publicKey?.constructor?.name,
        signature: preKeyBundle.signedPreKey.signature?.constructor?.name,
      },
    });
    throw error;
  }
}

async function encryptMessage(senderId, recipientId, message) {
  try {
    const { store } = await initializeKeys(senderId);
    const recipientAddress = signal.ProtocolAddress.new(recipientId, 1);
    const cipher = new signal.SessionCipher(store, recipientAddress);

    const messageBuffer = safeUint8Array(message);
    return await cipher.encrypt(messageBuffer);
  } catch (error) {
    console.error('Message encryption failed:', { error, message });
    throw error;
  }
}

async function decryptMessage(recipientId, senderId, ciphertext) {
  try {
    const { store } = await initializeKeys(recipientId);
    const senderAddress = signal.ProtocolAddress.new(senderId, 1);
    const cipher = new signal.SessionCipher(store, senderAddress);

    if (ciphertext.type === signal.MessageType.PREKEY) {
      return new TextDecoder().decode(
        await cipher.decryptPreKey(ciphertext)
      );
    } else {
      return new TextDecoder().decode(
        await cipher.decrypt(ciphertext)
      );
    }
  } catch (error) {
    console.error('Message decryption failed:', { error, ciphertext });
    throw error;
  }
}

export {
  initializeKeys,
  generatePreKeys,
  initiateX3DH,
  encryptMessage,
  decryptMessage,
};