/* eslint-disable react-refresh/only-export-components */
// SignalContext.jsx
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabaseClient"; // Adjusted path assuming supabaseClient is in src/lib
import { IndexedDBStore } from "./localDb"; // Adjusted path assuming localDb is in src/lib
import { post } from "./backend"; // Assuming backend.js is in the same dir
import { initializeSignalProtocol } from "./signalUtils"; // Assuming signalUtils.js is in the same dir

const SignalContext = createContext();

export function SignalProvider({ children }) {
  const [signalStore, setSignalStore] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [initError, setInitError] = useState(null);

  const [userId, setUserId] = useState(null);

  useEffect(() => {
    let initialSessionChecked = false;

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const newUserId = session?.user?.id ?? null;

        // Only update if the userId actually changed
        setUserId((currentUserId) => {
          if (currentUserId !== newUserId) {
            console.log(
              `[SignalContext Auth Listener] Auth state changed. New User ID: ${newUserId}`
            );
            return newUserId;
          }
          return currentUserId;
        });
      }
    );

    // Run once on mount in case we already have a session
    // Only do this if we haven't checked yet
    if (!initialSessionChecked) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        const initialUserId = session?.user?.id ?? null;
        console.log(
          `[SignalContext Auth Listener] Initial session check. User ID: ${initialUserId}`
        );
        setUserId(initialUserId);
        initialSessionChecked = true;
      });
    }

    return () => {
      console.log("[SignalContext Auth Listener] Unsubscribing auth listener.");
      listener?.subscription?.unsubscribe();
    };
  }, []); // Empty dependency array - only set up once

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
          console.log(
            `[SignalContext Store Effect] New bundle generated. Registering new device...`
          );
          const response = await post("/device/register", {
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
          console.log(
            `[SignalContext Store Effect] Existing keys found. Using deviceId from localStorage.`
          );
          const existingDeviceIdFromStorage =
            localStorage.getItem(localStorageKey);
          if (!existingDeviceIdFromStorage) {
            console.error(
              "[SignalContext Store Effect] CRITICAL: Keys exist in DB, but no deviceId found in localStorage. This might happen after device cleanup. Regenerating keys..."
            );
            // Clear the existing keys and regenerate
            await store.clearAllData();
            console.log(
              "[SignalContext Store Effect] Cleared existing keys. Regenerating..."
            );

            const newBundle = await initializeSignalProtocol(store, userId);
            if (!newBundle) {
              throw new Error(
                "Failed to regenerate Signal keys after localStorage cleanup"
              );
            }

            const response = await post("/device/register", {
              ...newBundle,
              userId: userId,
            });

            if (
              response?.deviceId === undefined ||
              response?.deviceId === null
            ) {
              throw new Error(
                "Device registration failed: No deviceId in server response after regeneration."
              );
            }
            finalDeviceId = response.deviceId;
            localStorage.setItem(localStorageKey, String(finalDeviceId));
            console.log(
              `[SignalContext Store Effect] Regenerated and saved new deviceId: ${finalDeviceId}`
            );
          } else {
            finalDeviceId = Number(existingDeviceIdFromStorage); // Ensure it's a number if store expects that
            console.log(
              `[SignalContext Store Effect] Using existing deviceId from localStorage: ${finalDeviceId}`
            );

            // FORCE CLEANUP: Check if this device still exists in the database
            // This handles cases where the device was cleaned up server-side but localStorage wasn't cleared
            try {
              console.log(
                `[SignalContext Store Effect] Verifying device ${finalDeviceId} still exists...`
              );
              const verifyResponse = await post("/device/verify", {
                userId: userId,
                deviceId: finalDeviceId,
              });

              if (!verifyResponse || !verifyResponse.exists) {
                console.warn(
                  `[SignalContext Store Effect] Device ${finalDeviceId} no longer exists in database. Force re-registering...`
                );

                // Clear everything and start fresh
                await store.clearAllData();
                localStorage.removeItem(localStorageKey);

                const newBundle = await initializeSignalProtocol(store, userId);
                if (!newBundle) {
                  throw new Error(
                    "Failed to regenerate Signal keys after device verification failure"
                  );
                }

                const response = await post("/device/register", {
                  ...newBundle,
                  userId: userId,
                });

                if (
                  response?.deviceId === undefined ||
                  response?.deviceId === null
                ) {
                  throw new Error(
                    "Device registration failed: No deviceId in server response after verification failure."
                  );
                }
                finalDeviceId = response.deviceId;
                localStorage.setItem(localStorageKey, String(finalDeviceId));
                console.log(
                  `[SignalContext Store Effect] Force re-registered with new deviceId: ${finalDeviceId}`
                );
              } else {
                console.log(
                  `[SignalContext Store Effect] Device ${finalDeviceId} verified as existing.`
                );
              }
            } catch (verifyError) {
              console.warn(
                `[SignalContext Store Effect] Device verification failed, continuing with existing deviceId: ${verifyError.message}`
              );
              // Continue with existing deviceId if verification fails
            }
          }
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
