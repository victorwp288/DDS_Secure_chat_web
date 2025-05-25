import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  decryptMessage,
  arrayBufferToString,
  hexToUint8Array,
  bundlesToMap,
} from "../lib/signalUtils";
import {
  SignalProtocolAddress,
  SessionBuilder,
} from "@privacyresearch/libsignal-protocol-typescript";
import { get } from "../lib/backend";
import {
  cacheSentMessage,
  getCachedMessagesForConversation,
} from "../lib/db.js";

async function safeProcessPreKey(store, userId, deviceId, bundle) {
  const addr = new SignalProtocolAddress(userId, deviceId);
  const addrStr = addr.toString();
  const builder = new SessionBuilder(store, addr);

  let trusted = false;
  try {
    trusted = await store.isTrustedIdentity(addrStr, bundle.identityKey);
    if (trusted) {
      console.log(
        `[safeProcessPreKey] Identity for ${addrStr} from bundle is already trusted.`
      );
    } else {
      const existingKey = await store.loadIdentityKey(addrStr);
      if (!existingKey) {
        console.log(
          `[safeProcessPreKey] No identity previously stored for ${addrStr}. Will trust new one from bundle.`
        );
      } else {
        console.log(
          `[safeProcessPreKey] Stored identity for ${addrStr} exists but does not match bundle. Will attempt to save new one.`
        );
      }
    }
  } catch (e) {
    console.warn(
      `[safeProcessPreKey] Error checking trusted identity for ${addrStr}, assuming not trusted: ${e.message}`
    );
    trusted = false;
  }

  if (!trusted) {
    console.log(
      `[safeProcessPreKey] Attempting to save and trust new identity for ${addrStr} from bundle.`
    );
    await store.saveIdentity(addrStr, bundle.identityKey);
    console.log(
      `[safeProcessPreKey] Successfully saved new identity for ${addrStr}.`
    );
  }

  // Check if we already have a working session
  let hasExistingSession = false;
  try {
    const existingSession = await store.loadSession(addrStr);
    hasExistingSession = !!existingSession;
    console.log(
      `[safeProcessPreKey] Session check for ${addrStr}: ${
        hasExistingSession ? "EXISTS" : "NONE"
      }`
    );
  } catch (e) {
    console.log(
      `[safeProcessPreKey] Could not check existing session for ${addrStr}, assuming none: ${e.message}`
    );
    hasExistingSession = false;
  }

  // Only build session if we don't have one
  if (!hasExistingSession) {
    try {
      console.log(
        `[safeProcessPreKey] No existing session for ${addrStr}. Building new session...`
      );
      await builder.processPreKey(bundle);
      console.log(
        `[safeProcessPreKey] New session built successfully for ${addrStr}.`
      );
    } catch (err) {
      if (err.message?.includes("Identity key changed")) {
        console.warn(
          `[safeProcessPreKey] Identity key rotation detected for ${addrStr}. Clearing old session/identity and retrying...`
        );

        try {
          await store.removeSession(addrStr);

          if (typeof store.removeIdentity === "function") {
            await store.removeIdentity(addrStr);
            console.log(
              `[safeProcessPreKey] Removed old identity for ${addrStr}.`
            );
          }

          await store.saveIdentity(addrStr, bundle.identityKey);
          console.log(
            `[safeProcessPreKey] Re-saved new identity for ${addrStr} after rotation.`
          );

          // Create a new builder instance after clearing session
          const newBuilder = new SessionBuilder(store, addr);
          await newBuilder.processPreKey(bundle);
          console.log(
            `[safeProcessPreKey] Session rebuilt successfully for ${addrStr} after identity rotation.`
          );
        } catch (err2) {
          console.error(
            `[safeProcessPreKey] Failed to rebuild session for ${addrStr} after identity rotation: ${err2.message}`
          );
          return false;
        }
      } else {
        console.error(
          `[safeProcessPreKey] Error building session for ${addrStr}: ${err.message}`
        );
        return false;
      }
    }
  } else {
    console.log(`[safeProcessPreKey] Using existing session for ${addrStr}.`);
  }

  return true;
}

