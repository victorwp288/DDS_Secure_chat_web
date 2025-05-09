// SignalContext.jsx
import { createContext, useContext, useEffect, useState } from "react";
import { IndexedDBStore } from "../lib/localDb";
import { post } from "../lib/backend";
import { initializeSignalProtocol } from "../lib/signalUtils";

const SignalCtx = createContext(null);
export const useSignal = () => useContext(SignalCtx);

export function SignalProvider({ children, userId }) {
  const [store] = useState(() => new IndexedDBStore());
  const [deviceId, setDeviceId] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!userId || !store) return;

    let didCancel = false;
    setIsReady(false);
    setError(null);

    (async () => {
      const localStorageKey = `deviceId_${userId}`;
      let localKey = localStorage.getItem(localStorageKey);
      let currentDeviceId = localKey ? Number(localKey) : null;
      let keysExist = false;

      try {
        const identityKeyPair = await store.getIdentityKeyPair();
        keysExist = !!identityKeyPair;
        console.log(`[SignalContext] Local keys exist? ${keysExist}`);

        if (!keysExist && currentDeviceId) {
          console.warn(
            `[SignalContext] Local keys missing but found old deviceId ${currentDeviceId} in localStorage. Clearing localStorage to force re-registration.`
          );
          localStorage.removeItem(localStorageKey);
          currentDeviceId = null;
        }

        if (!keysExist || !currentDeviceId) {
          console.log(
            `[SignalContext] Keys missing (${!keysExist}) or no saved Device ID (${!currentDeviceId}). Initializing/Registering...`
          );

          const bundle = await initializeSignalProtocol(store, userId);
          console.log(
            "[SignalContext] initializeSignalProtocol complete. Bundle generated."
          );

          console.log("[SignalContext] Registering bundle with server...");
          const response = await post("/device/register", bundle);
          const newDeviceId = response?.deviceId;

          if (newDeviceId === undefined || newDeviceId === null) {
            throw new Error(
              "Device registration failed: No deviceId in response."
            );
          }

          currentDeviceId = Number(newDeviceId);
          localStorage.setItem(localStorageKey, String(currentDeviceId));
          console.log(
            `[SignalContext] Device registration successful. Device ID: ${currentDeviceId}`
          );
        } else {
          console.log(
            `[SignalContext] Found existing keys and saved deviceId ${currentDeviceId}. Assuming ready.`
          );
        }

        if (!didCancel) {
          setDeviceId(currentDeviceId);
          setIsReady(true);
          console.log("[SignalContext] Provider is ready.");
        }
      } catch (err) {
        console.error(
          "[SignalContext] Initialization/Registration error:",
          err
        );
        if (!didCancel) {
          setError(err.message || "Initialization failed");
          setIsReady(false);
        }
      }
    })();

    return () => {
      didCancel = true;
    };
  }, [userId, store]);

  return (
    <SignalCtx.Provider
      value={{
        isReady,
        signalStore: isReady ? store : null,
        deviceId: isReady ? deviceId : null,
        initializationError: error,
      }}
    >
      {children}
    </SignalCtx.Provider>
  );
}
