// api/signal/bundles/[userId].js
import { supabaseAdmin } from "../../_supabase.js";
import { cors } from "../../../lib/cors.js";

// --- Helper function to get and delete one pre-key --- START ---
// Attempts to atomically retrieve and delete one pre-key for a device.
// Returns the key data { preKeyId, preKeyPublicKey } or null if none available/error.
async function getAndDeleteOnePreKey(deviceId) {
  try {
    // 1. Find one available pre-key for the device
    // Adjust column names if they differ in your 'prekey_bundles' table
    const { data: foundKey, error: findError } = await supabaseAdmin
      .from("prekey_bundles") // CORRECTED TABLE NAME
      .select("key_id, public_key_b64") // ASSUMING COLUMNS: key_id, public_key_b64
      .eq("device_id", deviceId) // ASSUMING FK is device_id
      .limit(1)
      .maybeSingle();

    if (findError) {
      console.error(
        `[GetPreKey] Error finding pre-key for device ${deviceId}:`,
        findError
      );
      return null; // Don't throw, just return null if finding fails
    }

    if (!foundKey) {
      // console.log(`[GetPreKey] No pre-keys available for device ${deviceId}.`);
      return null; // No keys left for this device
    }

    // 2. Attempt to delete the specific key we found
    const { count: deleteCount, error: deleteError } = await supabaseAdmin
      .from("prekey_bundles") // CORRECTED TABLE NAME
      .delete()
      .eq("device_id", deviceId) // ADDED: Filter by device_id
      .eq("key_id", foundKey.key_id) // Filter by the specific key_id
      .limit(1); // ADDED: Limit to 1 (safety, though PK should ensure it)

    if (deleteError) {
      // Log unexpected DB errors during delete
      console.error(
        `[GetPreKey] Error deleting pre-key ${foundKey.key_id} for device ${deviceId}:`,
        deleteError
      );
      return null; // Failed to secure the key
    }

    // --- ADDED: Check if delete succeeded (handles race condition) --- START ---
    if (deleteCount !== 1) {
      // This means the key was likely deleted by another request between our SELECT and DELETE.
      console.warn(
        `[GetPreKey] Failed to delete pre-key ${foundKey.key_id} for device ${deviceId} (deleteCount: ${deleteCount}, expected 1 - likely race condition or key already gone).`
      );
      return null; // Treat as key not available
    }
    // --- ADDED: Check if delete succeeded (handles race condition) --- END ---

    // console.log(`[GetPreKey] Successfully retrieved and deleted pre-key ${foundKey.key_id} for device ${deviceId}.`);
    // Return the key data needed for the bundle
    return {
      preKeyId: foundKey.key_id,
      preKeyPublicKey: foundKey.public_key_b64,
    };
  } catch (e) {
    // Catch any unexpected errors during the process
    console.error(
      `[GetPreKey] Unexpected error getting/deleting key for device ${deviceId}:`,
      e
    );
    return null;
  }
}
// --- Helper function to get and delete one pre-key --- END ---

export default cors(async function handler(req, res) {
  const { userId } = req.query;

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end();
  }

  try {
    // fetch devices
    const { data: devices, error: devErr } = await supabaseAdmin
      .from("devices")
      .select("device_id")
      .eq("user_id", userId);

    if (devErr) throw devErr;

    const deviceIds = devices.map((d) => d.device_id);
    if (deviceIds.length === 0) {
      return res.status(200).json([]); // No devices, return empty array
    }

    // fetch bundles (without pre-key info)
    const { data: bundlesData, error: bundleErr } = await supabaseAdmin
      .from("bundles")
      .select(
        `
        device_id,
        registration_id,
        identity_key_b64,
        signed_pre_key_id,
        signed_pre_key_public_b64,
        signed_pre_key_sig_b64
      `
      ) // Removed pre_key fields
      .in("device_id", deviceIds);

    if (bundleErr) throw bundleErr;

    // Use a map for easier lookup
    const bundlesMap = new Map(bundlesData.map((b) => [b.device_id, b]));

    // --- Process each device to add ONE pre-key if available --- START ---
    const responsePromises = deviceIds.map(async (deviceId) => {
      const baseBundle = bundlesMap.get(deviceId);
      if (!baseBundle) {
        console.warn(
          `[Bundles API] No bundle found for device ${deviceId} (belonging to user ${userId}) although device exists. Skipping.`
        );
        return null; // Skip if bundle somehow missing for existing device
      }

      // Attempt to get ONE pre-key for this device
      const preKey = await getAndDeleteOnePreKey(deviceId);

      // Shape the final bundle object
      const finalBundle = {
        deviceId: baseBundle.device_id,
        registrationId: baseBundle.registration_id,
        identityKey: baseBundle.identity_key_b64,
        signedPreKeyId: baseBundle.signed_pre_key_id,
        signedPreKeyPublicKey: baseBundle.signed_pre_key_public_b64,
        signedPreKeySignature: baseBundle.signed_pre_key_sig_b64,
      };

      // Add the preKey only if one was successfully retrieved and deleted
      if (preKey) {
        finalBundle.preKeyId = preKey.preKeyId;
        finalBundle.preKeyPublicKey = preKey.preKeyPublicKey;
      }

      return finalBundle;
    });

    const response = (await Promise.all(responsePromises)).filter(
      (b) => b !== null
    ); // Filter out any nulls from skipped devices
    // --- Process each device to add ONE pre-key if available --- END ---

    return res.status(200).json(response);
  } catch (err) {
    console.error("[Bundles API] Handler error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Internal Server Error" });
  }
});
