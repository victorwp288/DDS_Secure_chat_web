import { supabaseAdmin } from "../_supabase.js";
import { cors } from "../../lib/cors.js";

export default cors(async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }

  const { userId, deviceId } = req.body;

  if (!userId || !deviceId) {
    return res.status(400).json({
      error: "Missing userId or deviceId",
    });
  }

  try {
    console.log(
      `[Verify API] Checking if device ${deviceId} exists for user ${userId}...`
    );

    const { data: device, error: deviceError } = await supabaseAdmin
      .from("devices")
      .select("device_id")
      .eq("device_id", deviceId)
      .eq("user_id", userId)
      .maybeSingle();

    if (deviceError) {
      console.error(
        `[Verify API] Error checking device: ${deviceError.message}`
      );
      throw deviceError;
    }

    const exists = !!device;
    console.log(
      `[Verify API] Device ${deviceId} for user ${userId} exists: ${exists}`
    );

    return res.status(200).json({ exists });
  } catch (err) {
    console.error("[Verify API] Handler error:", err);
    return res.status(500).json({
      error: err.message || "Internal Server Error",
    });
  }
});
