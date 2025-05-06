"use client"; // Required for client-side hooks like useEffect

import { useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { hexToUint8Array, buf2hex } from "../lib/signalUtils"; // Assuming buf2hex might be needed for hashing later

// --- Supabase Client Setup ---
// Assuming Vite environment - use import.meta.env and VITE_ prefix
// Ensure these are set in your .env file (e.g., .env.local)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabase;
if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "Supabase URL or Anon Key is missing. Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your .env file and the dev server was restarted."
  );
  // Handle the error appropriately - maybe return a message or disable functionality
} else {
  // Only create client if keys are present
  supabase = createClient(supabaseUrl, supabaseAnonKey);
}
// -----------------------------

// REMOVED: Prop definition no longer needed
// interface FetchDebugRowProps {
//   messageId: string;
// }

export default function FetchDebugRow(/* REMOVED: No props needed */) {
  // Hardcode the specific UUID for this test component
  const debugUuid = "123e4567-e89b-12d3-a456-426614174000";

  useEffect(() => {
    // Check if Supabase client was initialized successfully
    if (!supabase) {
      console.error(
        "FetchDebugRow: Supabase client not initialized due to missing config."
      );
      return;
    }

    console.log(
      `FetchDebugRow: useEffect triggered for hardcoded ID: ${debugUuid}`
    );

    // One-shot fetch using an immediately invoked async function
    (async () => {
      try {
        const { data, error } = await supabase
          .from("messages") // Target the 'messages' table
          .select("body") // Select the body column
          .eq("id", debugUuid) // Filter by the hardcoded UUID
          .single(); // Expect only one row

        if (error) {
          if (error.code === "PGRST116") {
            console.error(
              `FetchDebugRow Error: No message found with ID ${debugUuid}`
            );
          } else {
            console.error(
              `FetchDebugRow Error fetching row (ID: ${debugUuid}):`,
              error
            );
          }
          return; // Stop processing on error
        }

        if (data && data.body) {
          const dbHexString = data.body;
          console.log(
            `FetchDebugRow Supabase says body for ${debugUuid} is:`,
            dbHexString
          );
          console.log("FetchDebugRow Type of body:", typeof dbHexString); // Should be string

          // Test hex decoding
          try {
            const bodyBytes = hexToUint8Array(dbHexString);
            console.log("FetchDebugRow Decoded Uint8Array:", bodyBytes);

            // Optional: Calculate and log SHA256 hash for comparison
            await crypto.subtle
              .digest("SHA-256", bodyBytes)
              .then((h) =>
                console.log(
                  "[RX-decode (Test Component) SHA256]:",
                  buf2hex(h),
                  `(for msg ${debugUuid})`
                )
              )
              .catch((hashError) =>
                console.error(
                  `FetchDebugRow Failed to calculate hash for msg ${debugUuid}:`,
                  hashError
                )
              );
          } catch (decodeError) {
            console.error(
              `FetchDebugRow Failed to decode hex string for msg ${debugUuid}:`,
              decodeError
            );
          }
        } else {
          console.log(
            `FetchDebugRow: No data or body returned for ID ${debugUuid}, even without an error.`
          );
        }
      } catch (err) {
        console.error(
          `FetchDebugRow: Unexpected error during fetch (ID: ${debugUuid}):`,
          err
        );
      }
    })();
  }, []); // <- Empty dependency array, effect runs once on mount

  // This component doesn't render anything itself, it's just for the side effect
  return null;
}

// How to use this component (Example):
// import FetchDebugRow from './pages/Test'; // Adjust path
//
// function MyPage() {
//   return (
//     <div>
//       <h1>My Page</h1>
//       <p>Check the console for the debug fetch results for the hardcoded UUID.</p>
//       <FetchDebugRow /> {/* No props needed */}
//     </div>
//   );
// }
