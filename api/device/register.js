// api/device/register.js
import { Buffer } from "buffer";
import { supabaseAdmin } from "../_supabase.js";
import { corsHandler } from "../../lib/cors.js";

// --- NEW Robust publicKey extraction function (and helper) --- START ---
function bytesObjectToB64(obj) {
  // Object.values gives us an array of the numeric byte values
  return Buffer.from(Object.values(obj)).toString("base64");
}

function extractPublicKeyB64(k) {
  // 1 – already a base-64 string
  if (typeof k.publicKey === "string") return k.publicKey;

  // 2 – Uint8Array / ArrayBuffer
  if (k.publicKey instanceof Uint8Array) {
    return Buffer.from(k.publicKey).toString("base64");
  }
  if (k.publicKey instanceof ArrayBuffer) {
    // Ensure ArrayBuffer is correctly handled, often needs a Uint8Array view
    return Buffer.from(new Uint8Array(k.publicKey)).toString("base64");
  }

  // 3 – 'publicKey' is that index→value object
  if (
    k.publicKey &&
    typeof k.publicKey === "object" &&
    !(k.publicKey instanceof Uint8Array) &&
    !(k.publicKey instanceof ArrayBuffer)
  ) {
    // Added checks to ensure it's a plain object, not already a typed array
    return bytesObjectToB64(k.publicKey);
  }

  // 4 – KeyHelper.generatePreKey style (keyPair.pubKey)
  if (k.keyPair?.pubKey) {
    const pk = k.keyPair.pubKey;
    if (pk instanceof Uint8Array) return Buffer.from(pk).toString("base64");
    if (pk instanceof ArrayBuffer)
      return Buffer.from(new Uint8Array(pk)).toString("base64");
    // Check if pk is an object of byte indices before calling bytesObjectToB64
    if (
      typeof pk === "object" &&
      !(pk instanceof Uint8Array) &&
      !(pk instanceof ArrayBuffer)
    ) {
      return bytesObjectToB64(pk);
    }
  }

  // still couldn't recognise
  console.warn(
    "[extractPublicKeyB64] Could not recognize publicKey format for key:",
    k
  );
  return undefined;
}
// --- NEW Robust publicKey extraction function (and helper) --- END ---

