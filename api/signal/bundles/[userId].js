// api/signal/bundles/[userId].js
import { supabaseAdmin } from "../../_supabase.js";
import { cors } from "../../../lib/cors.js";

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
      return res.status(200).json([]);
    }

    // fetch bundles
    const { data: bundles, error: bundleErr } = await supabaseAdmin
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

    // shape response
    const response = bundles.map((b) => ({
      deviceId: b.device_id,
      registrationId: b.registration_id,
      identityKey: b.identity_key_b64,
      signedPreKeyId: b.signed_pre_key_id,
      signedPreKeyPublicKey: b.signed_pre_key_public_b64,
      signedPreKeySignature: b.signed_pre_key_sig_b64,
      preKeyId: b.pre_key_id,
      preKeyPublicKey: b.pre_key_public_b64,
    }));

    return res.status(200).json(response);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});
