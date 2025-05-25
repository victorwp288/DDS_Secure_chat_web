import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function notifyParticipantsOfDeviceChange(userId, newDeviceId) {
  try {
    console.log(
      `[Notify Participants] Notifying participants about device change for user ${userId}, new device: ${newDeviceId}`
    );

    // Get all conversations this user participates in
    const { data: conversations, error: convError } = await supabaseAdmin
      .from("conversation_participants")
      .select(
        `
        conversation_id,
        conversations!inner(
          id
        )
      `
      )
      .eq("profile_id", userId);

    if (convError) {
      console.error(
        "[Notify Participants] Error fetching conversations:",
        convError
      );
      throw convError;
    }

    console.log(
      `[Notify Participants] Found ${
        conversations?.length || 0
      } conversations for user ${userId}`
    );

    if (!conversations || conversations.length === 0) {
      console.log(
        "[Notify Participants] No conversations found, no notifications needed"
      );
      return { notificationsSent: 0 };
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
          `[Notify Participants] Error fetching participants for conversation ${conversationId}:`,
          participantsError
        );
        continue;
      }

      if (!otherParticipants || otherParticipants.length === 0) {
        console.log(
          `[Notify Participants] No other participants in conversation ${conversationId}`
        );
        continue;
      }

      console.log(
        `[Notify Participants] Notifying ${otherParticipants.length} participants in conversation ${conversationId}`
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
          `[Notify Participants] Error inserting notifications for conversation ${conversationId}:`,
          notificationError
        );
        continue;
      }

      notificationsSent += notifications.length;
      console.log(
        `[Notify Participants] Sent ${notifications.length} notifications for conversation ${conversationId}`
      );
    }

    console.log(
      `[Notify Participants] Total notifications sent: ${notificationsSent}`
    );

    return { notificationsSent };
  } catch (error) {
    console.error("[Notify Participants] Error:", error);
    throw error;
  }
}
