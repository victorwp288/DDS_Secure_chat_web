import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client with Service Role Key for backend operations
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error(
    "Supabase URL or Service Role Key is missing in environment variables."
  );
  // We cannot proceed without Supabase config, but throwing here might crash the serverless function container.
  // Let's allow the handler to return a 500 error instead.
}

let supabase;
try {
  supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      // Required for service role key usage, prevents auto-refreshing tokens
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  console.log("Supabase client initialized for get-bundle.");
} catch (error) {
  console.error("Error initializing Supabase client:", error);
  supabase = null; // Ensure supabase is null if initialization fails
}

export default async function handler(req, res) {
  if (!supabase) {
    return res
      .status(500)
      .json({
        message: "Server configuration error: Supabase client not initialized.",
      });
  }

  if (req.method !== "GET") {
    console.log(`Method ${req.method} not allowed for get-bundle.`);
    res.setHeader("Allow", ["GET"]);
    return res
      .status(405)
      .json({ message: `Method ${req.method} Not Allowed` });
  }

  // --- Optional Authentication (Good Practice) ---
  // const authHeader = req.headers.authorization;
  // if (!authHeader || !authHeader.startsWith('Bearer ')) {
  //     console.log("Missing or invalid Authorization header.");
  //     return res.status(401).json({ message: 'Unauthorized: Missing or invalid token.' });
  // }
  // const token = authHeader.split(' ')[1];
  // try {
  //     const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  //     if (userError || !user) {
  //         console.error("Auth error verifying sender:", userError);
  //         return res.status(401).json({ message: `Unauthorized: ${userError?.message || 'Invalid token'}` });
  //     }
  //     console.log(`Authenticated request from user: ${user.id}`);
  // } catch (error) {
  //     console.error("Unexpected error during authentication:", error);
  //     return res.status(500).json({ message: 'Internal server error during authentication.' });
  // }
  // --- End Optional Authentication ---

  const { userId } = req.query; // Get recipient userId from query: /api/signal/get-bundle?userId=...

  if (!userId) {
    console.log("Missing userId query parameter.");
    return res
      .status(400)
      .json({ message: "Bad Request: userId query parameter is required." });
  }

  console.log(`Fetching pre-key bundle for recipient userId: ${userId}`);

  try {
    const { data, error, status } = await supabase
      .from("encryption_keys")
      .select("prekey_bundle") // Select only the bundle column
      .eq("profile_id", userId)
      .maybeSingle(); // Expect at most one row

    if (error) {
      console.error(
        `Supabase error fetching bundle for ${userId}:`,
        status,
        error
      );
      return res
        .status(status || 500)
        .json({ message: `Database error: ${error.message}` });
    }

    if (!data || !data.prekey_bundle) {
      console.log(`No pre-key bundle found for userId: ${userId}`);
      return res
        .status(404)
        .json({ message: "Recipient key bundle not found." });
    }

    console.log(`Successfully fetched pre-key bundle for userId: ${userId}`);
    // The bundle is already stored as JSON, return it directly.
    // Ensure the content type is set correctly.
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json(data.prekey_bundle);
  } catch (error) {
    console.error(`Unexpected error fetching bundle for ${userId}:`, error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}
