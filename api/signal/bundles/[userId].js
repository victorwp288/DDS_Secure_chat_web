// api/signal/bundles/[userId].js
import { supabaseAdmin } from "../../_supabase.js";
import { corsHandler } from "../../../lib/cors.js";

// --- Helper function to get pre-key from bundles table --- START ---
// Gets the pre-key from the bundles table for a device.
// Returns the key data { preKeyId, preKeyPublicKey } or null if none available.
async function getPreKeyFromBundle(deviceId) {
  try {
    const { data: bundle, error: findError } = await supabaseAdmin
      .from("bundles")
      .select("pre_key_id, pre_key_public_b64")
      .eq("device_id", deviceId)
      .maybeSingle();

    if (findError) {
      console.error(
        `[GetPreKey] Error finding bundle for device ${deviceId}:`,
        findError
      );
      return null;
    }

    if (!bundle || !bundle.pre_key_id || !bundle.pre_key_public_b64) {
      // console.log(`[GetPreKey] No pre-key available for device ${deviceId}.`);
      return null;
    }

    return {
      preKeyId: bundle.pre_key_id,
      preKeyPublicKey: bundle.pre_key_public_b64,
    };
  } catch (e) {
    console.error(
      `[GetPreKey] Unexpected error getting pre-key for device ${deviceId}:`,
      e
    );
    return null;
  }
}
// --- Helper function to get pre-key from bundles table --- END ---

export default async function handler(req, res) {
  // Handle CORS
  const corsHandled = corsHandler(req, res);
  if (corsHandled) return;

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

    // fetch bundles (including pre-key info)
    const { data: bundlesData, error: bundleErr } = await supabaseAdmin
      .from("bundles")
      .select(
        `
        device_id,
        registration_id,
        identity_key_b64,
        signed_pre_key_id,
        signed_pre_key_public_b64,
        signed_pre_key_sig_b64,
        pre_key_id,
        pre_key_public_b64
      `
      )
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

      // Attempt to get pre-key for this device from bundles table
      const preKey = await getPreKeyFromBundle(deviceId);

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
}
