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

  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({
      error: "Missing userId",
    });
  }

  try {
    console.log(
      `[Cleanup API] Force cleaning up ALL devices for user ${userId}...`
    );

    // Get all devices for this user
    const { data: devices, error: devicesError } = await supabaseAdmin
      .from("devices")
      .select("device_id")
      .eq("user_id", userId);

    if (devicesError) {
      console.error(
        `[Cleanup API] Error fetching devices: ${devicesError.message}`
      );
      throw devicesError;
    }

    if (!devices || devices.length === 0) {
      console.log(`[Cleanup API] No devices found for user ${userId}`);
      return res.status(200).json({
        message: "No devices to clean up",
        devicesRemoved: 0,
      });
    }

    const deviceIds = devices.map((d) => d.device_id);
    console.log(
      `[Cleanup API] Found ${
        deviceIds.length
      } devices to clean up: ${deviceIds.join(", ")}`
    );

    // STEP 1: Set device_id to NULL in messages to avoid foreign key constraint
    console.log(
      `[Cleanup API] Setting device_id to NULL in messages for devices: ${deviceIds.join(
        ", "
      )}`
    );
    const { error: messagesUpdateError } = await supabaseAdmin
      .from("messages")
      .update({ device_id: null })
      .in("device_id", deviceIds);

    if (messagesUpdateError) {
      console.warn(
        `[Cleanup API] Error updating messages device_id: ${messagesUpdateError.message}`
      );
    } else {
      console.log(
        `[Cleanup API] Successfully set device_id to NULL in messages for devices: ${deviceIds.join(
          ", "
        )}`
      );
    }

    // STEP 2: Delete bundles
    const { error: bundleDeleteError } = await supabaseAdmin
      .from("bundles")
      .delete()
      .in("device_id", deviceIds);

    if (bundleDeleteError) {
      console.warn(
        `[Cleanup API] Error deleting bundles: ${bundleDeleteError.message}`
      );
    } else {
      console.log(
        `[Cleanup API] Deleted bundles for devices: ${deviceIds.join(", ")}`
      );
    }

    // STEP 3: Delete prekey bundles
    const { error: prekeyDeleteError } = await supabaseAdmin
      .from("prekey_bundles")
      .delete()
      .in("device_id", deviceIds);

    if (prekeyDeleteError) {
      console.warn(
        `[Cleanup API] Error deleting prekey bundles: ${prekeyDeleteError.message}`
      );
    } else {
      console.log(
        `[Cleanup API] Deleted prekey bundles for devices: ${deviceIds.join(
          ", "
        )}`
      );
    }

    // STEP 4: Delete devices
    const { error: deviceDeleteError } = await supabaseAdmin
      .from("devices")
      .delete()
      .eq("user_id", userId);

    if (deviceDeleteError) {
      console.error(
        `[Cleanup API] Error deleting devices: ${deviceDeleteError.message}`
      );
      throw deviceDeleteError;
    }

    console.log(
      `[Cleanup API] Successfully cleaned up ${deviceIds.length} devices for user ${userId}`
    );

    return res.status(200).json({
      message: "Cleanup successful",
      devicesRemoved: deviceIds.length,
      deviceIds: deviceIds,
    });
  } catch (err) {
    console.error("[Cleanup API] Handler error:", err);
    console.error("[Cleanup API] Error stack:", err.stack);

    // Provide more specific error information
    let errorMessage = err.message || "Internal Server Error";
    if (err.code) {
      errorMessage += ` (Code: ${err.code})`;
    }

    return res.status(500).json({
      error: errorMessage,
      details: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
}
