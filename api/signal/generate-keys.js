import * as Signal from "@signalapp/libsignal-client";

// TODO: Import Supabase client or DB interaction functions

// Helper to serialize ArrayBuffers to Base64 for JSON transport
function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({ message: "Method Not Allowed" });
  }

  console.log("API: generate-keys invoked");

  try {
    // 1. Identity Key Pair
    const identityKeyPair = await Signal.IdentityKeyPair.generate();
    // Get the private key instance from the key pair
    const identityPrivKey = identityKeyPair.getPrivateKey();
    console.log("Generated identity key pair instance");

    // 2. Registration ID
    const registrationId = Math.floor(Math.random() * 16380) + 1; // Still manual
    console.log(`Generated registration ID: ${registrationId}`);

    // 3. PreKeys (Generate a batch, e.g., 100)
    const preKeys = [];
    const preKeyRecords = []; // For potential storage
    const startPreKeyId = 1; // Or fetch highest known ID + 1 from DB
    for (let i = 0; i < 100; i++) {
      const preKeyId = startPreKeyId + i;
      // Assuming PreKeyRecord needs ID and generated key pair
      // Key pair generation might use PrivateKey.generate
      const prePrivKey = Signal.PrivateKey.generate(); // Generate private key
      const prePubKey = prePrivKey.getPublicKey(); // Get corresponding public key
      const record = new Signal.PreKeyRecord(preKeyId, prePubKey, prePrivKey);

      preKeys.push({
        keyId: preKeyId,
        keyPair: {
          // Serialize for the response
          publicKey: arrayBufferToBase64(prePubKey.serialize()),
          privateKey: arrayBufferToBase64(prePrivKey.serialize()),
        },
      });
      preKeyRecords.push(record); // Keep the record object if needed for DB storage
    }
    console.log(`Generated ${preKeys.length} pre-keys.`);

    // 4. Signed PreKey
    const signedPreKeyId = 1; // Or fetch highest known ID + 1
    const signedPrivKey = Signal.PrivateKey.generate();
    const signedPubKey = signedPrivKey.getPublicKey();
    const timestamp = Date.now();
    // Sign the public signed prekey using the extracted identity private key
    const signature = identityPrivKey.sign(signedPubKey.serialize());
    const signedPreKeyRecord = new Signal.SignedPreKeyRecord(
      signedPreKeyId,
      timestamp,
      signedPubKey,
      signedPrivKey,
      signature
    );
    console.log(`Generated signed pre-key ID ${signedPreKeyId}.`);

    const signedPreKeyResponse = {
      keyId: signedPreKeyId,
      keyPair: {
        publicKey: arrayBufferToBase64(signedPubKey.serialize()),
        privateKey: arrayBufferToBase64(signedPrivKey.serialize()), // Send private part back for local storage
      },
      signature: arrayBufferToBase64(signature),
      timestamp: timestamp,
    };

    // 5. TODO: Securely store private keys (identity privKey, preKey privKeys, signed privKey)
    //    and registrationId associated with the user. Only the client should hold these.
    //    Maybe return them in the response for the client to store locally?
    console.log("TODO: Implement secure storage for generated private keys.");

    // 6. TODO: Store public parts (preKey public keys, signedPreKey public + sig, identity public)
    //    in a way accessible to others (e.g., Supabase table 'prekey_bundles')
    console.log("TODO: Implement storage for public bundle components.");

    // 7. Return all generated material (serialized) for the client
    //    The client will need to store the private parts locally and securely.
    //    The public parts might be published later.
    response.status(200).json({
      identityKeyPair: {
        publicKey: arrayBufferToBase64(
          identityKeyPair.getPublicKey().serialize()
        ),
        privateKey: arrayBufferToBase64(identityPrivKey.serialize()), // Serialize the extracted private key
      },
      registrationId: registrationId,
      preKeys: preKeys, // Already serialized within loop
      signedPreKey: signedPreKeyResponse, // Already serialized
    });
  } catch (error) {
    console.error("Error generating Signal keys in API:", error);
    response.status(500).json({
      message: "Failed to generate Signal keys.",
      error: error.message,
      stack: error.stack,
    });
  }
}
