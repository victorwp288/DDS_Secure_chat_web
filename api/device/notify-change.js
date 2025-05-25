import { createClient } from "@supabase/supabase-js";
import { cors } from "../../lib/cors.js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default cors(async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }

  const { userId, newDeviceId } = req.body;

  if (!userId || !newDeviceId) {
    return res.status(400).json({
      error: "Missing required fields: userId, newDeviceId",
    });
  }

  try {
    console.log(
      `[Device Change Notification] Notifying participants about device change for user ${userId}, new device: ${newDeviceId}`
    );

    // Get all conversations this user participates in
    const { data: conversations, error: convError } = await supabaseAdmin
      .from("conversation_participants")
      .select(
        `
        conversation_id,
        conversations!inner(
          id,
          type
        )
      `
      )
      .eq("profile_id", userId);

    if (convError) {
      console.error(
        "[Device Change Notification] Error fetching conversations:",
        convError
      );
      throw convError;
    }

    console.log(
      `[Device Change Notification] Found ${
        conversations?.length || 0
      } conversations for user ${userId}`
    );

    if (!conversations || conversations.length === 0) {
      return res.status(200).json({
        message: "No conversations found, no notifications needed",
        notificationsSent: 0,
      });
    }

    let notificationsSent = 0;

    // For each conversation, notify other participants
    for (const conv of conversations) {
      const conversationId = conv.conversation_id;

      // Get other participants in this conversation
      const { data: otherParticipants, error: participantsError } =
        await supabaseAdmin
          .from("conversation_participants")
          .select("profile_id")
          .eq("conversation_id", conversationId)
          .neq("profile_id", userId);

      if (participantsError) {
        console.warn(
          `[Device Change Notification] Error fetching participants for conversation ${conversationId}:`,
          participantsError
        );
        continue;
      }

      if (!otherParticipants || otherParticipants.length === 0) {
        console.log(
          `[Device Change Notification] No other participants in conversation ${conversationId}`
        );
        continue;
      }

      console.log(
        `[Device Change Notification] Notifying ${otherParticipants.length} participants in conversation ${conversationId}`
      );

      // Insert device change notifications for each participant
      const notifications = otherParticipants.map((participant) => ({
        recipient_id: participant.profile_id,
        sender_id: userId,
        conversation_id: conversationId,
        new_device_id: newDeviceId,
        notification_type: "device_change",
        created_at: new Date().toISOString(),
      }));

      const { error: notificationError } = await supabaseAdmin
        .from("device_change_notifications")
        .insert(notifications);

      if (notificationError) {
        console.warn(
          `[Device Change Notification] Error inserting notifications for conversation ${conversationId}:`,
          notificationError
        );
        continue;
      }

      notificationsSent += notifications.length;
      console.log(
        `[Device Change Notification] Sent ${notifications.length} notifications for conversation ${conversationId}`
      );
    }

    console.log(
      `[Device Change Notification] Total notifications sent: ${notificationsSent}`
    );

    return res.status(200).json({
      message: "Device change notifications sent successfully",
      notificationsSent,
    });
  } catch (error) {
    console.error("[Device Change Notification] Error:", error);
    return res.status(500).json({
      error: "Failed to send device change notifications",
      details: error.message,
    });
  }
});