export default async function handler(req, res) {
  // Handle CORS
  const corsHandled = corsHandler(req, res);
  if (corsHandled) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }

  // Optional: Log the first preKey as it arrives, before normalization
  // if (Array.isArray(preKeys) && preKeys.length) {
  //   console.log(
  //     "🔍 first preKey that reached server:",
  //     JSON.stringify(preKeys[0], null, 2)
  //   );
  // }

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

  // --- Input Validation --- START ---
  // MODIFIED: Robust normalization and filtering for preKeys
  const normalisedPreKeys = (Array.isArray(preKeys) ? preKeys : [])
    .map((k, idx) => ({
      // id: k.id ?? k.keyId,                // accept either name (OLD)
      // publicKey: extractPublicKeyB64(k),  // may be undefined if not parseable (OLD)
      id: k.id ?? k.keyId ?? k.preKeyId ?? idx, // accept preKeyId or fall back to index
      // Try specific field first, then extractor
      publicKey:
        (typeof k.preKeyPublicKey === "string"
          ? k.preKeyPublicKey
          : undefined) || extractPublicKeyB64(k),
    }))
    // drop any that we still couldn't parse or have invalid id
    .filter((k) => typeof k.id === "number" && k.publicKey);

  if (
    !userId ||
    !registrationId ||
    !identityKey ||
    !signedPreKeyId ||
    !signedPreKeyPublicKey ||
    !signedPreKeySignature ||
    normalisedPreKeys.length === 0 // Check if any usable preKeys are left after normalization
  ) {
    console.error(
      "Missing or invalid fields in registration request (after robust normalization):",
      {
        body: req.body, // Log original body for context
        parsedPreKeysCount: normalisedPreKeys.length,
        // Log how many keys were in the original array for comparison if needed:
        originalPreKeysCount: Array.isArray(preKeys) ? preKeys.length : 0,
      }
    );
    return res.status(400).json({
      error: "Bad registration payload or no valid pre-keys provided.",
    });
  }
  // --- Input Validation --- END ---

  try {
    // --- Determine deviceId (Reuse or Create) --- START ---
    let theDeviceId = clientProvidedDeviceId
      ? Number(clientProvidedDeviceId)
      : null;
    let isNewDevice = false; // Track if we created a new device

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
        `[Register API] No valid deviceId to reuse. Creating new device for user ${userId}...`
      );

      // Instead of deleting all old devices, just create a new one
      // This prevents breaking existing sessions in group chats
      // Old devices will naturally become inactive over time

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
      isNewDevice = true; // Mark that we created a new device
      console.log(
        `[Register API] New device inserted. Using deviceId: ${theDeviceId}`
      );
    }
    // --- Determine deviceId (Reuse or Create) --- END ---

    // --- Upsert Bundle (WITH Selected PreKey) --- START ---
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

    // Select the first preKey from the batch to include in the main bundle
    const selectedPreKey = normalisedPreKeys[0];

    // Sanity check log as requested
    console.log("[Register API] first pre-key normalised:", selectedPreKey);

    const bundleToUpsert = {
      device_id: theDeviceId,
      registration_id: registrationId,
      identity_key_b64: identityKey,
      signed_pre_key_id: signedPreKeyId,
      signed_pre_key_public_b64: signedPreKeyPublicKey,
      signed_pre_key_sig_b64: signedPreKeySignature,
      pre_key_id: selectedPreKey.id, // Added from selected one-time pre-key
      pre_key_public_b64: selectedPreKey.publicKey, // Added from selected one-time pre-key
    };

    console.log(
      `[Register API] Upserting complete bundle for deviceId: ${theDeviceId}`,
      // Avoid logging sensitive key material directly in production if bundleToUpsert contains it
      // For debugging, you might log Object.keys(bundleToUpsert) or a sanitized version
      {
        device_id: bundleToUpsert.device_id,
        registration_id: bundleToUpsert.registration_id,
        pre_key_id: bundleToUpsert.pre_key_id,
      }
    );

    const { error: upsertError } = await supabaseAdmin.from("bundles").upsert(
      bundleToUpsert,
      { onConflict: "device_id" } // Upsert based on device_id
    );

    if (upsertError) {
      console.error(
        `[Register API] Error upserting complete bundle for deviceId ${theDeviceId}:`,
        upsertError
      );
      throw new Error(`Complete bundle upsert failed: ${upsertError.message}`);
    }
    console.log(
      `[Register API] Complete bundle upsert successful for deviceId: ${theDeviceId}`
    );
    // --- Upsert Bundle (WITH Selected PreKey) --- END ---

    // --- Notify other participants about device change --- START ---
    // Only notify when a completely new device is created (not when reusing existing device)
    if (isNewDevice) {
      try {
        console.log(
          `[Register API] Notifying participants about new device ${theDeviceId} for user ${userId}...`
        );

        const { notifyParticipantsOfDeviceChange } = await import(
          "./notify-participants.js"
        );
        const notifyResult = await notifyParticipantsOfDeviceChange(
          userId,
          theDeviceId
        );

        console.log(
          `[Register API] Device change notification sent: ${notifyResult.notificationsSent} notifications`
        );
      } catch (notifyError) {
        console.warn(
          `[Register API] Error sending device change notification: ${notifyError.message}`
        );
        // Don't fail the registration if notification fails
      }
    } else {
      console.log(
        `[Register API] Reusing existing device ${theDeviceId}, no notification needed`
      );
    }
    // --- Notify other participants about device change --- END ---

    // Return the deviceId that was used/created
    return res.status(200).json({ deviceId: theDeviceId });
  } catch (err) {
    console.error("[Register API] Handler error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Internal Server Error" });
  }
}
