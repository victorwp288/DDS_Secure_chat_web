// SignalContext.jsx
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabaseClient"; // Adjusted path assuming supabaseClient is in src/lib
import { IndexedDBStore } from "./localDb"; // Adjusted path assuming localDb is in src/lib
import { post } from "./backend"; // Assuming backend.js is in the same dir
import { initializeSignalProtocol } from "./signalUtils"; // Assuming signalUtils.js is in the same dir

const SignalContext = createContext();

export function SignalProvider({ children }) {
  // ───────── State we expose ─────────
  const [signalStore, setSignalStore] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [initError, setInitError] = useState(null);

  // ───────── Who is logged-in right now? ─────────
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const newUserId = session?.user?.id ?? null;
        console.log(
          `[SignalContext Auth Listener] Auth state changed. New User ID: ${newUserId}`
        );
        setUserId(newUserId);
      }
    );
    // Run once on mount in case we already have a session
    supabase.auth.getSession().then(({ data: { session } }) => {
      const initialUserId = session?.user?.id ?? null;
      console.log(
        `[SignalContext Auth Listener] Initial session check. User ID: ${initialUserId}`
      );
      setUserId(initialUserId);
    });

    return () => {
      console.log("[SignalContext Auth Listener] Unsubscribing auth listener.");
      listener?.subscription?.unsubscribe();
    };
  }, []);

  // ───────── (re)create store whenever userId changes ─────────
  useEffect(() => {
    console.log(
      `[SignalContext Store Effect] Running effect for userId: ${userId}`
    );
    // 1. Signing-out path
    if (!userId) {
      console.log(
        "[SignalContext Store Effect] User logged out or no user. Tearing down store."
      );
      setSignalStore(null);
      setDeviceId(null);
      setIsReady(false);
      setInitError(null); // Clear errors on logout
      return;
    }

    // 2. Signing-in path
    let cancelled = false;
    setIsReady(false); // Set to not ready while initializing for this user
    setInitError(null); // Clear previous errors

    (async () => {
      try {
        console.log(
          `[SignalContext Store Effect] Initializing store and ensuring registration for user ${userId}...`
        );
        const store = new IndexedDBStore(userId);
        const localStorageKey = `${userId}_deviceId`;

        console.log(
          `[SignalContext Store Effect] Calling initializeSignalProtocol for ${userId}...`
        );
        const bundle = await initializeSignalProtocol(store, userId);

        let finalDeviceId;

        if (bundle) {
          // New keys were generated, so a new bundle exists.
          // We need to register this as a new device (or let the server assign a new ID).
          // We will NOT send an existingDeviceId from localStorage.
          console.log(
            `[SignalContext Store Effect] New bundle generated. Registering new device...`
          );
          const response = await post("/device/register", {
            // deviceId: null, // Explicitly null or omitted for server to generate/assign new
            ...bundle,
            userId: userId,
          });

          console.log(
            `[SignalContext Store Effect] Registration response for new bundle:`,
            response
          );

          if (response?.deviceId === undefined || response?.deviceId === null) {
            throw new Error(
              "Device registration failed: No deviceId in server response for new bundle."
            );
          }
          finalDeviceId = response.deviceId;
          localStorage.setItem(localStorageKey, String(finalDeviceId));
          console.log(
            `[SignalContext Store Effect] Saved new deviceId from server to localStorage: ${finalDeviceId}`
          );
        } else {
          // Keys already existed, bundle is null. Use existing deviceId.
          console.log(
            `[SignalContext Store Effect] Existing keys found. Using deviceId from localStorage.`
          );
          const existingDeviceIdFromStorage =
            localStorage.getItem(localStorageKey);
          if (!existingDeviceIdFromStorage) {
            // This is an inconsistent state: keys exist but no deviceId in localStorage.
            // This case should ideally not happen if deviceId is always saved when keys are first created.
            // For now, we'll throw an error, as proceeding could lead to more issues.
            // A more robust solution might involve trying to re-register or clear keys.
            console.error(
              "[SignalContext Store Effect] CRITICAL: Keys exist in DB, but no deviceId found in localStorage. Manual intervention might be needed."
            );
            throw new Error(
              "Inconsistent state: Signal keys found but no deviceId in localStorage."
            );
          }
          finalDeviceId = Number(existingDeviceIdFromStorage); // Ensure it's a number if store expects that
          console.log(
            `[SignalContext Store Effect] Using existing deviceId from localStorage: ${finalDeviceId}`
          );
          // No need to call /device/register as keys and deviceId are presumed to be consistent.
        }

        // ---------- 3️⃣ Expose state to the rest of the app ----------
        if (!cancelled) {
          console.log(
            `[SignalContext Store Effect] Initialization complete. Setting state.`
          );
          setSignalStore(store);
          setDeviceId(finalDeviceId); // Use the determined deviceId
          setIsReady(true);
          setInitError(null);
        }
      } catch (e) {
        if (!cancelled) {
          console.error(
            "[SignalProvider] Initialization/Registration failed:",
            e
          );
          setInitError(e.message ?? String(e));
          // Ensure state is reset on error
          setSignalStore(null);
          setDeviceId(null);
          setIsReady(false);
        }
      }
    })();

    return () => {
      console.log(`[SignalContext Store Effect] Cleanup for userId: ${userId}`);
      cancelled = true;
    };
  }, [userId]);

  return (
    <SignalContext.Provider
      value={{ signalStore, deviceId, isReady, initializationError: initError }}
    >
      {children}
    </SignalContext.Provider>
  );
}

export const useSignal = () => useContext(SignalContext);
