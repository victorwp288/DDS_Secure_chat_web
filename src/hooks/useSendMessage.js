import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  encryptMessageOptimized,
  buf2hex,
  bundlesToMap,
} from "../lib/signalUtils";
import { SignalProtocolAddress } from "@privacyresearch/libsignal-protocol-typescript";
import { get } from "../lib/backend";
import { cacheSentMessage } from "../lib/db";

async function safeProcessPreKey(store, userId, deviceId, bundle) {
  const addr = new SignalProtocolAddress(userId, deviceId);
  const addrStr = addr.toString();
  const builder = new (
    await import("@privacyresearch/libsignal-protocol-typescript")
  ).SessionBuilder(store, addr);

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

    let contentToProcess = newMessage.trim();
    if (selectedFile) {
      const fileMarker = `[File] ${selectedFile.name}`;
      if (contentToProcess) {
        contentToProcess = `${contentToProcess} ${fileMarker}`;
      } else {
        contentToProcess = fileMarker;
      }
    }

    // Create optimistic message for immediate UI update
    const optimisticMessage = {
      id: `temp-${Date.now()}`, // Temporary ID
      senderId: profileId,
      senderName: profile?.full_name || profile?.username || "Me",
      senderAvatar: profile?.avatar_url,
      content: contentToProcess,
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

      const plaintextBytes = new TextEncoder().encode(contentToProcess);

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
                await safeProcessPreKey(
                  signalStore,
                  peer.id,
                  peerDeviceId,
                  preKeyBundleForDevice
                );
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
                      await safeProcessPreKey(
                        signalStore,
                        peer.id,
                        peerDeviceId,
                        preKeyBundleForDevice
                      );
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
        // Handle self-copies asynchronously in the background
        const selfCopyPromise = (async () => {
          try {
            const myBundlesData = await get(`/signal/bundles/${profileId}`);
            if (myBundlesData && Array.isArray(myBundlesData)) {
              const myBundleMap = bundlesToMap(myBundlesData);
              for (const [selfDeviceId] of myBundleMap) {
                let ctSelf;
                try {
                  ctSelf = await encryptMessageOptimized(
                    signalStore,
                    profileId,
                    selfDeviceId,
                    plaintextBytes.buffer
                  );
                } catch (e) {
                  if (String(e).includes("No record for")) {
                    await signalStore.removeSession(
                      new SignalProtocolAddress(
                        profileId,
                        selfDeviceId
                      ).toString()
                    );
                    try {
                      await safeProcessPreKey(
                        signalStore,
                        profileId,
                        selfDeviceId,
                        myBundleMap.get(selfDeviceId)
                      );
                      ctSelf = await encryptMessageOptimized(
                        signalStore,
                        profileId,
                        selfDeviceId,
                        plaintextBytes.buffer
                      );
                    } catch (retryErr) {
                      console.error(
                        `[SendMessage] Self-copy session retry failed for device ${selfDeviceId}:`,
                        retryErr
                      );
                      continue;
                    }
                  } else {
                    console.error(
                      `[SendMessage] encryptMessage failed for self-device ${selfDeviceId}:`,
                      e
                    );
                    continue;
                  }
                }

                const selfBody = `\\x${buf2hex(
                  Uint8Array.from(ctSelf.body, (c) => c.charCodeAt(0))
                )}`;
                await supabase.from("messages").insert({
                  conversation_id: conversationId,
                  profile_id: profileId,
                  device_id: selfDeviceId,
                  target_device_id: selfDeviceId,
                  type: ctSelf.type,
                  body: selfBody,
                });
              }
            }
          } catch (err) {
            console.error(
              "[SendMessage] Failed to insert multi-device encrypted self-copy:",
              err
            );
          }
        })();

        // Don't wait for self-copies, run in background
        selfCopyPromise.catch(console.error);

        const finalMessage = {
          id: lastInsertedMessageDataForUI.id,
          senderId: profileId,
          senderName: profile?.full_name || profile?.username || "Me",
          senderAvatar: profile?.avatar_url,
          content: contentToProcess,
          timestamp: new Date(
            lastInsertedMessageDataForUI.created_at
          ).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          isSelf: true,
          status: "sent", // Mark as sent
        };

        await cacheSentMessage(profileId, {
          ...finalMessage,
          conversationId,
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
