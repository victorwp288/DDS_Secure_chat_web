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

        // Handle "No record for device" and "Bad MAC" errors by building session and retrying
        if (
          e.message?.includes("No record for device") ||
          e.message?.includes("Bad MAC")
        ) {
          const errorType = e.message?.includes("No record for device")
            ? "No record for device"
            : "Bad MAC";
          console.warn(
            `[Realtime HNM] 🔧 ${errorType} for ${senderAddressString} (msg ID: ${newMessageData.id}), attempting session build and retry...`
          );
          try {
            // Import required modules for session building
            const { get } = await import("../lib/backend");
            const { bundlesToMap } = await import("../lib/signalUtils");
            const { SessionBuilder } = await import(
              "@privacyresearch/libsignal-protocol-typescript"
            );

            // Remove any existing session
            await currentSignalStore.removeSession(senderAddressString);
            console.log(
              `[Realtime HNM] ✅ Removed session for ${senderAddressString}.`
            );

            // Fetch bundles for the sender
            console.log(
              `[Realtime HNM] 📡 Fetching bundles for peer ${newMessageData.profile_id}...`
            );
            const peerBundlesData = await get(
              `/signal/bundles/${newMessageData.profile_id}`
            );
            console.log(
              `[Realtime HNM] 📦 Received ${
                peerBundlesData?.length || 0
              } bundles for peer ${newMessageData.profile_id}`
            );

            if (!peerBundlesData || !Array.isArray(peerBundlesData)) {
              throw new Error(
                `[Realtime HNM] No valid bundles array found for peer ${newMessageData.profile_id}.`
              );
            }

            const bundleMap = bundlesToMap(peerBundlesData);
            console.log(
              `[Realtime HNM] 🗺️ Bundle map created with ${
                bundleMap.size
              } devices: [${Array.from(bundleMap.keys()).join(", ")}]`
            );

            const bundleForDevice = bundleMap.get(
              newMessageData.device_id || 1
            );
            if (!bundleForDevice) {
              throw new Error(
                `[Realtime HNM] Bundle not found for ${senderAddressString} (Device ID: ${
                  newMessageData.device_id || 1
                }) after fetching. Available devices: [${Array.from(
                  bundleMap.keys()
                ).join(", ")}]`
              );
            }

            console.log(
              `[Realtime HNM] ✅ Found bundle for ${senderAddressString}.`
            );

            // Also clear any identity key to force fresh trust establishment
            if (typeof currentSignalStore.removeIdentity === "function") {
              await currentSignalStore.removeIdentity(senderAddressString);
              console.log(
                `[Realtime HNM] 🗑️ Cleared identity for ${senderAddressString}.`
              );
            }

            // Save the new identity from the bundle
            await currentSignalStore.saveIdentity(
              senderAddressString,
              bundleForDevice.identityKey
            );
            console.log(
              `[Realtime HNM] 💾 Saved fresh identity for ${senderAddressString}.`
            );

            // Build session
            const builder = new SessionBuilder(
              currentSignalStore,
              senderAddress
            );
            console.log(
              `[Realtime HNM] 🔨 Building session for ${senderAddressString}...`
            );
            await builder.processPreKey(bundleForDevice);
            console.log(
              `[Realtime HNM] ✅ Session built for ${senderAddressString}.`
            );

            // Verify session was created
            const sessionExists = await currentSignalStore.loadSession(
              senderAddressString
            );
            console.log(
              `[Realtime HNM] 🔍 Session verification for ${senderAddressString}: ${
                sessionExists ? "EXISTS" : "NOT FOUND"
              }`
            );

            // Retry decryption
            console.log(
              `[Realtime HNM] 🔓 Retrying decryption for ${senderAddressString}...`
            );
            plaintextBuffer = await decryptMessage(
              currentSignalStore,
              currentUserId,
              myCurrentDeviceIdFromContext,
              newMessageData.profile_id,
              newMessageData.device_id || 1,
              ciphertextForDecryption
            );

            console.log(
              `[Realtime HNM] 🎉 Decryption successful for ${senderAddressString} after session build!`
            );
          } catch (recoveryError) {
            console.error(
              `[Realtime HNM] ❌ Error during session recovery for ${senderAddressString}: ${recoveryError.message}`,
              recoveryError
            );

            // If recovery still fails with Bad MAC, this message might be permanently corrupted
            // Log the issue and skip this message
            if (recoveryError.message?.includes("Bad MAC")) {
              console.warn(
                `[Realtime HNM] 🚫 Message from ${senderAddressString} appears to be permanently corrupted (Bad MAC after session rebuild). This can happen when the sender's session was stale during encryption. Skipping message.`
              );
            }
            return;
          }
        } else {
          console.error("[Realtime HNM] Decryption error (other):", e);
          return;
        }
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
