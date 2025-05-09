
// api/_supabase.js
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

// these **must** be set in your Vercel Environment Variables
const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
}

export const supabaseAdmin = createClient(URL, KEY);
