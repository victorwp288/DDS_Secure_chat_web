import { useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  decryptMessage,
  arrayBufferToString,
  hexToUint8Array,
} from "../lib/signalUtils";
import { SignalProtocolAddress } from "@privacyresearch/libsignal-protocol-typescript";
import { cacheSentMessage } from "../lib/db";

export function useRealtimeSubscriptions({
  selectedConversation,
  currentUser,
  profile,
  isReady,
  signalContext,
  conversations,
  onNewMessage,
  onConversationUpdate,
  onSelectedConversationUpdate,
  fetchAndFormatSingleConversation,
}) {
  const messageSubscriptionRef = useRef(null);
  const currentUserRef = useRef(currentUser);
  const selectedConversationRef = useRef(selectedConversation);
  const conversationsRef = useRef(conversations);

  // Update refs when values change
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  // Memoize the handleNewMessage function to prevent subscription recreation
  const handleNewMessage = useCallback(
    async (payload) => {
      const { new: newMessageData } = payload;
      const currentUserService = currentUserRef.current;

      // SUPER EARLY EXIT: Skip immediately if message is from self, before any other processing
      if (
        currentUserService?.id &&
        newMessageData.profile_id === currentUserService.id
      ) {
        console.log("[Realtime HNM] Message is from self. Skipping.");
        return;
      }

      const selectedConversationService = selectedConversationRef.current;

      if (!isReady || !signalContext) {
        console.warn(
          "[Realtime HNM] Context not ready or sig not available. Skipping message."
        );
        return;
      }

      const {
        signalStore: currentSignalStore,
        deviceId: myCurrentDeviceIdFromContext,
      } = signalContext;
      const currentUserId = currentUserService?.id;

      if (!currentUserId) {
        console.warn(
          "[Realtime HNM] currentUser.id is not available. Skipping message."
        );
        return;
      }

      if (
        !selectedConversationService ||
        newMessageData.conversation_id !== selectedConversationService.id
      ) {
        console.log(
          "[Realtime HNM] Message for different or no selected conversation. Skipping."
        );
        return;
      }

      console.log(
        `[Realtime HNM] Comparing device IDs: incoming.target_device_id = ${
          newMessageData.target_device_id
        } (type: ${typeof newMessageData.target_device_id}), myCurrentDeviceId = ${myCurrentDeviceIdFromContext} (type: ${typeof myCurrentDeviceIdFromContext})`
      );

      if (
        newMessageData.target_device_id !== undefined &&
        newMessageData.target_device_id !== null &&
        String(newMessageData.target_device_id) !==
          String(myCurrentDeviceIdFromContext)
      ) {
        console.log(
          `[Realtime HNM] Message not for this deviceId (Target: ${String(
            newMessageData.target_device_id
          )}, Mine: ${String(myCurrentDeviceIdFromContext)}). Skipping.`
        );
        return;
      }

      const senderAddress = new SignalProtocolAddress(
        newMessageData.profile_id,
        newMessageData.device_id || 1
      );
      const senderAddressString = senderAddress.toString();

      const { data: senderProfile } = await supabase
        .from("profiles")
        .select("id, full_name, username, avatar_url")
        .eq("id", newMessageData.profile_id)
        .single();

      let bodyUint8Array;
      try {
        bodyUint8Array = hexToUint8Array(newMessageData.body);
      } catch (conversionError) {
        console.error(
          `[Realtime HNM] Hex conversion error for msg ${newMessageData.id}:`,
          conversionError
        );
        return;
      }

      if (!bodyUint8Array) {
        console.warn("[Realtime HNM] bodyUint8Array is null after conversion.");
        return;
      }

      const ciphertextForDecryption = {
        type: newMessageData.type,
        body: bodyUint8Array,
      };

      let plaintextBuffer;
      try {
        plaintextBuffer = await decryptMessage(
          currentSignalStore,
          currentUserId,
          myCurrentDeviceIdFromContext,
          newMessageData.profile_id,
          newMessageData.device_id || 1,
          ciphertextForDecryption
        );
      } catch (e) {
        if (e.message?.toLowerCase().includes("duplicate")) {
          console.warn(
            `[Realtime HNM] Duplicate prekey message for ${senderAddressString} (msg ID: ${newMessageData.id}), ignoring.`
          );
          return;
        }

        if (e.message?.includes("Bad MAC") && newMessageData.type === 3) {
          console.warn(
            `[Realtime HNM] Bad MAC for PreKeyWhisperMessage ${senderAddressString} (msg ID: ${newMessageData.id}). Likely wrong key/device or duplicate. Ignoring.`
          );
          return;
        }

        console.error("[Realtime HNM] Decryption error (other):", e);
        return;
      }

      if (!plaintextBuffer) {
        console.warn("[Realtime HNM] Decryption returned null.");
        return;
      }

      const plaintext = arrayBufferToString(plaintextBuffer);

      if (
        selectedConversationService &&
        selectedConversationService.id === newMessageData.conversation_id
      ) {
        await cacheSentMessage(currentUserId, {
          id: newMessageData.id,
          content: plaintext,
          conversationId: selectedConversationService.id,
          timestamp: newMessageData.created_at,
        });
      }

      const formatted = {
        id: newMessageData.id,
        senderId: senderProfile?.id || newMessageData.profile_id,
        senderName:
          senderProfile?.full_name || senderProfile?.username || "Unknown",
        senderAvatar: senderProfile?.avatar_url,
        content: plaintext,
        timestamp: new Date(newMessageData.created_at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        isSelf: false,
      };

      onNewMessage(formatted);
    },
    [isReady, signalContext, onNewMessage]
  ); // Stable dependencies only

  // Message subscription effect
  useEffect(() => {
    if (!isReady || !selectedConversation?.id) {
      return;
    }

    if (!currentUserRef.current) {
      console.warn(
        "[Realtime Effect] Current user not yet available for message subscription setup."
      );
      return;
    }

    if (messageSubscriptionRef.current) {
      console.log(
        `[Realtime Effect] Explicitly unsubscribing existing messageSubscription (topic: ${messageSubscriptionRef.current.topic}) before creating new one for conv ${selectedConversation.id}.`
      );
      messageSubscriptionRef.current.unsubscribe();
    }

    console.log(
      `[Realtime Effect] Setting up subscription for conversation: ${selectedConversation.id}`
    );
    const chan = supabase
      .channel(`messages:${selectedConversation.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${selectedConversation.id}`,
        },
        handleNewMessage
      )
      .subscribe((status, err) => {
        if (err) {
          console.error(
            `[Realtime] SUBSCRIBE ERROR for conv ${selectedConversation.id}:`,
            err
          );
        } else {
          console.log(
            `[Realtime] Subscription status for conv ${selectedConversation.id}: ${status}`
          );
        }
      });

    messageSubscriptionRef.current = chan;

    return () => {
      console.log(
        `[Realtime Effect Cleanup] Unsubscribing channel for conv ${selectedConversation?.id} (channel topic: ${chan.topic})`
      );
      chan.unsubscribe();
    };
  }, [selectedConversation?.id, isReady, signalContext]);

  // Conversation list subscription effect
  useEffect(() => {
    if (!profile?.id) {
      return;
    }

    const handleNewConversationParticipantInsert = async (payload) => {
      console.log(
        "[Realtime ConvList] New conversation_participant insert:",
        payload
      );
      const newParticipantEntry = payload.new;

      if (newParticipantEntry.profile_id !== profile.id) {
        return;
      }

      const newConversationId = newParticipantEntry.conversation_id;

      if (
        conversationsRef.current.some((conv) => conv.id === newConversationId)
      ) {
        console.log(
          `[Realtime ConvList] Conversation ${newConversationId} already in list. Skipping.`
        );
        return;
      }

      const newConversation = await fetchAndFormatSingleConversation(
        newConversationId,
        profile.id
      );

      if (newConversation) {
        onConversationUpdate((prevConversations) => {
          if (prevConversations.some((c) => c.id === newConversation.id)) {
            return prevConversations;
          }
          console.log(
            "[Realtime ConvList] Adding new conversation to state:",
            newConversation
          );
          return [newConversation, ...prevConversations];
        });
      }
    };

    const conversationListChannel = supabase
      .channel(`conv-list-updates:${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_participants",
          filter: `profile_id=eq.${profile.id}`,
        },
        handleNewConversationParticipantInsert
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversation_participants",
          filter: `profile_id=eq.${profile.id}`,
        },
        async ({ new: row }) => {
          onConversationUpdate((prev) =>
            prev.map((c) =>
              c.id === row.conversation_id ? { ...c, my_status: row.status } : c
            )
          );

          if (
            row.status === "rejected" &&
            selectedConversationRef.current?.id === row.conversation_id &&
            !selectedConversationRef.current?.is_group
          ) {
            console.warn(
              `[Realtime my_status update] My status for selected chat ${row.conversation_id} changed to rejected. UI should update.`
            );
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversation_participants",
        },
        async ({ new: row }) => {
          const currentSelectedConv = selectedConversationRef.current;
          if (
            currentSelectedConv &&
            !currentSelectedConv.is_group &&
            currentSelectedConv.id === row.conversation_id &&
            row.profile_id !== profile.id
          ) {
            console.log(
              `[Realtime ConvList UPDATE] Peer status updated for conv ${row.conversation_id}. New peer status: ${row.status}`
            );

            // Update conversations list
            onConversationUpdate((prevConvs) =>
              prevConvs.map((c) =>
                c.id === row.conversation_id
                  ? { ...c, peer_status: row.status }
                  : c
              )
            );

            // Also update selectedConversation if it's the same conversation
            if (
              onSelectedConversationUpdate &&
              currentSelectedConv.id === row.conversation_id
            ) {
              onSelectedConversationUpdate((prevSelected) => ({
                ...prevSelected,
                peer_status: row.status,
              }));
            }
          }
        }
      )
      .subscribe((status, err) => {
        if (err) {
          console.error(
            `[Realtime ConvList] Subscription ERROR for ${profile.id}:`,
            err
          );
        } else {
          console.log(
            `[Realtime ConvList] Subscription status for ${profile.id}: ${status}`
          );
        }
      });

    return () => {
      console.log(
        `[Realtime ConvList Cleanup] Unsubscribing for ${profile?.id}`
      );
      if (conversationListChannel) {
        supabase.removeChannel(conversationListChannel);
      }
    };
  }, [profile?.id]);

  return {
    // Expose any methods that might be needed
  };
}
