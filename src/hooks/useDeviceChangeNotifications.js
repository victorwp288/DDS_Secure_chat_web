import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";

export function useDeviceChangeNotifications(currentUser, signalContext) {
  const processedNotificationsRef = useRef(new Set());

  useEffect(() => {
    if (!currentUser?.id || !signalContext?.isReady) {
      return;
    }

    console.log(
      `[Device Change Notifications] Setting up listener for user ${currentUser.id}`
    );

    // Function to handle device change notifications
    const handleDeviceChangeNotification = async (payload) => {
      const notification = payload.new;
      console.log(
        "[Device Change Notifications] Received notification:",
        notification
      );

      // Avoid processing the same notification multiple times
      if (processedNotificationsRef.current.has(notification.id)) {
        console.log(
          `[Device Change Notifications] Notification ${notification.id} already processed, skipping`
        );
        return;
      }

      try {
        const senderId = notification.sender_id;
        const newDeviceId = notification.new_device_id;

        console.log(
          `[Device Change Notifications] Processing device change for user ${senderId}, new device: ${newDeviceId}`
        );

        // Clear sessions only for the specific device that changed
        // This is more targeted and prevents breaking existing working sessions
        const specificDeviceAddress = `${senderId}.${newDeviceId}`;
        console.log(
          `[Device Change Notifications] Clearing session and identity for specific device: ${specificDeviceAddress}`
        );

        try {
          await signalContext.signalStore.removeSession(specificDeviceAddress);
          console.log(
            `[Device Change Notifications] Removed session for ${specificDeviceAddress}`
          );
        } catch (error) {
          console.warn(
            `[Device Change Notifications] Error removing session for ${specificDeviceAddress}:`,
            error
          );
        }

        // Also clear identity for the specific device
        if (typeof signalContext.signalStore.removeIdentity === "function") {
          try {
            await signalContext.signalStore.removeIdentity(
              specificDeviceAddress
            );
            console.log(
              `[Device Change Notifications] Cleared identity for ${specificDeviceAddress}`
            );
          } catch (error) {
            console.warn(
              `[Device Change Notifications] Error clearing identity for ${specificDeviceAddress}:`,
              error
            );
          }
        }

        // Note: We only clear the specific device that changed to avoid breaking
        // existing working sessions with other devices from the same user

        // Mark notification as processed
        await supabase
          .from("device_change_notifications")
          .update({ processed: true })
          .eq("id", notification.id);

        processedNotificationsRef.current.add(notification.id);
        console.log(
          `[Device Change Notifications] Successfully processed notification ${notification.id}`
        );
      } catch (error) {
        console.error(
          `[Device Change Notifications] Error processing notification ${notification.id}:`,
          error
        );
      }
    };

    // Set up realtime subscription for device change notifications
    const channel = supabase
      .channel(`device-changes:${currentUser.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "device_change_notifications",
          filter: `recipient_id=eq.${currentUser.id}`,
        },
        handleDeviceChangeNotification
      )
      .subscribe((status, err) => {
        if (err) {
          console.error(
            "[Device Change Notifications] Subscription error:",
            err
          );
        } else {
          console.log(
            `[Device Change Notifications] Subscription status: ${status}`
          );
        }
      });

    // Also check for any unprocessed notifications on startup
    const checkUnprocessedNotifications = async () => {
      try {
        const { data: unprocessedNotifications, error } = await supabase
          .from("device_change_notifications")
          .select("*")
          .eq("recipient_id", currentUser.id)
          .eq("processed", false)
          .order("created_at", { ascending: true });

        if (error) {
          console.error(
            "[Device Change Notifications] Error fetching unprocessed notifications:",
            error
          );
          return;
        }

        if (unprocessedNotifications && unprocessedNotifications.length > 0) {
          console.log(
            `[Device Change Notifications] Found ${unprocessedNotifications.length} unprocessed notifications`
          );

          for (const notification of unprocessedNotifications) {
            await handleDeviceChangeNotification({ new: notification });
          }
        }
      } catch (error) {
        console.error(
          "[Device Change Notifications] Error checking unprocessed notifications:",
          error
        );
      }
    };

    // Check for unprocessed notifications after a short delay to ensure signal context is ready
    const timeoutId = setTimeout(checkUnprocessedNotifications, 1000);

    return () => {
      console.log(
        `[Device Change Notifications] Cleaning up listener for user ${currentUser.id}`
      );
      clearTimeout(timeoutId);
      channel.unsubscribe();
    };
  }, [currentUser?.id, signalContext?.isReady]);
}
