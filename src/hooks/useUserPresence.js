import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export function useUserPresence(userIds = []) {
  const [presenceData, setPresenceData] = useState({});

  useEffect(() => {
    if (!userIds.length) {
      setPresenceData({});
      return;
    }

    console.log(
      "[UserPresence] Setting up presence tracking for users:",
      userIds
    );

    // Fetch initial presence data
    const fetchPresence = async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, status, updated_at")
          .in("id", userIds);

        if (error) {
          console.error("[UserPresence] Error fetching presence:", error);
          return;
        }

        const presenceMap = {};
        data.forEach((user) => {
          // Consider user online if:
          // 1. Status is 'online' AND
          // 2. Last update was within the last 90 seconds (reduced from 2 minutes)
          const lastUpdate = new Date(user.updated_at);
          const now = new Date();
          const timeDiff = now - lastUpdate;
          const isRecent = timeDiff < 90 * 1000; // 90 seconds

          presenceMap[user.id] = {
            status: user.status,
            isOnline: user.status === "online" && isRecent,
            lastSeen: user.updated_at,
          };
        });

        setPresenceData(presenceMap);
        console.log("[UserPresence] Initial presence data:", presenceMap);
      } catch (error) {
        console.error("[UserPresence] Error fetching presence:", error);
      }
    };

    fetchPresence();

    // Set up real-time subscription for presence updates
    // Use a more specific channel name to avoid conflicts
    const channelName = `presence-${userIds.join("-")}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          // Remove the filter to catch all profile updates, then filter in the handler
        },
        (payload) => {
          const { new: updatedUser } = payload;

          // Only process updates for users we're tracking
          if (!userIds.includes(updatedUser.id)) {
            return;
          }

          console.log("[UserPresence] Real-time presence update:", {
            userId: updatedUser.id,
            status: updatedUser.status,
            updated_at: updatedUser.updated_at,
          });

          setPresenceData((prev) => {
            // Calculate if user is considered online
            const lastUpdate = new Date(updatedUser.updated_at);
            const now = new Date();
            const timeDiff = now - lastUpdate;
            const isRecent = timeDiff < 90 * 1000; // 90 seconds

            const newPresenceData = {
              ...prev,
              [updatedUser.id]: {
                status: updatedUser.status,
                isOnline: updatedUser.status === "online" && isRecent,
                lastSeen: updatedUser.updated_at,
              },
            };

            console.log(
              `[UserPresence] Updated presence for user ${updatedUser.id}:`,
              newPresenceData[updatedUser.id]
            );
            return newPresenceData;
          });
        }
      )
      .subscribe((status, err) => {
        if (err) {
          console.error("[UserPresence] Subscription error:", err);
        } else {
          console.log(
            `[UserPresence] Subscription status for ${channelName}:`,
            status
          );
        }
      });

    // Set up periodic cleanup to mark stale "online" users as offline
    // Reduced interval for more responsive updates
    const cleanupInterval = setInterval(() => {
      setPresenceData((prev) => {
        const now = new Date();
        const updated = { ...prev };
        let hasChanges = false;

        Object.keys(updated).forEach((userId) => {
          const userData = updated[userId];
          if (userData.status === "online" && userData.isOnline) {
            const lastUpdate = new Date(userData.lastSeen);
            const timeDiff = now - lastUpdate;

            // If last update was more than 90 seconds ago, consider offline
            if (timeDiff > 90 * 1000) {
              updated[userId] = {
                ...userData,
                isOnline: false,
              };
              hasChanges = true;
              console.log(
                `[UserPresence] Marking user ${userId} as offline due to stale data (${Math.round(
                  timeDiff / 1000
                )}s ago)`
              );
            }
          }
        });

        return hasChanges ? updated : prev;
      });
    }, 15000); // Check every 15 seconds (reduced from 30)

    // Periodic refresh of presence data to catch any missed updates
    const refreshInterval = setInterval(() => {
      console.log("[UserPresence] Periodic refresh of presence data");
      fetchPresence();
    }, 60000); // Refresh every minute

    return () => {
      console.log(
        `[UserPresence] Cleaning up presence subscription for ${channelName}`
      );
      supabase.removeChannel(channel);
      clearInterval(cleanupInterval);
      clearInterval(refreshInterval);
    };
  }, [userIds.join(",")]); // Re-run when user list changes

  // Helper function to get a specific user's presence
  const getUserPresence = (userId) => {
    return (
      presenceData[userId] || {
        status: "offline",
        isOnline: false,
        lastSeen: null,
      }
    );
  };

  // Helper function to check if a user is online
  const isUserOnline = (userId) => {
    return getUserPresence(userId).isOnline;
  };

  return {
    presenceData,
    getUserPresence,
    isUserOnline,
  };
}
