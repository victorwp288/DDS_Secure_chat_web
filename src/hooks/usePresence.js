import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export function usePresence(currentUser, deviceId) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const heartbeatIntervalRef = useRef(null);
  const lastHeartbeatRef = useRef(null);

  // Track browser online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Update user status in database
  const updateUserStatus = async (status) => {
    if (!currentUser?.id) return;

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          status: status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentUser.id);

      if (error) {
        console.warn("[Presence] Error updating user status:", error);
      } else {
        console.log(`[Presence] Updated user status to: ${status}`);
      }
    } catch (error) {
      console.warn("[Presence] Error updating user status:", error);
    }
  };

  // Update device last_seen_at
  const updateDeviceHeartbeat = async () => {
    if (!deviceId || !currentUser?.id) return;

    try {
      const { error } = await supabase
        .from("devices")
        .update({
          last_seen_at: new Date().toISOString(),
        })
        .eq("device_id", deviceId)
        .eq("user_id", currentUser.id);

      if (error) {
        console.warn("[Presence] Error updating device heartbeat:", error);
      } else {
        lastHeartbeatRef.current = Date.now();
        console.log(`[Presence] Updated device ${deviceId} heartbeat`);
      }
    } catch (error) {
      console.warn("[Presence] Error updating device heartbeat:", error);
    }
  };

  // Main presence effect
  useEffect(() => {
    if (!currentUser?.id || !deviceId) {
      return;
    }

    console.log(
      `[Presence] Setting up presence for user ${currentUser.id}, device ${deviceId}`
    );

    // Set initial status based on browser online state
    const initialStatus = isOnline ? "online" : "offline";
    updateUserStatus(initialStatus);

    // Update device heartbeat immediately
    updateDeviceHeartbeat();

    // Set up heartbeat interval (every 30 seconds)
    heartbeatIntervalRef.current = setInterval(() => {
      if (isOnline) {
        updateDeviceHeartbeat();
      }
    }, 30000);

    // Set up status update when online state changes
    const statusToSet = isOnline ? "online" : "offline";
    updateUserStatus(statusToSet);

    return () => {
      console.log(`[Presence] Cleaning up presence for user ${currentUser.id}`);

      // Clear heartbeat interval
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }

      // Set user offline when component unmounts (logout, page close, etc.)
      updateUserStatus("offline");
    };
  }, [currentUser?.id, deviceId, isOnline]);

  // Handle page visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!currentUser?.id) return;

      if (document.hidden) {
        // Page is hidden, but don't immediately set offline
        // The heartbeat will stop and the cleanup function will handle it
        console.log("[Presence] Page hidden, heartbeat will continue");
      } else {
        // Page is visible again, ensure we're online if browser is online
        if (isOnline) {
          updateUserStatus("online");
          updateDeviceHeartbeat();
        }
        console.log("[Presence] Page visible, updated presence");
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [currentUser?.id, isOnline]);

  // Handle beforeunload (page close/refresh)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (currentUser?.id) {
        // Use sendBeacon for reliable offline status update on page unload
        const data = JSON.stringify({
          user_id: currentUser.id,
          status: "offline",
          updated_at: new Date().toISOString(),
        });

        // Try to send offline status via beacon (more reliable than fetch on unload)
        if (navigator.sendBeacon) {
          navigator.sendBeacon("/api/presence/offline", data);
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [currentUser?.id]);

  return {
    isOnline,
    updateUserStatus,
    updateDeviceHeartbeat,
    lastHeartbeat: lastHeartbeatRef.current,
  };
}