export function useMessages(
  selectedConversation,
  currentUser,
  isReady,
  deviceId,
  signalStore,
  profile
) {
  console.log("[useMessages] Hook called with params:", {
    conversationId: selectedConversation?.id,
    userId: currentUser?.id,
    isReady,
    deviceId: deviceId ? `${deviceId} (exists)` : "null",
    profileExists: !!profile,
  });

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Debug: Check conversation status and why useEffect isn't triggering
  console.log("[useMessages] Checking conversation status for useEffect:", {
    conversationStatus: selectedConversation?.my_status,
    expectedStatus: "accepted",
    statusMatch: selectedConversation?.my_status === "accepted",
    isReady,
    deviceId,
  });

  useEffect(() => {
    console.log("[useMessages] useEffect triggered with:", {
      isReady,
      deviceId,
      selectedConversationId: selectedConversation?.id,
      currentUserId: currentUser?.id,
      conversationStatus: selectedConversation?.my_status,
    });

    if (!isReady || !deviceId) {
      console.log(
        "[useMessages] Signal context not ready or deviceId missing, deferring message fetch"
      );
      return;
    }

    if (
      !selectedConversation?.id ||
      !currentUser?.id ||
      selectedConversation.my_status !== "accepted"
    ) {
      console.log("[useMessages] Conversation not valid, clearing messages:", {
        conversationId: selectedConversation?.id,
        userId: currentUser?.id,
        status: selectedConversation?.my_status,
      });
      setMessages([]);
      setLoading(false);
      return;
    }

    const recipientParticipant = selectedConversation.participants.find(
      (p) => p.id !== currentUser.id
    );
    if (!recipientParticipant) {
      setError("Error identifying recipient.");
      setMessages([]);
      setLoading(false);
      return;
    }

    const fetchMessagesAndEnsureSession = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: messagesError } = await supabase
          .from("messages")
          .select(
            `id, body, type, created_at, profile_id, device_id, target_device_id, profiles ( id, full_name, username, avatar_url )`
          )
          .eq("conversation_id", selectedConversation.id)
          .eq("target_device_id", deviceId)
          .order("created_at", { ascending: true });

        console.log("[useMessages] raw rows after filtering:", data);

        if (messagesError) throw messagesError;

        // Debug: Show what messages we're working with
        console.log(
          `[useMessages] Database messages for conversation ${selectedConversation.id}:`,
          data.map((msg) => ({
            id: msg.id,
            profile_id: msg.profile_id,
            device_id: msg.device_id,
            target_device_id: msg.target_device_id,
            type: msg.type,
            created_at: msg.created_at,
            createdAtType: typeof msg.created_at,
            createdAtDate: new Date(msg.created_at).toISOString(),
            isSelfSent: msg.profile_id === currentUser.id,
          }))
        );

        // Also get cached messages for this conversation (self-sent messages)
        console.log(
          `[useMessages] Loading cached messages for conversation ${selectedConversation.id}, user ${currentUser.id}`
        );
        const cachedMessages = await getCachedMessagesForConversation(
          currentUser.id,
          selectedConversation.id
        );
        console.log(
          `[useMessages] Retrieved ${cachedMessages.length} cached messages:`,
          cachedMessages.map((msg) => ({
            id: msg.id,
            content: msg.content.substring(0, 50) + "...",
            timestamp: msg.timestamp,
            timestampType: typeof msg.timestamp,
            timestampDate: new Date(msg.timestamp).toISOString(),
          }))
        );

        // Combine all messages (database + cached) ensuring no duplicates
        const allMessagesMap = new Map();

        // First add database messages
        for (const msg of data) {
          const messageId = msg.id;
          allMessagesMap.set(messageId, {
            source: "database",
            dbMessage: msg,
            timestamp: msg.created_at,
          });
        }

        // Then add/update with cached messages (they take precedence for content)
        for (const cachedMsg of cachedMessages) {
          const messageId = cachedMsg.id;
          if (allMessagesMap.has(messageId)) {
            // Update existing entry with cached content
            const existing = allMessagesMap.get(messageId);
            existing.cachedMessage = cachedMsg;
            existing.hasCachedContent = true;
          } else {
            // Add new cached-only message
            allMessagesMap.set(messageId, {
              source: "cache",
              cachedMessage: cachedMsg,
              timestamp: cachedMsg.timestamp,
              hasCachedContent: true,
            });
          }
        }

        console.log(
          `[useMessages] Combined ${allMessagesMap.size} unique messages from ${data.length} DB + ${cachedMessages.length} cached`
        );

        // Convert map to array and process each message
        const messagesToProcess = Array.from(allMessagesMap.values());

        // Sort by timestamp first
        messagesToProcess.sort((a, b) => {
          const aTime = new Date(a.timestamp);
          const bTime = new Date(b.timestamp);
          return aTime - bTime;
        });

        console.log(
          `[useMessages] Processing ${messagesToProcess.length} messages in chronological order`
        );

        const decryptedMessages = [];

        for (const messageInfo of messagesToProcess) {
          const { dbMessage, cachedMessage, hasCachedContent } = messageInfo;
          const msg = dbMessage || cachedMessage;

          console.log(
            `[useMessages] Processing message ${msg.id.slice(0, 8)}: source=${
              messageInfo.source
            }, hasCached=${hasCachedContent}`
          );

          // Determine if this is a self-sent message
          // For database messages, check profile_id against currentUser.id
          // For cached-only messages, they are always self-sent (we only cache our own messages)
          const isSelfSent = dbMessage
            ? dbMessage.profile_id === currentUser.id
            : true; // Cached-only messages are always self-sent

          console.log(
            `[useMessages] Message ${msg.id.slice(
              0,
              8
            )} isSelfSent: ${isSelfSent} (dbMessage: ${!!dbMessage}, cachedOnly: ${!dbMessage})`
          );

          let processedContent;

          // Use cached content if available
          if (hasCachedContent && cachedMessage?.content) {
            console.log(
              `[useMessages] Using cached content for ${msg.id.slice(0, 8)}`
            );
            processedContent = cachedMessage.content;
          } else if (isSelfSent) {
            // Self-sent message without cache - show placeholder
            console.warn(
              `[useMessages] Self-sent message ${msg.id.slice(
                0,
                8
              )} not in cache`
            );
            processedContent =
              "[Self-sent message not in cache - may be from another session]";
          } else {
            // Received message - decrypt it
            console.log(
              `[useMessages] Decrypting received message ${msg.id.slice(0, 8)}`
            );
            const dbHexString = msg.body;
            let bodyUint8Array;
            try {
              bodyUint8Array = hexToUint8Array(dbHexString);
            } catch (e) {
              console.error(
                `[useMessages] Hex conversion error for msg ${msg.id}:`,
                e
              );
              processedContent = "[DB Body Corrupt]";
              decryptedMessages.push({
                id: msg.id,
                senderId: isSelfSent
                  ? currentUser.id
                  : msg.profiles?.id || msg.profile_id,
                senderName: isSelfSent
                  ? "Me"
                  : msg.profiles?.full_name ||
                    msg.profiles?.username ||
                    "Unknown User",
                senderAvatar: isSelfSent
                  ? profile?.avatar_url
                  : msg.profiles?.avatar_url,
                content: processedContent,
                timestamp: msg.created_at
                  ? new Date(msg.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "",
                isSelf: isSelfSent,
              });
              continue;
            }

            if (bodyUint8Array) {
              const senderDeviceIdNum = Number(msg.device_id || 1);
              const addr = new SignalProtocolAddress(
                msg.profile_id,
                senderDeviceIdNum
              );
              const addrStr = addr.toString();
              try {
                const plaintextBuffer = await decryptMessage(
                  signalStore,
                  currentUser.id,
                  deviceId,
                  msg.profile_id,
                  senderDeviceIdNum,
                  { type: msg.type, body: bodyUint8Array }
                );

                if (plaintextBuffer) {
                  processedContent = arrayBufferToString(plaintextBuffer);
                  await cacheSentMessage(currentUser.id, {
                    id: msg.id,
                    content: processedContent,
                    conversationId: selectedConversation.id,
                    timestamp: msg.created_at,
                  });
                } else {
                  processedContent = "[Decryption Failed - No Buffer]";
                }
              } catch (decryptionError) {
                if (
                  decryptionError.message?.toLowerCase().includes("duplicate")
                ) {
                  console.warn(
                    `[useMessages] Duplicate prekey message for ${addrStr} (msg ID: ${msg.id}), ignoring.`
                  );
                  continue;
                }

                if (
                  decryptionError.message?.includes("Bad MAC") &&
                  msg.type === 3
                ) {
                  console.warn(
                    `[useMessages] Bad MAC for PreKeyWhisperMessage ${addrStr} (msg ID: ${msg.id}). Likely wrong key/device or duplicate. Ignoring.`
                  );
                  processedContent =
                    "[Decryption Failed - Bad MAC / Wrong Key]";
                } else if (
                  decryptionError.message?.includes("Bad MAC") ||
                  decryptionError.message?.includes("No record for device")
                ) {
                  const errorType = decryptionError.message?.includes("Bad MAC")
                    ? "Bad MAC"
                    : "No record for device";
                  console.warn(
                    `[useMessages Recover] ${errorType} detected for ${addrStr} (msg ID: ${msg.id}), attempting session reset and retry...`
                  );
                  try {
                    await signalStore.removeSession(addrStr);
                    console.log(
                      `[useMessages Recover] Removed session for ${addrStr}.`
                    );

                    const peerBundlesData = await get(
                      `/signal/bundles/${msg.profile_id}`
                    );
                    if (!peerBundlesData || !Array.isArray(peerBundlesData)) {
                      throw new Error(
                        `[useMessages Recover] No valid bundles array found for peer ${msg.profile_id}.`
                      );
                    }

                    const bundleMap = bundlesToMap(peerBundlesData);
                    const bundleForDevice = bundleMap.get(senderDeviceIdNum);
                    if (!bundleForDevice) {
                      throw new Error(
                        `[useMessages Recover] Bundle not found for ${addrStr} (Device ID: ${senderDeviceIdNum}) after fetching.`
                      );
                    }

                    console.log(
                      `[useMessages Recover] Fetched bundle for ${addrStr}.`
                    );
                    const sessionResult = await safeProcessPreKey(
                      signalStore,
                      msg.profile_id,
                      senderDeviceIdNum,
                      bundleForDevice
                    );

                    if (!sessionResult) {
                      console.warn(
                        `[useMessages Recover] Failed to rebuild session for ${addrStr}, skipping decryption retry.`
                      );
                      processedContent = "[Session Recovery Failed]";
                    } else {
                      console.log(
                        `[useMessages Recover] Session rebuilt for ${addrStr} via safeProcessPreKey.`
                      );

                      const plaintextBufferRetry = await decryptMessage(
                        signalStore,
                        currentUser.id,
                        deviceId,
                        msg.profile_id,
                        senderDeviceIdNum,
                        { type: msg.type, body: bodyUint8Array }
                      );

                      if (plaintextBufferRetry) {
                        processedContent =
                          arrayBufferToString(plaintextBufferRetry);
                        await cacheSentMessage(currentUser.id, {
                          id: msg.id,
                          content: processedContent,
                          conversationId: selectedConversation.id,
                          timestamp: msg.created_at,
                        });
                        console.log(
                          `[useMessages Recover] Decryption successful for ${addrStr} after retry.`
                        );
                      } else {
                        processedContent =
                          "[Decryption Failed After Retry - No Buffer]";
                        console.warn(
                          `[useMessages Recover] Decryption for ${addrStr} still failed after retry (no buffer).`
                        );
                      }
                    }
                  } catch (recoveryError) {
                    console.error(
                      `[useMessages Recover] Error during recovery for ${addrStr}: ${recoveryError.message}`,
                      recoveryError
                    );
                    processedContent =
                      "[Decryption Error After Recovery Attempt]";
                  }
                } else {
                  console.error(
                    `[useMessages] Decryption error for msg ${msg.id} (not Bad MAC or No record):`,
                    decryptionError
                  );
                  processedContent = "[Decryption Error - Other]";
                }
              }
            } else {
              console.warn(
                `[useMessages] Skipping msg ${msg.id} due to missing bodyUint8Array.`
              );
              processedContent = "[Message Body Missing/Invalid]";
            }
          }

          decryptedMessages.push({
            id: msg.id,
            senderId: isSelfSent
              ? currentUser.id
              : msg.profiles?.id || msg.profile_id,
            senderName: isSelfSent
              ? "Me"
              : msg.profiles?.full_name ||
                msg.profiles?.username ||
                "Unknown User",
            senderAvatar: isSelfSent
              ? profile?.avatar_url
              : msg.profiles?.avatar_url,
            content: processedContent,
            timestamp: (() => {
              // For database messages, use created_at
              if (dbMessage?.created_at) {
                return new Date(dbMessage.created_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });
              }
              // For cached-only messages, use cached timestamp
              if (cachedMessage?.timestamp) {
                return new Date(cachedMessage.timestamp).toLocaleTimeString(
                  [],
                  {
                    hour: "2-digit",
                    minute: "2-digit",
                  }
                );
              }
              // Fallback
              return new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });
            })(),
            isSelf: isSelfSent,
          });
        }

        setMessages(decryptedMessages);
      } catch (err) {
        setError(`Failed to load messages: ${err.message}`);
        setMessages([]);
      } finally {
        setLoading(false);
      }
    };

    fetchMessagesAndEnsureSession();
  }, [selectedConversation?.id, currentUser?.id, isReady, deviceId]);

  // Force re-run by adding a render counter for debugging
  const [renderCount, setRenderCount] = useState(0);
  useEffect(() => {
    setRenderCount((prev) => prev + 1);
  }, [selectedConversation?.id, currentUser?.id, isReady, deviceId]);

  // Debug the dependency values to see why useEffect isn't running
  useEffect(() => {
    console.log("[useMessages] Dependencies changed:", {
      conversationId: selectedConversation?.id,
      userId: currentUser?.id,
      isReady,
      deviceId,
      conversationStatus: selectedConversation?.my_status,
      renderCount,
    });
  }, [
    selectedConversation?.id,
    currentUser?.id,
    isReady,
    deviceId,
    selectedConversation?.my_status,
    renderCount,
  ]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return {
    messages,
    setMessages,
    loading,
    error,
    setError,
    messagesEndRef,
    scrollToBottom,
  };
}
