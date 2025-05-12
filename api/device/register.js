// api/device/register.js
import { supabaseAdmin } from "../_supabase.js";
import { cors } from "../../lib/cors.js";

// --- Helper to validate preKey shape ---
function isValidPreKey(key) {
  return (
    key &&
    typeof key.preKeyPublicKey === "string" &&
    key.preKeyPublicKey.length > 0 // Basic non-empty check
  );
}

export default cors(async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }

  // --- Accept preKeys array --- START ---
  const {
    userId,
    deviceId: clientProvidedDeviceId,
    registrationId,
    identityKey,
    signedPreKeyId,
    signedPreKeyPublicKey,
    signedPreKeySignature,
    preKeys,
  } = req.body;
  // --- Accept preKeys array --- END ---

  // --- Input Validation --- START ---
  if (
    !userId ||
    !registrationId ||
    !identityKey ||
    !signedPreKeyId ||
    !signedPreKeyPublicKey ||
    !signedPreKeySignature ||
    !Array.isArray(preKeys) ||
    preKeys.length === 0 ||
    !preKeys.every(isValidPreKey)
  ) {
    console.error("Missing or invalid fields in registration request:", {
      body: req.body,
      preKeysValid: Array.isArray(preKeys) && preKeys.every(isValidPreKey),
    });
    return res
      .status(400)
      .json({ error: "Missing or invalid fields for registration." });
  }
  // --- Input Validation --- END ---

  try {
    // --- Determine deviceId (Reuse or Create) --- START ---
    let theDeviceId = clientProvidedDeviceId
      ? Number(clientProvidedDeviceId)
      : null;
    console.log(
      `[Register API] Received clientProvidedDeviceId: ${clientProvidedDeviceId}, Parsed as: ${theDeviceId}`
    );

    if (theDeviceId) {
      console.log(
        `[Register API] Validating ownership of deviceId ${theDeviceId} for user ${userId}...`
      );
      const { data: existingDevice, error: ownerCheckError } =
        await supabaseAdmin
          .from("devices")
          .select("device_id")
          .eq("device_id", theDeviceId)
          .eq("user_id", userId)
          .maybeSingle();

      if (ownerCheckError) {
        console.error(
          `[Register API] Error checking ownership for device ${theDeviceId}:`,
          ownerCheckError
        );
        throw new Error(
          `Error checking device ownership: ${ownerCheckError.message}`
        );
      }

      if (!existingDevice) {
        console.warn(
          `[Register API] Client sent deviceId ${theDeviceId}, but it doesn't exist or doesn't belong to user ${userId}. Ignoring it.`
        );
        theDeviceId = null;
      } else {
        console.log(
          `[Register API] Ownership confirmed for deviceId ${theDeviceId}. Reusing.`
        );
      }
    }

    if (!theDeviceId) {
      console.log(
        `[Register API] No valid deviceId to reuse. Inserting new device row for user ${userId}...`
      );
      const { data, error: insertError } = await supabaseAdmin
        .from("devices")
        .insert({ user_id: userId })
        .select("device_id")
        .single();

      if (insertError || !data) {
        console.error(
          `[Register API] Device insert failed for user ${userId}:`,
          insertError
        );
        throw insertError || new Error("Device insert failed");
      }
      theDeviceId = data.device_id;
      console.log(
        `[Register API] New device inserted. Using deviceId: ${theDeviceId}`
      );
    }
    // --- Determine deviceId (Reuse or Create) --- END ---

    // --- Upsert Bundle (Without PreKey) --- START ---
    if (
      typeof theDeviceId !== "number" ||
      isNaN(theDeviceId) ||
      theDeviceId <= 0
    ) {
      console.error(
        `[Register API] Invalid final theDeviceId: ${theDeviceId}. Aborting bundle upsert.`
      );
      throw new Error(`Invalid final theDeviceId: ${theDeviceId}`);
    }
    console.log(
      `[Register API] Upserting bundle (NO pre-key) for final theDeviceId: ${theDeviceId}`
    );

    const { error: upsertError } = await supabaseAdmin.from("bundles").upsert(
      {
        device_id: theDeviceId,
        registration_id: registrationId,
        identity_key_b64: identityKey,
        signed_pre_key_id: signedPreKeyId,
        signed_pre_key_public_b64: signedPreKeyPublicKey,
        signed_pre_key_sig_b64: signedPreKeySignature,
      },
      { onConflict: "device_id" }
    );

    if (upsertError) {
      console.error(
        `[Register API] Error upserting bundle for deviceId ${theDeviceId}:`,
        upsertError
      );
      throw new Error(`Bundle upsert failed: ${upsertError.message}`);
    }
    console.log(
      `[Register API] Bundle upsert successful for deviceId: ${theDeviceId}`
    );
    // --- Upsert Bundle (Without PreKey) --- END ---

    // --- Store PreKey Batch --- START ---
    const preKeysToInsert = preKeys.map((key) => ({
      device_id: theDeviceId,
      user_id: userId,
	  registration_id: registrationId,
      public_key_b64: key.preKeyPublicKey,
    }));

    console.log(
      `[Register API] Inserting ${preKeysToInsert.length} pre-keys into 'prekey_bundles' for deviceId ${theDeviceId}...`
    );

    const { error: preKeyInsertError } = await supabaseAdmin
      .from("prekey_bundles")
      .insert(preKeysToInsert);

    if (preKeyInsertError) {
      console.error(
        `[Register API] Error inserting pre-keys for deviceId ${theDeviceId}:`,
        preKeyInsertError
      );
      throw new Error(`Pre-key insertion failed: ${preKeyInsertError.message}`);
    }
    console.log(
      `[Register API] Pre-keys insertion successful for deviceId: ${theDeviceId}`
    );
    // --- Store PreKey Batch --- END ---

    // Return the deviceId that was used/created
    return res.status(200).json({ deviceId: theDeviceId });
  } catch (err) {
    console.error("[Register API] Handler error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Internal Server Error" });
  }
});
