import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  decryptMessage,
  arrayBufferToString,
  buf2hex,
  hexToUint8Array,
  bundlesToMap,
} from "../lib/signalUtils";
import {
  SignalProtocolAddress,
  SessionBuilder,
} from "@privacyresearch/libsignal-protocol-typescript";
import { get } from "../lib/backend";
import { cacheSentMessage, getCachedMessageContent } from "../lib/db";

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

  try {
    console.log(
      `[safeProcessPreKey] Attempting SessionBuilder.processPreKey for ${addrStr}...`
    );
    await builder.processPreKey(bundle);
    console.log(
      `[safeProcessPreKey] Session built/updated successfully for ${addrStr}.`
    );
  } catch (err) {
    if (err.message?.includes("Identity key changed")) {
      console.warn(
        `[safeProcessPreKey] Genuine identity key rotation detected by processPreKey for ${addrStr}. Clearing old session/identity, re-saving new identity, and retrying processPreKey.`
      );
      await store.removeSession(addrStr);

      if (typeof store.removeIdentity === "function") {
        await store.removeIdentity(addrStr);
        console.log(`[safeProcessPreKey] Removed old identity for ${addrStr}.`);
      } else {
        console.warn(
          `[safeProcessPreKey] store.removeIdentity is not a function. Attempting to overwrite identity for ${addrStr}.`
        );
      }

      await store.saveIdentity(addrStr, bundle.identityKey);
      console.log(
        `[safeProcessPreKey] Re-saved new identity for ${addrStr} due to rotation detected by processPreKey.`
      );

      try {
        console.log(
          `[safeProcessPreKey] Retrying SessionBuilder.processPreKey for ${addrStr} after identity reset...`
        );
        await builder.processPreKey(bundle);
        console.log(
          `[safeProcessPreKey] Session rebuilt successfully for ${addrStr} after genuine key rotation.`
        );
      } catch (err2) {
        console.error(
          `[safeProcessPreKey] Second SessionBuilder.processPreKey FAILED for ${addrStr} even after handling rotation: ${err2.message}. Rethrowing.`,
          err2
        );
        throw err2;
      }
    } else {
      console.error(
        `[safeProcessPreKey] Error during SessionBuilder.processPreKey for ${addrStr} (not identity change): ${err.message}. Rethrowing.`,
        err
      );
      throw err;
    }
  }
}

export function useMessages(
  selectedConversation,
  currentUser,
  isReady,
  deviceId,
  signalStore
) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
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

        const decryptedMessages = [];
        for (const msg of data) {
          if (messages.some((m) => m.id === msg.id)) {
            console.log(
              `[useMessages] Skipping msg ${msg.id} - already processed.`
            );
            continue;
          }

          let processedContent = null;
          const senderProfile = msg.profiles;
          const timestamp = msg.created_at
            ? new Date(msg.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "";
          const isSelfSent = msg.profile_id === currentUser.id;
          const myCurrentDeviceId = deviceId;

          if (
            !isSelfSent &&
            msg.target_device_id !== undefined &&
            msg.target_device_id !== null &&
            msg.target_device_id !== myCurrentDeviceId
          ) {
            continue;
          }

          const cachedContent = await getCachedMessageContent(
            currentUser.id,
            msg.id
          );
          if (cachedContent) {
            processedContent = cachedContent;
          } else {
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
                senderId: senderProfile?.id || msg.profile_id,
                senderName:
                  senderProfile?.full_name ||
                  senderProfile?.username ||
                  "Unknown User",
                senderAvatar: senderProfile?.avatar_url,
                content: processedContent,
                timestamp,
                isSelf: false,
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
                  myCurrentDeviceId,
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
                } else if (decryptionError.message?.includes("Bad MAC")) {
                  console.warn(
                    `[useMessages Recover] Bad MAC detected for ${addrStr} (msg ID: ${msg.id}), attempting session reset and retry...`
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
                    await safeProcessPreKey(
                      signalStore,
                      msg.profile_id,
                      senderDeviceIdNum,
                      bundleForDevice
                    );
                    console.log(
                      `[useMessages Recover] Session rebuilt for ${addrStr} via safeProcessPreKey.`
                    );

                    const plaintextBufferRetry = await decryptMessage(
                      signalStore,
                      currentUser.id,
                      myCurrentDeviceId,
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
                    `[useMessages] Decryption error for msg ${msg.id} (not Bad MAC):`,
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
            senderId: senderProfile?.id || msg.profile_id,
            senderName:
              senderProfile?.full_name ||
              senderProfile?.username ||
              (isSelfSent ? "Me" : "Unknown User"),
            senderAvatar: senderProfile?.avatar_url,
            content: processedContent,
            timestamp,
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
