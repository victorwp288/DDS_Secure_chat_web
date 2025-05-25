// api/device/[deviceId].js
import { supabaseAdmin } from "../_supabase.js";
import { corsHandler } from "../../lib/cors.js";

export default async function handler(req, res) {
  // Handle CORS
  const corsHandled = corsHandler(req, res);
  if (corsHandled) return;
  const { deviceId } = req.query;

  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).end();
  }

  try {
    // delete bundle first
    let { error: bundleErr } = await supabaseAdmin
      .from("bundles")
      .delete()
      .eq("device_id", deviceId);

    if (bundleErr) throw bundleErr;

    // delete device
    const { error: devErr } = await supabaseAdmin
      .from("devices")
      .delete()
      .eq("device_id", deviceId);

    if (devErr) throw devErr;

    return res.status(204).end();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
