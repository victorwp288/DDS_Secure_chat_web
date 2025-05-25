import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export function usePresence(currentUser, deviceId) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const heartbeatIntervalRef = useRef(null);
  const statusIntervalRef = useRef(null);
  const lastHeartbeatRef = useRef(null);

  // Track browser online/offline status
  useEffect(() => {
    const handleOnline = () => {
      console.log("[Presence] Browser came online");
      setIsOnline(true);
    };
    const handleOffline = () => {
      console.log("[Presence] Browser went offline");
      setIsOnline(false);
    };

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
        console.log(
          `[Presence] Updated user ${currentUser.id} status to: ${status}`
        );
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

    // Set up heartbeat interval (every 20 seconds - more frequent)
    heartbeatIntervalRef.current = setInterval(() => {
      if (isOnline) {
        updateDeviceHeartbeat();
      }
    }, 20000);

    // Set up status update interval (every 30 seconds - keep status fresh)
    statusIntervalRef.current = setInterval(() => {
      if (isOnline) {
        updateUserStatus("online");
      }
    }, 30000);

    return () => {
      console.log(`[Presence] Cleaning up presence for user ${currentUser.id}`);

      // Clear intervals
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
        statusIntervalRef.current = null;
      }

      // Set user offline when component unmounts (logout, page close, etc.)
      updateUserStatus("offline");
    };
  }, [currentUser?.id, deviceId]);

  // Handle online/offline state changes
  useEffect(() => {
    if (!currentUser?.id) return;

    const statusToSet = isOnline ? "online" : "offline";
    console.log(
      `[Presence] Browser online state changed to: ${isOnline}, setting status: ${statusToSet}`
    );
    updateUserStatus(statusToSet);

    if (isOnline) {
      // When coming back online, update heartbeat immediately
      updateDeviceHeartbeat();
    }
  }, [isOnline, currentUser?.id]);

  // Handle page visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!currentUser?.id) return;

      if (document.hidden) {
        console.log("[Presence] Page hidden");
        // Don't immediately set offline, let the heartbeat handle it
      } else {
        console.log("[Presence] Page visible");
        // Page is visible again, ensure we're online if browser is online
        if (isOnline) {
          updateUserStatus("online");
          updateDeviceHeartbeat();
        }
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
        console.log("[Presence] Page unloading, setting offline status");
        // Use sendBeacon for reliable offline status update on page unload
        const data = JSON.stringify({
          user_id: currentUser.id,
          status: "offline",
          updated_at: new Date().toISOString(),
        });

        // Try to send offline status via beacon (more reliable than fetch on unload)
        if (navigator.sendBeacon) {
          const success = navigator.sendBeacon("/api/presence/offline", data);
          console.log(`[Presence] Beacon sent: ${success}`);
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
