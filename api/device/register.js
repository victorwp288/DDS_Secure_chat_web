// api/device/register.js
import { supabaseAdmin } from "../_supabase.js";
import { cors } from "../../lib/cors.js";

export default cors(async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }

  const {
    userId,
    registrationId,
    identityKey,
    signedPreKeyId,
    signedPreKeyPublicKey,
    signedPreKeySignature,
    preKeyId,
    preKeyPublicKey,
  } = req.body;

  try {
    // 1️⃣ Create device row
    const { data: deviceData, error: deviceError } = await supabaseAdmin
      .from("devices")
      .insert({ user_id: userId })
      .select("device_id")
      .single();

    if (deviceError || !deviceData) {
      console.error("Error inserting device:", deviceError);
      throw new Error("Device registration failed");
    }
    const deviceId = deviceData.device_id;

    // 2️⃣ Upsert bundle
    const { error: upsertError } = await supabaseAdmin.from("bundles").upsert(
      {
        device_id: deviceId,
        registration_id: registrationId,
        identity_key_b64: identityKey,
        signed_pre_key_id: signedPreKeyId,
        signed_pre_key_public_b64: signedPreKeyPublicKey,
        signed_pre_key_sig_b64: signedPreKeySignature,
        pre_key_id: preKeyId,
        pre_key_public_b64: preKeyPublicKey,
      },
      { onConflict: "device_id" }
    );

    if (upsertError) {
      console.error("Error upserting bundle:", upsertError);
      throw new Error("Bundle upsert failed");
    }

    return res.status(200).json({ deviceId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});


