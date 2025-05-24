import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  encryptMessageOptimized,
  buf2hex,
  bundlesToMap,
} from "../lib/signalUtils";
import {
  SignalProtocolAddress,
  SessionBuilder,
} from "@privacyresearch/libsignal-protocol-typescript";
import { get } from "../lib/backend";
import { cacheSentMessage } from "../lib/db";
import { uploadEncryptedFile } from "../lib/fileUpload";

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

        // ✅ NEW FALLBACK: If still failing after identity reset, forcefully remove ALL related data
        if (err2.message?.includes("Identity key changed")) {
          console.warn(
            `[safeProcessPreKey] FINAL FALLBACK: Forcefully clearing ALL data for ${addrStr} and continuing without encryption for this device.`
          );

          try {
            // Clear absolutely everything
            await store.removeSession(addrStr);
            if (typeof store.removeIdentity === "function") {
              await store.removeIdentity(addrStr);
            }

            // Force save the new identity without any checks
            await store.saveIdentity(addrStr, bundle.identityKey, true); // Force trust

            console.log(
              `[safeProcessPreKey] FINAL FALLBACK: Cleared all data and force-trusted identity for ${addrStr}. Device will be skipped for this message.`
            );

            // Don't throw - let the caller handle this device being skipped
            return false; // Indicate this device should be skipped
          } catch (fallbackError) {
            console.error(
              `[safeProcessPreKey] FINAL FALLBACK failed for ${addrStr}:`,
              fallbackError
            );
          }
        }

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

