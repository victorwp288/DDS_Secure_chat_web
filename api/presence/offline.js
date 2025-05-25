import { createClient } from "@supabase/supabase-js";
import { corsHandler } from "../../lib/cors.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // Handle CORS
  const corsHandled = corsHandler(req, res);
  if (corsHandled) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { user_id, status, updated_at } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // Update user status to offline
    const { error } = await supabase
      .from("profiles")
      .update({
        status: status || "offline",
        updated_at: updated_at || new Date().toISOString(),
      })
      .eq("id", user_id);

    if (error) {
      console.error("[Presence API] Error updating user status:", error);
      return res.status(500).json({ error: "Failed to update status" });
    }

    console.log(`[Presence API] Updated user ${user_id} status to offline`);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("[Presence API] Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
