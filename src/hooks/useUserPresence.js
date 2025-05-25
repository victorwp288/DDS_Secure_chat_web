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
          // 2. Last update was within the last 2 minutes
          const lastUpdate = new Date(user.updated_at);
          const now = new Date();
          const timeDiff = now - lastUpdate;
          const isRecent = timeDiff < 2 * 60 * 1000; // 2 minutes

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
    const channel = supabase
      .channel("user-presence-updates")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=in.(${userIds.join(",")})`,
        },
        (payload) => {
          const { new: updatedUser } = payload;
          console.log("[UserPresence] Real-time presence update:", updatedUser);

          setPresenceData((prev) => {
            // Check if this user is in our tracking list
            if (!userIds.includes(updatedUser.id)) {
              return prev;
            }

            // Calculate if user is considered online
            const lastUpdate = new Date(updatedUser.updated_at);
            const now = new Date();
            const timeDiff = now - lastUpdate;
            const isRecent = timeDiff < 2 * 60 * 1000; // 2 minutes

            return {
              ...prev,
              [updatedUser.id]: {
                status: updatedUser.status,
                isOnline: updatedUser.status === "online" && isRecent,
                lastSeen: updatedUser.updated_at,
              },
            };
          });
        }
      )
      .subscribe((status, err) => {
        if (err) {
          console.error("[UserPresence] Subscription error:", err);
        } else {
          console.log("[UserPresence] Subscription status:", status);
        }
      });

    // Set up periodic cleanup to mark stale "online" users as offline
    const cleanupInterval = setInterval(() => {
      setPresenceData((prev) => {
        const now = new Date();
        const updated = { ...prev };
        let hasChanges = false;

        Object.keys(updated).forEach((userId) => {
          const userData = updated[userId];
          if (userData.status === "online") {
            const lastUpdate = new Date(userData.lastSeen);
            const timeDiff = now - lastUpdate;

            // If last update was more than 2 minutes ago, consider offline
            if (timeDiff > 2 * 60 * 1000) {
              updated[userId] = {
                ...userData,
                isOnline: false,
              };
              hasChanges = true;
              console.log(
                `[UserPresence] Marking user ${userId} as offline due to stale data`
              );
            }
          }
        });

        return hasChanges ? updated : prev;
      });
    }, 30000); // Check every 30 seconds

    return () => {
      console.log("[UserPresence] Cleaning up presence subscription");
      supabase.removeChannel(channel);
      clearInterval(cleanupInterval);
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
