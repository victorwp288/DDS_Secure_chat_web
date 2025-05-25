import { supabaseAdmin } from "../_supabase.js";
import { corsHandler } from "../../lib/cors.js";

export default async function handler(req, res) {
  // Handle CORS
  const corsHandled = corsHandler(req, res);
  if (corsHandled) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }

  const { userId, deviceId } = req.body;

  if (!userId || !deviceId) {
    return res.status(400).json({
      error: "Missing required fields: userId, deviceId",
    });
  }

  try {
    console.log(
      `[Device Verify] Checking if device ${deviceId} exists for user ${userId}`
    );

    // Check if the device exists in the database
    const { data: device, error: deviceError } = await supabaseAdmin
      .from("devices")
      .select("device_id, user_id")
      .eq("user_id", userId)
      .eq("device_id", deviceId)
      .single();

    if (deviceError && deviceError.code !== "PGRST116") {
      // PGRST116 is "not found" error, which is expected if device doesn't exist
      console.error(`[Device Verify] Database error:`, deviceError);
      throw deviceError;
    }

    const exists = !!device;
    console.log(
      `[Device Verify] Device ${deviceId} for user ${userId} exists: ${exists}`
    );

    return res.status(200).json({
      exists,
      device: exists ? device : null,
    });
  } catch (error) {
    console.error("[Device Verify] Error:", error);
    return res.status(500).json({
      error: "Failed to verify device",
      details: error.message,
    });
  }
}
