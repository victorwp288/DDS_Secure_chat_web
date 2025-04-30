import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client with service role key for backend operations
// Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in Vercel environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase environment variables!");
  // In a real app, you might want to prevent the function from running fully
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    const {
      userId,
      registrationId,
      identityKey, // Base64 Public Identity Key
      signedPreKeyId,
      signedPreKeyPublicKey, // Base64 Public Signed PreKey
      signedPreKeySignature, // Base64 Signature
      preKeyId, // ID of one chosen PreKey
      preKeyPublicKey, // Base64 Public PreKey
    } = request.body;

    // Basic validation
    if (
      !userId ||
      registrationId == null ||
      !identityKey ||
      signedPreKeyId == null ||
      !signedPreKeyPublicKey ||
      !signedPreKeySignature ||
      preKeyId == null ||
      !preKeyPublicKey
    ) {
      console.error("Missing required fields in request body:", request.body);
      return response
        .status(400)
        .json({ message: "Missing required fields for pre-key bundle." });
    }

    console.log(`API: store-bundle invoked for user ${userId}`);

    // Structure the public bundle for storage in Supabase
    // Storing as a JSON object in the 'prekey_bundle' column
    const publicBundle = {
      registrationId: registrationId,
      identityKey: identityKey, // Already Base64
      signedPreKey: {
        keyId: signedPreKeyId,
        publicKey: signedPreKeyPublicKey, // Already Base64
        signature: signedPreKeySignature, // Already Base64
      },
      // Include only ONE preKey in the public bundle
      preKey: {
        keyId: preKeyId,
        publicKey: preKeyPublicKey, // Already Base64
      },
      // Add timestamp for potential debugging or cleanup?
      storedAt: new Date().toISOString(),
    };

    const serializedBundle = JSON.stringify(publicBundle);

    console.log(`Storing public bundle for user ${userId}...`);
    const { data, error } = await supabase
      .from("encryption_keys") // Ensure this table name matches your schema
      .upsert(
        { profile_id: userId, prekey_bundle: serializedBundle },
        { onConflict: "profile_id" } // Upsert based on the user ID
      )
      .select(); // Optionally select to confirm

    if (error) {
      console.error(`Error storing pre-key bundle for user ${userId}:`, error);
      throw error; // Let the catch block handle it
    }

    console.log(`Public bundle stored successfully for user ${userId}:`, data);
    response
      .status(200)
      .json({ message: "Public pre-key bundle stored successfully." });
  } catch (error) {
    console.error("Error in store-bundle API:", error);
    response.status(500).json({
      message: "Failed to store public pre-key bundle.",
      error: error.message,
    });
  }
}