export function useSendMessage(signalContext, currentUser, profile) {
  const [error, setError] = useState(null);
  const [sendingStatus, setSendingStatus] = useState(null); // 'encrypting', 'sending', 'sent', 'failed'

  const sendMessage = async (
    selectedConversation,
    newMessage,
    selectedFile,
    onOptimisticUpdate
  ) => {
    const { isReady, signalStore, deviceId } = signalContext || {};

    if (!isReady) {
      setError("Secure session not ready.");
      return false;
    }

    const chatInactive =
      selectedConversation &&
      (selectedConversation.my_status !== "accepted" ||
        (!selectedConversation.is_group &&
          selectedConversation.peer_status === "rejected") ||
        (!selectedConversation.is_group &&
          selectedConversation.peer_status === "pending"));
    if (chatInactive) {
      console.warn(
        "[sendMessage] Attempted to send message in an inactive chat. Aborting."
      );
      return false;
    }

    if (
      (!newMessage.trim() && !selectedFile) ||
      !selectedConversation ||
      !currentUser ||
      deviceId === null
    ) {
      return false;
    }

    const conversationId = selectedConversation.id;
    const profileId = currentUser.id;

    // Handle file upload if present
    let fileMetadata = null;
    if (selectedFile) {
      setSendingStatus("uploading");
      try {
        console.log("[SendMessage] Uploading encrypted file...");
        fileMetadata = await uploadEncryptedFile(
          selectedFile,
          conversationId,
          profileId
        );
        console.log("[SendMessage] File uploaded successfully:", fileMetadata);
      } catch (fileError) {
        console.error("[SendMessage] File upload failed:", fileError);
        setError(`File upload failed: ${fileError.message}`);
        setSendingStatus(null);
        return { success: false, error: fileError.message };
      }
    }

    // Prepare message content
    let contentToProcess = newMessage.trim();

    // Create message payload with file metadata if present
    const messagePayload = {
      text: contentToProcess,
      file: fileMetadata
        ? {
            originalName: fileMetadata.originalName,
            originalSize: fileMetadata.originalSize,
            mimeType: fileMetadata.mimeType,
            path: fileMetadata.path,
            encryptionKey: fileMetadata.encryptionKey,
            iv: fileMetadata.iv,
            uploadedAt: fileMetadata.uploadedAt,
          }
        : null,
    };

    // Convert message payload to encrypted content
    const messageContent = JSON.stringify(messagePayload);

    // Create optimistic message for immediate UI update
    const optimisticMessage = {
      id: `temp-${Date.now()}`, // Temporary ID
      senderId: profileId,
      senderName: profile?.full_name || profile?.username || "Me",
      senderAvatar: profile?.avatar_url,
      content: messageContent, // Use JSON content instead of display content
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      isSelf: true,
      status: "sending", // Add status field
      isOptimistic: true, // Flag to identify optimistic messages
    };

    // Immediately update UI with optimistic message
    if (onOptimisticUpdate) {
      onOptimisticUpdate(optimisticMessage);
    }

    let successfullySentToAtLeastOneDevice = false;
    let lastInsertedMessageDataForUI = null;
    setError(null);
    setSendingStatus("encrypting");

    try {
      const peers = selectedConversation.participants.filter(
        (p) => p.id !== profileId
      );
      if (peers.length === 0) {
        throw new Error("No other participants found in this conversation.");
      }

      const plaintextBytes = new TextEncoder().encode(messageContent);

      // Optimize by processing peers in parallel where possible
      const encryptionPromises = [];

      for (const peer of peers) {
        console.log(`[SendMessage] Processing peer: ${peer.id}`);

        // Create a promise for each peer's encryption and sending
        const peerPromise = (async () => {
          try {
            const peerBundlesData = await get(`/signal/bundles/${peer.id}`);

            console.log(`[Signal] 📥 Fetched bundles for peer ${peer.id}:`, {
              count: peerBundlesData?.length || 0,
              deviceIds: Array.isArray(peerBundlesData)
                ? peerBundlesData.map((b) => b.deviceId)
                : "Not an array or undefined",
            });

            if (!peerBundlesData || !Array.isArray(peerBundlesData)) {
              console.warn(
                `No key bundles found for peer ${peer.id}. Skipping.`
              );
              return;
            }

            const bundleMap = bundlesToMap(peerBundlesData);
            if (bundleMap.size === 0) {
              console.warn(
                `No pre-key bundle published for ${peer.id}. Skipping.`
              );
              return;
            }

            // Process devices for this peer
            for (const [peerDeviceId, preKeyBundleForDevice] of bundleMap) {
              const addr = new SignalProtocolAddress(peer.id, peerDeviceId);
              const addrStr = addr.toString();
              console.log(`[SendMessage] Processing device: ${addrStr}`);

              try {
                if (preKeyBundleForDevice.deviceId !== peerDeviceId) {
                  console.error(
                    `[SendMessage SANITY FAIL] Mismatch! Bundle deviceId (${preKeyBundleForDevice.deviceId}) !== loop peerDeviceId (${peerDeviceId}) for peer ${peer.id}. Skipping device.`
                  );
                  continue;
                }

                const identityKeyFromBundle = preKeyBundleForDevice.identityKey;
                const isTrusted = await signalStore.isTrustedIdentity(
                  addrStr,
                  identityKeyFromBundle
                );

                if (!isTrusted) {
                  console.warn(
                    `[SendMessage] Identity key in fetched bundle for ${addrStr} is NOT trusted. This might be a stale bundle. Removing old session/identity and trusting the key from THIS bundle before proceeding.`
                  );
                  await signalStore.removeSession(addrStr);

                  if (typeof signalStore.removeIdentity === "function") {
                    await signalStore.removeIdentity(addrStr);
                    console.log(
                      `[SendMessage] Removed old identity for ${addrStr}.`
                    );
                  } else {
                    console.warn(
                      `[SendMessage] store.removeIdentity not found, cannot explicitly remove old identity for ${addrStr}. Overwriting.`
                    );
                  }

                  await signalStore.saveIdentity(
                    addrStr,
                    identityKeyFromBundle
                  );
                  console.log(
                    `[SendMessage] Saved new identity for ${addrStr} from bundle.`
                  );
                }

                console.log(
                  `[SendMessage] Ensuring outbound session for ${addrStr} via ensureOutboundSession...`
                );
                const sessionResult = await safeProcessPreKey(
                  signalStore,
                  peer.id,
                  peerDeviceId,
                  preKeyBundleForDevice
                );

                // Check if device should be skipped due to persistent identity issues
                if (sessionResult === false) {
                  console.warn(
                    `[SendMessage] Device ${addrStr} skipped due to persistent identity key issues.`
                  );
                  continue;
                }

                console.log(
                  `[SendMessage] Outbound session ensured/handled for ${addrStr}. Proceeding to encrypt.`
                );

                let ct;
                try {
                  console.log(
                    `[SendMessage] Attempting encryptMessage for ${addrStr} (Attempt 1)...`
                  );
                  ct = await encryptMessageOptimized(
                    signalStore,
                    peer.id,
                    peerDeviceId,
                    plaintextBytes.buffer
                  );
                } catch (e) {
                  if (String(e).includes("No record for")) {
                    console.warn(
                      `[SendMessage] Caught 'No record for ${addrStr}' error on encrypt (Attempt 1). Removing session, ensuring session again, and retrying...`,
                      e
                    );
                    await signalStore.removeSession(addrStr);
                    try {
                      const retryResult = await safeProcessPreKey(
                        signalStore,
                        peer.id,
                        peerDeviceId,
                        preKeyBundleForDevice
                      );

                      // Check if device should be skipped on retry
                      if (retryResult === false) {
                        console.warn(
                          `[SendMessage] Device ${addrStr} skipped on retry due to persistent identity key issues.`
                        );
                        ct = null;
                      } else {
                        console.log(
                          `[SendMessage] Session rebuild successful for ${addrStr} after 'No record' error. Retrying encrypt...`
                        );
                        ct = await encryptMessageOptimized(
                          signalStore,
                          peer.id,
                          peerDeviceId,
                          plaintextBytes.buffer
                        );
                        console.log(
                          `[SendMessage] Encrypt successful for ${addrStr} (Attempt 2).`
                        );
                      }
                    } catch (rebuildOrRetryError) {
                      console.error(
                        `[SendMessage] Error during session rebuild or encrypt retry for ${addrStr}:`,
                        rebuildOrRetryError
                      );
                      ct = null;
                    }
                  } else {
                    console.error(
                      `[SendMessage] Non-'No record' encryption error for ${addrStr}:`,
                      e
                    );
                    throw e;
                  }
                }

                if (!ct) {
                  console.warn(
                    `[SendMessage] Ciphertext (ct) is undefined for ${addrStr} after encryptMessage, though no error was thrown. Skipping DB insert.`
                  );
                  continue;
                }

                const bodyUint8Array = Uint8Array.from(ct.body, (c) =>
                  c.charCodeAt(0)
                );
                const pgByteaLiteral = `\\x${buf2hex(bodyUint8Array)}`;

                const messageToInsert = {
                  conversation_id: conversationId,
                  profile_id: profileId,
                  type: ct.type,
                  body: pgByteaLiteral,
                  device_id: deviceId,
                  target_device_id: peerDeviceId,
                };

                setSendingStatus("sending");

                let insertResult;
                try {
                  insertResult = await supabase
                    .from("messages")
                    .insert(messageToInsert)
                    .select();
                  console.log(
                    `[SendMessage] RAW INSERT SUCCEEDED for ${addrStr}.`
                  );
                } catch (rawInsertError) {
                  console.error(
                    `[SendMessage] RAW INSERT FAILED for ${addrStr} (exception during await):`,
                    rawInsertError
                  );
                  setError(
                    `DEBUG: Raw insert failed for ${addrStr}: ${rawInsertError.message}`
                  );
                  continue;
                }

                const { data: insertedData, error: dbErr } = insertResult || {
                  data: null,
                  error: null,
                };

                if (dbErr) {
                  console.error(
                    `[SendMessage] DB insert failed for ${addrStr} (from insertResult.error):`,
                    dbErr
                  );
                  continue;
                }

                if (insertedData && insertedData.length > 0) {
                  lastInsertedMessageDataForUI = insertedData[0];
                  successfullySentToAtLeastOneDevice = true;
                  console.log(`[SendMessage] Successfully sent to ${addrStr}.`);
                } else {
                  console.warn(
                    `[SendMessage] DB insert for ${addrStr} reported success but returned no data.`
                  );
                }
              } catch (deviceProcessingError) {
                console.error(
                  `[SendMessage] Error processing device ${addrStr}: ${deviceProcessingError.message}. Skipping device.`,
                  deviceProcessingError
                );
                continue;
              }
            }
          } catch (peerProcessingError) {
            console.error(
              `[SendMessage] Error processing peer ${peer.id}: ${peerProcessingError.message}. Skipping peer.`,
              peerProcessingError
            );
          }
        })();

        encryptionPromises.push(peerPromise);
      }

      // Wait for all peer processing to complete
      await Promise.allSettled(encryptionPromises);

      if (successfullySentToAtLeastOneDevice && lastInsertedMessageDataForUI) {
        // ❌ REMOVED: Problematic self-copy mechanism that caused "Tried to decrypt on a sending chain" errors
        // The self-copies were being encrypted to self and then couldn't be decrypted on page reload
        // We now rely only on local cache (cacheSentMessage) for your own messages

        const finalMessage = {
          id: lastInsertedMessageDataForUI.id,
          senderId: profileId,
          senderName: profile?.full_name || profile?.username || "Me",
          senderAvatar: profile?.avatar_url,
          content: messageContent, // Use JSON content instead of display content
          timestamp: new Date(
            lastInsertedMessageDataForUI.created_at
          ).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          isSelf: true,
          status: "sent", // Mark as sent
        };

        // ✅ Cache sent message locally in plaintext (no encryption issues)
        // Store raw timestamp in cache for proper date handling on reload
        console.log(
          `[SendMessage] Caching sent message with ID ${lastInsertedMessageDataForUI.id} for user ${profileId}:`,
          {
            id: lastInsertedMessageDataForUI.id,
            content: messageContent,
            conversationId,
            timestamp: lastInsertedMessageDataForUI.created_at,
          }
        );
        await cacheSentMessage(profileId, {
          ...finalMessage,
          conversationId,
          timestamp: lastInsertedMessageDataForUI.created_at, // Store raw timestamp for cache
        });

        setError(null);
        setSendingStatus("sent");
        return {
          success: true,
          message: finalMessage,
          optimisticId: optimisticMessage.id, // Return optimistic ID for replacement
        };
      } else {
        throw new Error("Failed to send message to any recipient device.");
      }
    } catch (err) {
      console.error("[SendMessage] Overall error:", err);
      setError(`Failed to send message: ${err.message}`);
      setSendingStatus("failed");
      return {
        success: false,
        error: err.message,
        optimisticId: optimisticMessage.id, // Return optimistic ID for error handling
      };
    }
  };

  return {
    sendMessage,
    error,
    setError,
    sendingStatus,
    setSendingStatus,
  };
}
