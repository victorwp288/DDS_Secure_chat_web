import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";

async function fetchAndFormatSingleConversation(
  conversationId,
  currentProfileId,
  supabaseClient
) {
  try {
    const { data: convData, error: convError } = await supabaseClient
      .from("conversations")
      .select(
        `id, created_at, is_group, group_name, group_avatar_url, conversation_participants(profile_id, status, profiles(id, username, full_name, avatar_url, status))`
      )
      .eq("id", conversationId)
      .single();

    if (convError) throw convError;
    if (!convData) return null;

    const participants = convData.conversation_participants.map(
      (p) => p.profiles
    );
    const otherParticipant =
      participants.find((p) => p.id !== currentProfileId) || participants[0];
    const isGroup = convData.is_group;

    const myParticipantEntry = convData.conversation_participants.find(
      (p) => p.profile_id === currentProfileId
    );
    const myStatus = myParticipantEntry?.status || "accepted";

    let peerStatus = "accepted";
    if (!isGroup) {
      const otherParticipantEntry = convData.conversation_participants.find(
        (p) => p.profile_id !== currentProfileId
      );
      peerStatus = otherParticipantEntry?.status || "pending";
    }

    return {
      id: convData.id,
      name: isGroup
        ? convData.group_name || "Unnamed Group"
        : otherParticipant?.full_name ||
          otherParticipant?.username ||
          "Unknown User",
      lastMessage: "...",
      time: "",
      unread: 0,
      avatar: isGroup
        ? convData.group_avatar_url
        : otherParticipant?.avatar_url,
      participants,
      is_group: isGroup,
      group_name: convData.group_name,
      group_avatar_url: convData.group_avatar_url,
      my_status: myStatus,
      peer_status: peerStatus,
    };
  } catch (error) {
    console.error(
      `[fetchAndFormatSingleConversation] Error fetching conversation ${conversationId}:`,
      error
    );
    return null;
  }
}

export function useConversations(profileId) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Memoize the fetchAndFormatSingleConversation function
  const memoizedFetchAndFormatSingleConversation = useCallback(
    (conversationId, currentProfileId) =>
      fetchAndFormatSingleConversation(
        conversationId,
        currentProfileId,
        supabase
      ),
    []
  );

  useEffect(() => {
    if (!profileId) {
      if (!loading && !profileId) setLoading(false);
      return;
    }

    const fetchConversations = async () => {
      setLoading(true);
      try {
        const { data: participantData, error: participantError } =
          await supabase
            .from("conversation_participants")
            .select("conversation_id")
            .eq("profile_id", profileId);

        if (participantError) throw participantError;

        const conversationIds = participantData.map((p) => p.conversation_id);
        if (conversationIds.length === 0) {
          setConversations([]);
          setLoading(false);
          return;
        }

        const { data: convData, error: convError } = await supabase
          .from("conversations")
          .select(
            `id, created_at, is_group, group_name, group_avatar_url, conversation_participants(profile_id, status, profiles(id, username, full_name, avatar_url, status))`
          )
          .in("id", conversationIds);

        if (convError) throw convError;

        const formattedConversations = convData.map((conv) => {
          const participantsFromDb = conv.conversation_participants;
          const myParticipantEntry = participantsFromDb.find(
            (p) => p.profile_id === profileId
          );
          const myStatusInConversation =
            myParticipantEntry?.status || "accepted";

          const participants = participantsFromDb.map((p) => p.profiles);
          const otherParticipant =
            participants.find((p) => p.id !== profileId) || participants[0];
          const isGroup = conv.is_group;

          let peerStatusInConversation = "accepted";
          if (!isGroup) {
            const otherParticipantEntryFromDb = participantsFromDb.find(
              (p) => p.profile_id !== profileId
            );
            peerStatusInConversation =
              otherParticipantEntryFromDb?.status || "pending";
          }

          return {
            id: conv.id,
            name: isGroup
              ? conv.group_name || "Unnamed Group"
              : otherParticipant?.full_name ||
                otherParticipant?.username ||
                "Unknown User",
            lastMessage: "...",
            time: "",
            unread: 0,
            avatar: isGroup
              ? conv.group_avatar_url
              : otherParticipant?.avatar_url,
            participants,
            is_group: isGroup,
            group_name: conv.group_name,
            group_avatar_url: conv.group_avatar_url,
            my_status: myStatusInConversation,
            peer_status: peerStatusInConversation,
          };
        });

        setConversations(formattedConversations);
      } catch (fetchError) {
        console.error("Error fetching conversations:", fetchError);
        setError("Failed to load conversations.");
      } finally {
        setLoading(false);
      }
    };

    fetchConversations();
  }, [profileId]);

  const handleAcceptConversation = async (conversationId, currentUserId) => {
    if (!currentUserId || !supabase) return;

    try {
      const { error } = await supabase
        .from("conversation_participants")
        .update({ status: "accepted" })
        .match({ conversation_id: conversationId, profile_id: currentUserId });

      if (error) throw error;

      let updatedConvForSelection = null;
      setConversations((prevConversations) =>
        prevConversations.map((conv) => {
          if (conv.id === conversationId) {
            updatedConvForSelection = { ...conv, my_status: "accepted" };
            return updatedConvForSelection;
          }
          return conv;
        })
      );

      return updatedConvForSelection;
    } catch (err) {
      console.error("Error accepting conversation:", err);
      throw new Error(`Failed to accept chat: ${err.message}`);
    }
  };

  const handleRejectConversation = async (conversationId, currentUserId) => {
    if (!currentUserId || !supabase) return;

    try {
      const { error } = await supabase
        .from("conversation_participants")
        .update({ status: "rejected" })
        .match({ conversation_id: conversationId, profile_id: currentUserId });

      if (error) throw error;

      setConversations((prevConversations) =>
        prevConversations.map((conv) =>
          conv.id === conversationId ? { ...conv, my_status: "rejected" } : conv
        )
      );
    } catch (err) {
      console.error("Error rejecting conversation:", err);
      throw new Error(`Failed to reject chat: ${err.message}`);
    }
  };

  return {
    conversations,
    setConversations,
    loading,
    error,
    setError,
    handleAcceptConversation,
    handleRejectConversation,
    fetchAndFormatSingleConversation: memoizedFetchAndFormatSingleConversation,
  };
}
