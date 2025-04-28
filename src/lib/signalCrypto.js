import { get, set } from 'idb-keyval';

const { subtle } = crypto;

// Generate an ECDH key pair
async function generateKeyPair() {
  try {
    return await subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: 'P-256',
      },
      true,
      ['deriveKey', 'deriveBits']
    );
  } catch (error) {
    throw new Error(`Failed to generate key pair: ${error.message}`);
  }
}

// Initialize keys for a user
async function initializeKeys(userId) {
  try {
    const identityKeyPair = await generateKeyPair();
    const preKeyPair = await generateKeyPair();

    await set(`${userId}:identityKey`, {
      publicKey: await subtle.exportKey('jwk', identityKeyPair.publicKey),
      privateKey: await subtle.exportKey('jwk', identityKeyPair.privateKey),
    });
    await set(`${userId}:preKey`, {
      publicKey: await subtle.exportKey('jwk', preKeyPair.publicKey),
      privateKey: await subtle.exportKey('jwk', preKeyPair.privateKey),
    });

    return {
      identityKey: await subtle.exportKey('spki', identityKeyPair.publicKey),
      preKey: await subtle.exportKey('spki', preKeyPair.publicKey),
    };
  } catch (error) {
    throw new Error(`Failed to initialize keys for ${userId}: ${error.message}`);
  }
}

// Retrieve stored keys
async function getKeys(userId) {
  try {
    const identityKeyData = await get(`${userId}:identityKey`);
    const preKeyData = await get(`${userId}:preKey`);

    if (!identityKeyData || !preKeyData) {
      throw new Error('Keys not found in storage');
    }

    const identityKeyPair = {
      publicKey: await subtle.importKey(
        'jwk',
        identityKeyData.publicKey,
        { name: 'ECDH', namedCurve: 'P-256' },
        false,
        []
      ),
      privateKey: await subtle.importKey(
        'jwk',
        identityKeyData.privateKey,
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveKey', 'deriveBits']
      ),
    };
    const preKeyPair = {
      publicKey: await subtle.importKey(
        'jwk',
        preKeyData.publicKey,
        { name: 'ECDH', namedCurve: 'P-256' },
        false,
        []
      ),
      privateKey: await subtle.importKey(
        'jwk',
        preKeyData.privateKey,
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveKey', 'deriveBits']
      ),
    };

    return { identityKeyPair, preKeyPair };
  } catch (error) {
    throw new Error(`Failed to retrieve keys for ${userId}: ${error.message}`);
  }
}

// Perform X3DH key agreement
async function initiateX3DH(ourUserId, theirUserId, theirPublicKeys) {
  try {
    const { identityKeyPair, preKeyPair } = await getKeys(ourUserId);

    // Import their public identity key
    const theirIdentityKey = await subtle.importKey(
      'spki',
      theirPublicKeys.identityKey,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    );

    // Derive shared secret using our identity private key and their identity public key
    const sharedSecret = await subtle.deriveBits(
      {
        name: 'ECDH',
        public: theirIdentityKey,
      },
      identityKeyPair.privateKey,
      256
    );

    // Log shared secret for debugging
    const sharedSecretHex = Array.from(new Uint8Array(sharedSecret))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    console.log(`Shared secret for ${ourUserId} -> ${theirUserId}: ${sharedSecretHex}`);

    // Convert to AES-GCM key
    const derivedKey = await subtle.importKey(
      'raw',
      sharedSecret,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );

    await set(`${ourUserId}:sharedKey:${theirUserId}`, derivedKey);
    return derivedKey;
  } catch (error) {
    throw new Error(`X3DH failed for ${ourUserId} -> ${theirUserId}: ${error.message}`);
  }
}

// Encrypt a message
async function encryptMessage(userId, recipientId, message) {
  try {
    const sharedKey = await get(`${userId}:sharedKey:${recipientId}`);
    if (!sharedKey) throw new Error('Shared key not found');

    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const ciphertext = await subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      sharedKey,
      data
    );

    return {
      iv: iv.buffer,
      ciphertext,
    };
  } catch (error) {
    throw new Error(`Encryption failed for ${userId} -> ${recipientId}: ${error.message}`);
  }
}

// Decrypt a message
async function decryptMessage(userId, senderId, { iv, ciphertext }) {
  try {
    const sharedKey = await get(`${userId}:sharedKey:${senderId}`);
    if (!sharedKey) throw new Error('Shared key not found');

    const ivArray = new Uint8Array(iv);

    const plaintext = await subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: ivArray,
      },
      sharedKey,
      ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(plaintext);
  } catch (error) {
    throw new Error(`Decryption failed for ${userId} <- ${senderId}: ${error.message}`);
  }
}

export { initializeKeys, getKeys, initiateX3DH, encryptMessage, decryptMessage };