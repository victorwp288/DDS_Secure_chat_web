import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import EmojiPicker from "emoji-picker-react";

import {
  ArrowLeft,
  LogOut,
  Menu,
  MessageSquare,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Send,
  Settings,
  User,
  Users,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMobile } from "../hooks/use-mobile";
import { supabase } from "../lib/supabaseClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import NewChatModal from "../components/NewChatModal";
import NewGroupModal from "../components/NewGroupModal";
import { useSignal } from "../lib/signalContext.jsx";
import {
  encryptMessage,
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
import { get, post } from "../lib/backend";
import { cacheSentMessage, getCachedMessageContent } from "../lib/db";

// Helper function to convert PostgreSQL bytea hex escape format ('\\x...') to ArrayBuffer
/* REMOVED - Use hexToUint8Array from signalUtils instead
function hexStringToArrayBuffer(hexString) {
  // Check if the string starts with the literal '\x'
  if (!hexString || !hexString.startsWith("\\x")) {
    // Note: In JS string literals, '\\x' represents the two characters \ and x
    console.warn(
      "[hexStringToArrayBuffer] Invalid or non-hex string format received:",
      hexString
    );
    return null;
  }
  // Remove the leading '\x' prefix (2 characters)
  const hex = hexString.substring(2);

  // Validate remaining hex string length
  if (hex.length % 2 !== 0) {
    console.error(
      "[hexStringToArrayBuffer] Hex string (after prefix removal) must have an even number of digits:",
      hex
    );
    return null;
  }

  // Convert hex pairs to bytes
  const byteArray = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.substring(i, i + 2), 16);
    if (isNaN(byte)) {
      // Add check for invalid hex characters
      console.error(
        `[hexStringToArrayBuffer] Invalid hex character pair found: ${hex.substring(
          i,
          i + 2
        )}`
      );
      return null;
    }
    byteArray[i / 2] = byte;
  }
  return byteArray.buffer; // Return the underlying ArrayBuffer
}
*/

// Helper function to convert ArrayBuffer or ArrayBufferView to PostgreSQL bytea hex format ('\\x...')
/* REMOVED - Use binaryStringToHex from signalUtils instead
function arrayBufferToHex(input) {
  console.log("[arrayBufferToHex] Received input:", input);

  // Accept both kinds transparently
  // 🔧 NEW – accept the raw binary string returned by SessionCipher.encrypt
  let view;
  if (typeof input === "string") {
    // Each charCode is already 0-255, so this is loss-less
    console.log(
      "[arrayBufferToHex] Input is string, attempting charCode conversion."
    );
    view = Uint8Array.from(input, (ch) => ch.charCodeAt(0));
  } else if (input instanceof ArrayBuffer) {
    console.log("[arrayBufferToHex] Input is ArrayBuffer.");
    view = new Uint8Array(input);
  } else if (ArrayBuffer.isView(input)) {
    console.log("[arrayBufferToHex] Input is ArrayBufferView.");
    view = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  } else {
    console.error("[arrayBufferToHex] Unsupported input:", input);
    return null;
  }

  if (!view) {
    // This case should technically not be reachable if the checks above are exhaustive
    console.error(
      "[arrayBufferToHex] Failed to create Uint8Array view from input.",
      input
    );
    return null;
  }

  if (!view.byteLength) {
    console.warn("[arrayBufferToHex] Received empty buffer/view.");
    return "\\x";
  }

  try {
    // More modern/concise hex conversion
    const hex = [...view].map((b) => b.toString(16).padStart(2, "0")).join("");
    console.log("[arrayBufferToHex] Joined hex string (no prefix):", hex);

    const finalHexString = "\\x" + hex;
    console.log(
      "[arrayBufferToHex] Final hex string with prefix:",
      finalHexString
    );
    return finalHexString;
  } catch (error) {
    console.error(
      "[arrayBufferToHex] Error during conversion:",
      error,
      "Input:",
      input
    );
    return null; // Return null on error
  }
}
*/

// Helper function to convert ArrayBuffer to Base64 string
// eslint-disable-next-line no-unused-vars
function arrayBufferToBase64(buffer) {
  if (!buffer) {
    console.warn("[arrayBufferToBase64] Received null input.");
    return null;
  }
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// --- NEW HELPER FUNCTION --- START ---
/**
 * Try to build a Signal session, and if we get "Identity key changed",
 * reset that peer's session+identity and then build again.
 */
async function safeProcessPreKey(store, userId, deviceId, bundle) {
  const addr = new SignalProtocolAddress(userId, deviceId);
  const addrStr = addr.toString();
  const builder = new SessionBuilder(store, addr);

  // 1) Check whether we've already saved & trusted this identity:
  let trusted = false;
  try {
    // Check if the specific identityKey from the bundle is already trusted for this address.
    // This also implicitly checks if an identity exists for addrStr.
    trusted = await store.isTrustedIdentity(addrStr, bundle.identityKey);
    if (trusted) {
      console.log(
        `[safeProcessPreKey] Identity for ${addrStr} from bundle is already trusted.`
      );
    } else {
      // If not trusted, it could be a new peer, or a peer whose key changed AND our stored one is stale.
      // We might also have no identity at all for them.
      const existingKey = await store.loadIdentityKey(addrStr); // Check if *any* key is stored
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
    // isTrustedIdentity or loadIdentityKey might throw if the store is in an unexpected state or addrStr is totally new
    // (though typically they return false/null if not found).
    // We assume not trusted if any error occurs here, and proceed to save.
    console.warn(
      `[safeProcessPreKey] Error checking trusted identity for ${addrStr}, assuming not trusted: ${e.message}`
    );
    trusted = false;
  }

  if (!trusted) {
    // If not trusted (either because it's new, different, or check failed), save it.
    // This is the crucial step to prevent false "Identity key changed" if no identity was there before.
    console.log(
      `[safeProcessPreKey] Attempting to save and trust new identity for ${addrStr} from bundle.`
    );
    await store.saveIdentity(addrStr, bundle.identityKey);
    console.log(
      `[safeProcessPreKey] Successfully saved new identity for ${addrStr}.`
    );
  }

  // 2) Now build the session
  try {
    console.log(
      `[safeProcessPreKey] Attempting SessionBuilder.processPreKey for ${addrStr}...`
    );
    await builder.processPreKey(bundle);
    console.log(
      `[safeProcessPreKey] Session built/updated successfully for ${addrStr}.`
    );
  } catch (err) {
    // If processPreKey *still* throws "Identity key changed" here,
    // it means a genuine rotation happened and the key we just saved (if we did)
    // or the key that was previously trusted, is now outdated by this very bundle.
    if (err.message?.includes("Identity key changed")) {
      console.warn(
        `[safeProcessPreKey] Genuine identity key rotation detected by processPreKey for ${addrStr}. Clearing old session/identity, re-saving new identity, and retrying processPreKey.`
      );
      await store.removeSession(addrStr); // Clear potentially stale session with the very old identity

      // Explicitly remove the old identity before saving the new one
      if (typeof store.removeIdentity === "function") {
        await store.removeIdentity(addrStr);
        console.log(`[safeProcessPreKey] Removed old identity for ${addrStr}.`);
      } else {
        // If store doesn't have a direct removeIdentity, this situation is harder to recover from cleanly
        // without knowing the store's internal structure. For now, we'll log and proceed to save,
        // hoping saveIdentity overwrites correctly. This might be a point of failure if not.
        console.warn(
          `[safeProcessPreKey] store.removeIdentity is not a function. Attempting to overwrite identity for ${addrStr}.`
        );
      }

      await store.saveIdentity(addrStr, bundle.identityKey); // Re-save/ensure the identity from THIS bundle is current
      console.log(
        `[safeProcessPreKey] Re-saved new identity for ${addrStr} due to rotation detected by processPreKey.`
      );

      // Retry processPreKey with the newly trusted identity
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
      // For other errors during processPreKey (e.g., invalid bundle format)
      console.error(
        `[safeProcessPreKey] Error during SessionBuilder.processPreKey for ${addrStr} (not identity change): ${err.message}. Rethrowing.`,
        err
      );
      throw err;
    }
  }
}
// --- NEW HELPER FUNCTION --- END ---

export default function ChatPage() {
  console.log("--- ChatPage Component Rendering ---");

  const [currentUser, setCurrentUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState(null);
  const [messageSubscription, setMessageSubscription] = useState(null);
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [isNewGroupModalOpen, setIsNewGroupModalOpen] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef();

  // New states for button loading
  const [isRenamingGroup, setIsRenamingGroup] = useState(false);
  const [isLeavingGroup, setIsLeavingGroup] = useState(false);

  const isMobile = useMobile();
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);
  const sig = useSignal();
  // --- Deconstruct earlier to use primitives in dependencies --- START ---
  const { isReady, signalStore, deviceId, initializationError } = sig || {};
  // --- Deconstruct earlier to use primitives in dependencies --- END ---
  const currentUserRef = useRef(currentUser);
  const selectedConversationRef = useRef(selectedConversation);

  console.log("[render] messages state length =", messages.length, messages);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // 1. Get current user and profile
  useEffect(() => {
    if (!sig) {
      console.log("[Effect 1] Signal context hook not ready, deferring.");
      return;
    }
    const fetchUserAndProfile = async () => {
      console.log("[Effect 1] Running fetchUserAndProfile...");
      setLoadingConversations(true);
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError) {
        console.error("Error getting session:", sessionError);
        setError("Failed to load user session.");
        setLoadingConversations(false);
        return;
      }
      if (!session?.user) {
        console.log("No user session found, redirecting to login.");
        navigate("/login");
        return;
      }
      setCurrentUser(session.user);
      if (session?.user && signalStore) {
        try {
          console.log(
            "[Effect 1] Initializing Signal protocol via context store for",
            session.user.id
          );
        } catch (initError) {
          console.error(
            "[Effect 1] Failed to initialize Signal protocol:",
            initError
          );
          setError(
            `Failed to initialize secure session keys: ${initError.message}`
          );
          setLoadingConversations(false);
          return;
        }
      }
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url, status")
        .eq("id", session.user.id)
        .single();
      if (profileError && profileError.code !== "PGRST116") {
        console.error("Error fetching profile:", profileError);
        setError(`Failed to load user profile: ${profileError.message}`);
      } else if (!profileData) {
        console.warn("[Effect 1] Profile not found for user:", session.user.id);
        setError("User profile not found. Please complete profile setup.");
      } else {
        setProfile(profileData);
        setError(null);
      }
    };
    fetchUserAndProfile();
  }, [navigate, sig]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation]);

  // 2. Fetch conversations once user profile is loaded
  useEffect(() => {
    if (!profile?.id) {
      if (!loadingConversations && !profile) setLoadingConversations(false);
      return;
    }
    const fetchConversations = async () => {
      setLoadingConversations(true);
      try {
        const { data: participantData, error: participantError } =
          await supabase
            .from("conversation_participants")
            .select("conversation_id")
            .eq("profile_id", profile.id);
        if (participantError) throw participantError;
        const conversationIds = participantData.map((p) => p.conversation_id);
        if (conversationIds.length === 0) {
          setConversations([]);
          setLoadingConversations(false);
          return;
        }
        const { data: convData, error: convError } = await supabase
          .from("conversations")
          .select(
            `id, created_at, is_group, group_name, group_avatar_url, conversation_participants(profile_id, profiles(id, username, full_name, avatar_url, status))`
          )
          .in("id", conversationIds);
        if (convError) throw convError;
        const formattedConversations = convData.map((conv) => {
          const participants = conv.conversation_participants.map(
            (p) => p.profiles
          );
          const otherParticipant =
            participants.find((p) => p.id !== profile.id) || participants[0];
          const isGroup = conv.is_group;
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
          };
        });
        setConversations(formattedConversations);
        if (!selectedConversation && formattedConversations.length > 0) {
          setSelectedConversation(formattedConversations[0]);
        } else if (formattedConversations.length === 0) {
          setSelectedConversation(null);
        }
      } catch (fetchError) {
        console.error("Error fetching conversations:", fetchError);
        setError("Failed to load conversations.");
      } finally {
        setLoadingConversations(false);
      }
    };
    fetchConversations();
  }, [profile?.id, selectedConversation]); // Keep selectedConversation here to re-evaluate if it changes elsewhere

  // 3. Fetch messages when selectedConversation changes
  useEffect(() => {
    // --- MODIFIED: Remove setMessages([]) from guard --- START ---
    if (!isReady || !deviceId) {
      console.log(
        "[Effect 3] Signal context not ready or deviceId missing, deferring message fetch (but not clearing list)." // Updated log
      );
      // setMessages([]); // <-- REMOVED THIS LINE
      return;
    }
    // --- MODIFIED: Remove setMessages([]) from guard --- END ---
    // const { signalStore, deviceId } = sig; // Already destructured above
    if (!selectedConversation?.id || !currentUser?.id) {
      setMessages([]); // Keep clearing if conversation/user is invalid
      return;
    }
    const recipientParticipant = selectedConversation.participants.find(
      (p) => p.id !== currentUser.id
    );
    if (!recipientParticipant) {
      setError("Error identifying recipient.");
      setMessages([]);
      setLoadingMessages(false);
      return;
    }
    const fetchMessagesAndEnsureSession = async () => {
      setLoadingMessages(true);
      setError(null);
      try {
        // --- FIX 2: Targeted Message Fetching ---
        const { data, error: messagesError } = await supabase
          .from("messages")
          .select(
            `id, body, type, created_at, profile_id, device_id, target_device_id, profiles ( id, full_name, username, avatar_url )`
          )
          .eq("conversation_id", selectedConversation.id)
          // --- MODIFIED: Fetch ONLY messages targeting THIS device --- START ---
          // Remove the .or() and filter strictly by target_device_id
          .eq("target_device_id", deviceId)
          // --- MODIFIED: Fetch ONLY messages targeting THIS device --- END ---
          .order("created_at", { ascending: true });
        console.log("[FetchMessages] raw rows after filtering:", data);
        // --- END FIX 2 ---

        if (messagesError) throw messagesError;
        const decryptedMessages = [];
        for (const msg of data) {
          // --- FIX: Deduplicate messages before decrypting --- START ---
          // Check if this message ID already exists in the current state
          // Use a check against the `messages` state directly before processing.
          // Note: This assumes `messages` state reflects messages successfully processed so far.
          if (messages.some((m) => m.id === msg.id)) {
            console.log(
              `[FetchMessages] Skipping msg ${msg.id} - already processed.`
            );
            continue; // Skip to the next message
          }
          // Alternative check: Check against the temporary `decryptedMessages` array being built,
          // if multiple rows for the same logical message might exist in `data` (less likely with correct filtering)
          // if (decryptedMessages.some(dm => dm.id === msg.id)) {
          //   console.log(`[FetchMessages] Skipping msg ${msg.id} - duplicate row in fetch results.`);
          //   continue;
          // }
          // --- FIX: Deduplicate messages before decrypting --- END ---

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
          // --- Namespacing: Pass userId to getCachedMessageContent --- START ---
          const cachedContent = await getCachedMessageContent(
            currentUser.id,
            msg.id
          );
          // --- Namespacing: Pass userId to getCachedMessageContent --- END ---
          if (cachedContent) {
            processedContent = cachedContent;
          } else {
            // --- MODIFIED: Handle plain-text sender copies --- START ---
            if (isSelfSent) {
              if (msg.type === 1) {
                // This is the plain-text sender copy
                processedContent = msg.body;
              } else {
                // Unexpected uncached self-sent message (shouldn't happen with current logic)
                processedContent = "[Self, Uncached Encrypted - Error]";
              }
            } else {
              // --- MODIFIED: Handle plain-text sender copies --- END ---
              // --- FIX: Do NOT preemptively build session for type 3 (PreKeyWhisper) messages ---
              const dbHexString = msg.body;
              let bodyUint8Array;
              try {
                bodyUint8Array = hexToUint8Array(dbHexString);
              } catch (e) {
                console.error(
                  `[Effect 3] Hex conversion error for msg ${msg.id}:`,
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
                  // For type 3, let libsignal handle session creation on decrypt
                  const plaintextBuffer = await decryptMessage(
                    signalStore,
                    currentUser.id, // myUserId
                    myCurrentDeviceId, // myDeviceId
                    msg.profile_id, // theirUserId
                    senderDeviceIdNum, // theirDeviceId
                    { type: msg.type, body: bodyUint8Array }
                  );
                  if (plaintextBuffer) {
                    processedContent = arrayBufferToString(plaintextBuffer);
                    // --- Namespacing: Pass userId to cacheSentMessage --- START ---
                    await cacheSentMessage(currentUser.id, {
                      id: msg.id,
                      content: processedContent,
                      conversationId: selectedConversation.id,
                      timestamp: msg.created_at,
                    });
                    // --- Namespacing: Pass userId to cacheSentMessage --- END ---
                  } else {
                    processedContent = "[Decryption Failed - No Buffer]";
                  }
                } catch (decryptionError) {
                  // Handle duplicate prekey decryption gracefully
                  if (
                    decryptionError.message?.toLowerCase().includes("duplicate")
                  ) {
                    console.warn(
                      `[FetchMessages] Duplicate prekey message for ${addrStr} (msg ID: ${msg.id}), ignoring.`
                    );
                    continue;
                  }
                  // --- FIX 3: Improved Bad MAC Handling ---
                  // Check if it's a BadMacError specifically for PreKey messages (type 3)
                  // Note: You might need to adjust how BadMacError is detected depending on libsignal's exact error object structure
                  if (
                    decryptionError.message?.includes("Bad MAC") &&
                    msg.type === 3
                  ) {
                    console.warn(
                      `[FetchMessages] Bad MAC for PreKeyWhisperMessage ${addrStr} (msg ID: ${msg.id}). Likely wrong key/device or duplicate. Ignoring.`
                    );
                    // Instead of full recovery, just mark as failed/skip
                    processedContent =
                      "[Decryption Failed - Bad MAC / Wrong Key]";
                    // Or simply 'continue;' if you don't want to show anything
                  }
                  // --- END FIX 3 ---
                  // Keep recovery for other errors, but maybe only if session exists?
                  // Example: Keep recovery attempt for other potential errors if a session WAS expected
                  // The original "Bad MAC" recovery logic is now conditional
                  else if (decryptionError.message?.includes("Bad MAC")) {
                    // This block handles Bad MAC for non-PreKey messages (less common, might indicate actual corruption/ratchet issue)
                    // Or it handles the case where we decided *not* to simply ignore the PreKey Bad MAC above
                    console.warn(
                      `[FetchMessages Recover] Bad MAC detected for ${addrStr} (msg ID: ${msg.id}), attempting session reset and retry (Original Logic)...`
                    );
                    try {
                      await signalStore.removeSession(addrStr);
                      console.log(
                        `[FetchMessages Recover] Removed session for ${addrStr}.`
                      );
                      const peerBundlesData = await get(
                        `/signal/bundles/${msg.profile_id}`
                      );
                      if (!peerBundlesData || !Array.isArray(peerBundlesData)) {
                        throw new Error(
                          `[FetchMessages Recover] No valid bundles array found for peer ${msg.profile_id}.`
                        );
                      }
                      const bundleMap = bundlesToMap(peerBundlesData);
                      const bundleForDevice = bundleMap.get(senderDeviceIdNum);
                      if (!bundleForDevice) {
                        throw new Error(
                          `[FetchMessages Recover] Bundle not found for ${addrStr} (Device ID: ${senderDeviceIdNum}) after fetching.`
                        );
                      }
                      console.log(
                        `[FetchMessages Recover] Fetched bundle for ${addrStr}.`
                      );
                      await safeProcessPreKey(
                        signalStore,
                        msg.profile_id,
                        senderDeviceIdNum,
                        bundleForDevice
                      );
                      console.log(
                        `[FetchMessages Recover] Session rebuilt for ${addrStr} via safeProcessPreKey.`
                      );
                      const plaintextBufferRetry = await decryptMessage(
                        signalStore,
                        currentUser.id, // myUserId
                        myCurrentDeviceId, // myDeviceId
                        msg.profile_id, // theirUserId
                        senderDeviceIdNum, // theirDeviceId
                        { type: msg.type, body: bodyUint8Array }
                      );
                      if (plaintextBufferRetry) {
                        processedContent =
                          arrayBufferToString(plaintextBufferRetry);
                        // --- Namespacing: Pass userId to cacheSentMessage --- START ---
                        await cacheSentMessage(currentUser.id, {
                          id: msg.id,
                          content: processedContent, // --- FIX 4: Ensure caching after successful retry ---
                          conversationId: selectedConversation.id,
                          timestamp: msg.created_at,
                        });
                        // --- Namespacing: Pass userId to cacheSentMessage --- END ---
                        console.log(
                          `[FetchMessages Recover] Decryption successful for ${addrStr} after retry.`
                        );
                      } else {
                        processedContent =
                          "[Decryption Failed After Retry - No Buffer]";
                        console.warn(
                          `[FetchMessages Recover] Decryption for ${addrStr} still failed after retry (no buffer).`
                        );
                      }
                    } catch (recoveryError) {
                      console.error(
                        `[FetchMessages Recover] Error during recovery for ${addrStr}: ${recoveryError.message}`,
                        recoveryError
                      );
                      processedContent =
                        "[Decryption Error After Recovery Attempt]";
                    }
                  } else {
                    // For errors other than "Bad MAC"
                    console.error(
                      `[Effect 3] Decryption error for msg ${msg.id} (not Bad MAC):`,
                      decryptionError
                    );
                    processedContent = "[Decryption Error - Other]";
                  }
                }
              } else {
                // This case handles when bodyUint8Array is null/undefined
                console.warn(
                  `[Effect 3] Skipping msg ${msg.id} due to missing bodyUint8Array.`
                );
                // Optionally add a placeholder message or just skip
                processedContent = "[Message Body Missing/Invalid]";
                // We need to push something to maintain message order, or `continue;` to skip entirely.
                // Let's push the error message for now.
              }
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
        setLoadingMessages(false);
      }
    };
    fetchMessagesAndEnsureSession();
    // --- MODIFIED: Use primitive deviceId in dependencies, remove sig --- START ---
  }, [selectedConversation?.id, currentUser?.id, isReady, deviceId]);
  // --- MODIFIED: Use primitive deviceId in dependencies, remove sig --- END ---

  // 4. Scroll to bottom
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Define handleNewMessage in the component scope
  const handleNewMessage = async (payload) => {
    // Use refs for currentUser and selectedConversation to get latest values
    const currentUserService = currentUserRef.current;
    const selectedConversationService = selectedConversationRef.current;

    if (!isReady || !sig) {
      console.warn(
        "[Realtime HNM] Context not ready or sig not available. Skipping message."
      );
      return;
    }
    const {
      signalStore: currentSignalStore,
      deviceId: myCurrentDeviceIdFromContext,
    } = sig;
    const currentUserId = currentUserService?.id;

    if (!currentUserId) {
      console.warn(
        "[Realtime HNM] currentUser.id is not available. Skipping message."
      );
      return;
    }

    const { new: newMessageData } = payload;

    if (
      !selectedConversationService ||
      newMessageData.conversation_id !== selectedConversationService.id
    ) {
      console.log(
        "[Realtime HNM] Message for different or no selected conversation. Skipping."
      );
      return;
    }

    if (newMessageData.profile_id === currentUserId) {
      console.log("[Realtime HNM] Message is from self. Skipping.");
      return;
    }

    // Log and compare device IDs, coercing to string for comparison
    console.log(
      `[Realtime HNM] Comparing device IDs: incoming.target_device_id = ${
        newMessageData.target_device_id
      } (type: ${typeof newMessageData.target_device_id}), myCurrentDeviceId = ${myCurrentDeviceIdFromContext} (type: ${typeof myCurrentDeviceIdFromContext})`
    );

    // --- FIX 2b: Realtime Device ID Filter ---
    // Use the same logic as the main fetch query filter (check target OR self-sent)
    // Although this handler is specifically for non-self messages, double-check target_device_id
    if (
      newMessageData.target_device_id !== undefined &&
      newMessageData.target_device_id !== null && // Keep null check
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
    // --- END FIX 2b ---

    if (messages.some((msg) => msg.id === newMessageData.id)) {
      console.log(
        `[Realtime HNM] Message ${newMessageData.id} already exists. Skipping.`
      );
      return;
    }

    const senderAddress = new SignalProtocolAddress(
      newMessageData.profile_id,
      newMessageData.device_id || 1
    );
    const senderAddressString = senderAddress.toString();

    // --- FIX: Do NOT preemptively build session for type 3 (PreKeyWhisper) messages ---
    // Let libsignal handle session creation on decrypt

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
        currentUserId, // myUserId
        myCurrentDeviceIdFromContext, // myDeviceId
        newMessageData.profile_id, // theirUserId
        newMessageData.device_id || 1, // theirDeviceId
        ciphertextForDecryption
      );
    } catch (e) {
      // Handle duplicate prekey decryption gracefully
      if (e.message?.toLowerCase().includes("duplicate")) {
        console.warn(
          `[Realtime HNM] Duplicate prekey message for ${senderAddressString} (msg ID: ${newMessageData.id}), ignoring.`
        );
        return;
      }
      // --- FIX 3b: Improved Bad MAC Handling (Realtime) ---
      // Check if it's a BadMacError specifically for PreKey messages (type 3)
      if (e.message?.includes("Bad MAC") && newMessageData.type === 3) {
        console.warn(
          `[Realtime HNM] Bad MAC for PreKeyWhisperMessage ${senderAddressString} (msg ID: ${newMessageData.id}). Likely wrong key/device or duplicate. Ignoring.`
        );
        return; // Don't proceed, don't show error in UI
      }
      // --- END FIX 3b ---

      console.error("[Realtime HNM] Decryption error (other):", e);
      // Maybe show a temporary error or just log and return
      // For now, just return to avoid adding a broken message
      return;
    }
    if (!plaintextBuffer) {
      console.warn("[Realtime HNM] Decryption returned null.");
      return;
    }
    const plaintext = arrayBufferToString(plaintextBuffer);
    // Ensure selectedConversation is still valid before caching
    // --- FIX 4b: Ensure Caching (Realtime) ---
    if (
      selectedConversationService &&
      selectedConversationService.id === newMessageData.conversation_id
    ) {
      // --- Namespacing: Pass userId to cacheSentMessage --- START ---
      await cacheSentMessage(
        currentUserId, // Pass currentUserId
        {
          id: newMessageData.id,
          content: plaintext,
          conversationId: selectedConversationService.id,
          timestamp: newMessageData.created_at,
        }
      );
      // --- Namespacing: Pass userId to cacheSentMessage --- END ---
    }
    // --- END FIX 4b ---

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
      isSelf: false, // Realtime messages are never from self in this handler
    };
    setMessages((prevMessages) => {
      // Check for duplicates again with prevMessages to be absolutely sure
      if (prevMessages.some((msg) => msg.id === formatted.id)) {
        return prevMessages;
      }
      return [...prevMessages, formatted];
    });
  };

  // 5. Realtime subscription
  useEffect(() => {
    if (!isReady || !selectedConversation?.id) {
      return;
    }

    if (messageSubscription) {
      console.log(
        `[Realtime Effect] Explicitly unsubscribing existing messageSubscription (topic: ${messageSubscription.topic}) before creating new one for conv ${selectedConversation.id}.`
      );
      messageSubscription.unsubscribe();
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
        handleNewMessage // Now correctly references the function in component scope
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

    setMessageSubscription(chan);

    return () => {
      console.log(
        `[Realtime Effect Cleanup] Unsubscribing channel for conv ${selectedConversation?.id} (channel topic: ${chan.topic})`
      );
      chan.unsubscribe();
    };
  }, [selectedConversation?.id, isReady]);

  const handleSendMessage = async () => {
    if (!isReady) {
      setError("Secure session not ready.");
      return;
    }
    if (
      (!newMessage.trim() && !selectedFile) ||
      !selectedConversation ||
      !currentUser ||
      deviceId === null
    )
      return;

    const { signalStore, deviceId: myDeviceId } = sig;
    const conversationId = selectedConversation.id;
    const profileId = currentUser.id;
    const originalNewMessage = newMessage;

    let contentToProcess = newMessage.trim();
    if (selectedFile) {
      const fileMarker = `[File] ${selectedFile.name}`;
      if (contentToProcess) {
        contentToProcess = `${contentToProcess} ${fileMarker}`;
      } else {
        contentToProcess = fileMarker;
      }
    }

    let successfullySentToAtLeastOneDevice = false;
    let lastInsertedMessageDataForUI = null;
    setError(null); // Clear previous errors

    try {
      const peers = selectedConversation.participants.filter(
        (p) => p.id !== profileId
      );
      if (peers.length === 0) {
        throw new Error("No other participants found in this conversation.");
      }

      const plaintextBytes = new TextEncoder().encode(contentToProcess);

      for (const peer of peers) {
        console.log(`[SendMessage] Processing peer: ${peer.id}`);

        // DEBUGGING BLOCK START
        if (peer.id === "d2fbdbb5-38d1-4d89-8321-ce28ea0fe22f") {
          console.log(`[DEBUG] Checking stored identities for peer ${peer.id}`);
          try {
            const addr79Str = new SignalProtocolAddress(peer.id, 79).toString();
            const key79 = await signalStore.loadIdentityKey(addr79Str);
            console.log(
              "[DEBUG] Stored identityKey for device #79:",
              key79 ? buf2hex(key79) : "null or undefined"
            );

            const addr80Str = new SignalProtocolAddress(peer.id, 80).toString();
            const key80 = await signalStore.loadIdentityKey(addr80Str);
            console.log(
              "[DEBUG] Stored identityKey for device #80:",
              key80 ? buf2hex(key80) : "null or undefined"
            );
          } catch (e) {
            console.error(
              "[DEBUG] Error loading identity keys for debugging:",
              e
            );
          }
        }
        // DEBUGGING BLOCK END

        try {
          const peerBundlesData = await get(`/signal/bundles/${peer.id}`);

          // ---- INSTRUMENTATION START ----
          console.log(`[Signal] 📥 Fetched bundles for peer ${peer.id}:`, {
            count: peerBundlesData?.length || 0,
            deviceIds: Array.isArray(peerBundlesData)
              ? peerBundlesData.map((b) => b.deviceId)
              : "Not an array or undefined",
            rawData: peerBundlesData,
          });
          // ---- INSTRUMENTATION END ----

          if (!peerBundlesData || !Array.isArray(peerBundlesData)) {
            console.warn(`No key bundles found for peer ${peer.id}. Skipping.`);
            continue; // Skip to the next peer
          }
          const bundleMap = bundlesToMap(peerBundlesData);
          if (bundleMap.size === 0) {
            console.warn(
              `No pre-key bundle published for ${peer.id}. Skipping.`
            );
            continue; // Skip to the next peer
          }

          // DEBUGGING BLOCK FOR BUNDLE KEYS (START)
          if (peer.id === "d2fbdbb5-38d1-4d89-8321-ce28ea0fe22f") {
            console.log(
              `[DEBUG] Checking bundle identityKeys for peer ${peer.id}`
            );
            const b79 = bundleMap.get(79);
            const b80 = bundleMap.get(80);

            if (b79 && b79.identityKey) {
              console.log(
                "[DEBUG] Bundle identityKey for #79:",
                buf2hex(new Uint8Array(b79.identityKey))
              );
              console.log("[DEBUG] Full bundle #79:", b79);
            } else {
              console.log(
                "[DEBUG] Bundle for #79 not found or has no identityKey."
              );
            }

            if (b80 && b80.identityKey) {
              console.log(
                "[DEBUG] Bundle identityKey for #80:",
                buf2hex(new Uint8Array(b80.identityKey))
              );
              console.log("[DEBUG] Full bundle #80:", b80);
            } else {
              console.log(
                "[DEBUG] Bundle for #80 not found or has no identityKey."
              );
            }
          }
          // DEBUGGING BLOCK FOR BUNDLE KEYS (END)

          for (const [peerDeviceId, preKeyBundleForDevice] of bundleMap) {
            const addr = new SignalProtocolAddress(peer.id, peerDeviceId);
            const addrStr = addr.toString();
            console.log(`[SendMessage] Processing device: ${addrStr}`);

            try {
              // --- FIX 5: Sender Sanity Check ---
              if (preKeyBundleForDevice.deviceId !== peerDeviceId) {
                console.error(
                  `[SendMessage SANITY FAIL] Mismatch! Bundle deviceId (${preKeyBundleForDevice.deviceId}) !== loop peerDeviceId (${peerDeviceId}) for peer ${peer.id}. Skipping device.`
                );
                continue; // Skip this device, something is wrong upstream
              }
              // --- END FIX 5 ---

              // --- FIX: Sender-Side Identity Safeguard --- START ---
              // Check if the identity key we are about to use for encryption is trusted.
              const identityKeyFromBundle = preKeyBundleForDevice.identityKey; // Already ArrayBuffer
              const isTrusted = await signalStore.isTrustedIdentity(
                addrStr,
                identityKeyFromBundle
              );

              if (!isTrusted) {
                console.warn(
                  `[SendMessage] Identity key in fetched bundle for ${addrStr} is NOT trusted. This might be a stale bundle. Removing old session/identity and trusting the key from THIS bundle before proceeding.`
                );
                await signalStore.removeSession(addrStr); // Remove session based on old identity
                // Ensure removeIdentity function exists before calling
                if (typeof signalStore.removeIdentity === "function") {
                  await signalStore.removeIdentity(addrStr); // Remove the old (potentially wrong) trusted identity
                  console.log(
                    `[SendMessage] Removed old identity for ${addrStr}.`
                  );
                } else {
                  console.warn(
                    `[SendMessage] store.removeIdentity not found, cannot explicitly remove old identity for ${addrStr}. Overwriting.`
                  );
                }
                // Save the identity from the bundle we are about to use.
                await signalStore.saveIdentity(addrStr, identityKeyFromBundle);
                console.log(
                  `[SendMessage] Saved new identity for ${addrStr} from bundle.`
                );
                // Session will be built implicitly by encryptMessage now using the newly trusted key.
                // We could explicitly call ensureOutboundSession here again, but encrypt should handle it.
              }
              // --- FIX: Sender-Side Identity Safeguard --- END ---

              // 1) Ensure identity and session are in sync *before* attempting encryption.
              // Only the SENDER should ever build a session proactively.
              console.log(
                `[SendMessage] Ensuring outbound session for ${addrStr} via ensureOutboundSession...` // <<< LOG BEFORE ensureOutboundSession
              );
              // --- Replace ensureOutboundSession with safeProcessPreKey --- START ---
              /* OLD Call:
              await ensureOutboundSession(
                signalStore,
                profile.id,
                peer.id,
                peerDeviceId,
                preKeyBundleForDevice
              );
              */
              await safeProcessPreKey(
                signalStore, // the store
                peer.id, // their userId
                peerDeviceId, // their deviceId
                preKeyBundleForDevice // the bundle you just fetched
              );
              // --- Replace ensureOutboundSession with safeProcessPreKey --- END ---
              console.log(
                `[SendMessage] Outbound session ensured/handled for ${addrStr}. Proceeding to encrypt.` // <<< LOG AFTER safeProcessPreKey
              );

              // --- Add Debug Log --- START ---
              console.log(
                "[DEBUG] containsSession after ensureOutboundSession?",
                await signalStore.containsSession(addrStr)
              );
              // --- Add Debug Log --- END ---

              // 2) Now encrypt exactly once.
              // --- Fix 3: Retry encryptMessage on "No record" error --- START ---
              let ct;
              try {
                console.log(
                  `[SendMessage] Attempting encryptMessage for ${addrStr} (Attempt 1)...`
                );
                ct = await encryptMessage(
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
                  // Remove the potentially corrupted session
                  await signalStore.removeSession(addrStr);
                  // Attempt to rebuild the session using the bundle we already have
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
                    // Retry encryption
                    ct = await encryptMessage(
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
                    // Set ct to null or undefined to prevent insertion, or rethrow
                    ct = null;
                    // Optionally: throw rebuildOrRetryError; // to propagate the error
                  }
                } else {
                  // Re-throw other encryption errors
                  console.error(
                    `[SendMessage] Non-'No record' encryption error for ${addrStr}:`,
                    e
                  );
                  throw e;
                }
              }
              // --- Fix 3: Retry encryptMessage on "No record" error --- END ---

              if (!ct) {
                // This case handles explicit failures from the retry block or rare null returns
                console.warn(
                  `[SendMessage] Ciphertext (ct) is undefined for ${addrStr} after encryptMessage, though no error was thrown. Skipping DB insert.`
                );
                continue;
              }

              // 3) Convert to hex & insert into DB as before
              const bodyUint8Array = Uint8Array.from(ct.body, (c) =>
                c.charCodeAt(0)
              );
              const pgByteaLiteral = `\\x${buf2hex(bodyUint8Array)}`;

              const messageToInsert = {
                conversation_id: conversationId,
                profile_id: profileId,
                type: ct.type,
                body: pgByteaLiteral,
                device_id: myDeviceId,
                target_device_id: peerDeviceId,
              };

              console.log(
                `[SendMessage] RAW INSERT ATTEMPT for ${addrStr}. Payload:`,
                JSON.stringify(messageToInsert)
              );

              let insertResult;
              try {
                insertResult = await supabase
                  .from("messages")
                  .insert(messageToInsert)
                  .select();
                console.log(
                  `[SendMessage] RAW INSERT SUCCEEDED for ${addrStr}. Response:`,
                  JSON.stringify(insertResult)
                );
              } catch (rawInsertError) {
                console.error(
                  `[SendMessage] RAW INSERT FAILED for ${addrStr} (exception during await):`,
                  rawInsertError
                );
                setError(
                  `DEBUG: Raw insert failed for ${addrStr}: ${rawInsertError.message}`
                );
                continue; // Skip to next device
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
                // Optionally set an error state for the user, or retry specific errors
                // For now, just log and continue to the next device/peer
                continue; // Continue to the next device/peer
              }

              if (insertedData && insertedData.length > 0) {
                lastInsertedMessageDataForUI = insertedData[0];
                successfullySentToAtLeastOneDevice = true;
                console.log(`[SendMessage] Successfully sent to ${addrStr}.`);
              } else {
                // This case might indicate a successful insert but no returned data, which could be an issue.
                console.warn(
                  `[SendMessage] DB insert for ${addrStr} reported success but returned no data.`
                );
              }
            } catch (deviceProcessingError) {
              // This catch block now handles errors from safeProcessPreKey (if it re-throws) or the single encryptMessage attempt.
              console.error(
                `[SendMessage] Error processing device ${addrStr}: ${deviceProcessingError.message}. Skipping device.`,
                deviceProcessingError
              );
              continue; // To next device/peer
            } // End try-catch for a single device
          } // End for...of bundleMap (devices for a peer)
        } catch (peerProcessingError) {
          // Errors like failing to fetch bundles for a peer
          console.error(
            `[SendMessage] Error processing peer ${peer.id}: ${peerProcessingError.message}. Skipping peer.`,
            peerProcessingError
          );
          continue; // Skip to the next peer
        }
      } // End for...of peers

      if (successfullySentToAtLeastOneDevice && lastInsertedMessageDataForUI) {
        const newMessageForUI = {
          id: lastInsertedMessageDataForUI.id, // Use the ID from the last successful insert
          senderId: profileId,
          senderName: profile?.full_name || profile?.username || "Me",
          senderAvatar: profile?.avatar_url,
          content: contentToProcess, // The original plaintext content
          timestamp: new Date(
            lastInsertedMessageDataForUI.created_at
          ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          isSelf: true,
        };
        setMessages((prevMessages) => [...prevMessages, newMessageForUI]);
        // --- Namespacing: Pass userId to cacheSentMessage --- START ---
        await cacheSentMessage(
          profileId, // Pass current user ID
          { ...newMessageForUI, conversationId }
        );
        // --- Namespacing: Pass userId to cacheSentMessage --- END ---
        setNewMessage("");
        setSelectedFile(null);
        setError(null); // Clear any general error if successful

        // --- ➕ ADD SENDER COPY --- START ---
        try {
          console.log(
            `[SendMessage] Inserting sender copy for conv ${conversationId}, user ${profileId}, device ${myDeviceId}`
          );
          await supabase.from("messages").insert({
            conversation_id: conversationId,
            profile_id: profileId, // Sender's ID
            device_id: myDeviceId, // Sender's current device ID
            target_device_id: myDeviceId, // Mark it as "for me"
            type: 1, // Convention for plain-text
            body: contentToProcess, // The original plain text message
          });
          console.log("[SendMessage] Sender copy inserted successfully.");
        } catch (err) {
          // Log error but don't block UI/throw, as the message *was* sent to others
          console.error("[SendMessage] Failed to insert sender copy:", err);
        }
        // --- ➕ ADD SENDER COPY --- END ---
      } else {
        // This error will be set if the message wasn't sent to *any* device of *any* peer
        throw new Error("Failed to send message to any recipient device.");
      }
    } catch (err) {
      // General errors (e.g., no peers, or if all sends failed and threw the error above)
      console.error("[SendMessage] Overall error:", err);
      setError(`Failed to send message: ${err.message}`);
      setNewMessage(originalNewMessage); // Restore original message on total failure
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const maxSizeMB = 10;
    if (file.size > maxSizeMB * 1024 * 1024) {
      alert(`File size exceeds ${maxSizeMB}MB limit.`);
      return;
    }

    setSelectedFile(file);
  };

  const handleLogout = async () => {
    // First, sign out from Supabase auth
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      console.error("Error signing out from Supabase:", signOutError);
      // Optionally, you might want to display this error to the user
      // For now, we'll proceed to try clearing local stores anyway
    }

    // --- Fix: Selectively Clear localStorage (Keep _deviceId) --- START ---
    try {
      console.log(
        "[Logout] Selectively clearing localStorage (keeping _deviceId keys)...",
        localStorage
      );
      // ✅ only clear the Supabase auth keys (or others, but not _deviceId)
      Object.keys(localStorage)
        .filter(
          (k) => /* k.startsWith("supabase") || */ !k.endsWith("_deviceId")
        ) // Keep _deviceId, remove others (adjust filter as needed)
        .forEach((k) => {
          console.log(`[Logout] Removing localStorage item: ${k}`);
          localStorage.removeItem(k);
        });
      console.log(
        "[Logout] Selective localStorage clear complete.",
        localStorage
      );
    } catch (e) {
      console.error("[Logout] Error during selective localStorage clear:", e);
    }
    // --- Fix: Selectively Clear localStorage --- END ---

    // Note: We are NOT attempting to delete the namespaced IndexedDB here,
    // as it's complex and prone to 'blocked' errors.
    // User can manually clear site data if needed.

    // Finally, navigate to login page
    navigate("/login");
  };

  const handleUserSelect = async (selectedUser) => {
    console.log("Selected user to start chat with:", selectedUser);
    if (!currentUser || !profile) {
      console.error("Current user or profile not loaded.");
      return;
    }
    if (selectedUser.id === currentUser.id) {
      console.warn("Cannot start chat with self.");
      return;
    }

    setIsNewChatModalOpen(false); // Close modal immediately

    try {
      // 1. Check if a conversation already exists
      const existingConversation = conversations.find((conv) => {
        // Check if participants array exists and has exactly 2 participants (for 1-on-1 chat)
        // Adjust this logic if group chats need different handling
        if (!conv.participants || conv.participants.length !== 2) return false;
        // Check if both currentUser and selectedUser are participants
        const hasCurrentUser = conv.participants.some(
          (p) => p.id === currentUser.id
        );
        const hasSelectedUser = conv.participants.some(
          (p) => p.id === selectedUser.id
        );
        return hasCurrentUser && hasSelectedUser;
      });

      if (existingConversation) {
        console.log("Found existing conversation:", existingConversation);
        setSelectedConversation(existingConversation);
      } else {
        console.log("No existing conversation found, creating new one...");
        // 2. Create New Conversation
        const { data: newConvData, error: convInsertError } = await supabase
          .from("conversations")
          .insert({})
          .select()
          .single();

        if (convInsertError) throw convInsertError;
        const newConversationId = newConvData.id;
        console.log("Created new conversation with ID:", newConversationId);

        // 3. Add Participants
        const { error: participantInsertError } = await supabase
          .from("conversation_participants")
          .insert([
            { conversation_id: newConversationId, profile_id: currentUser.id },
            { conversation_id: newConversationId, profile_id: selectedUser.id },
          ]);

        if (participantInsertError) throw participantInsertError;
        console.log("Added participants to new conversation.");

        // 4. Construct new conversation object for UI state
        const newConversationForState = {
          id: newConversationId,
          name: selectedUser.full_name || selectedUser.username, // Use selected user's name for 1-on-1
          lastMessage: "", // No messages yet
          time: "",
          unread: 0,
          avatar: selectedUser.avatar_url, // Use selected user's avatar
          participants: [
            {
              // Current user's profile
              id: profile.id,
              username: profile.username,
              full_name: profile.full_name,
              avatar_url: profile.avatar_url,
              status: profile.status,
            },
            {
              // Selected user's profile (from modal data)
              id: selectedUser.id,
              username: selectedUser.username,
              full_name: selectedUser.full_name,
              avatar_url: selectedUser.avatar_url,
              status: "offline", // Assume offline initially, status updates needed separately
            },
          ],
          is_group: false, // New 1-on-1 chats are not groups
          group_name: null,
          group_avatar_url: null,
        };

        // 5. Update State
        setConversations((prev) => [newConversationForState, ...prev]); // Add to beginning
        setSelectedConversation(newConversationForState);
        console.log(
          "Set new conversation as selected:",
          newConversationForState
        );
      }
    } catch (err) {
      console.error("Error starting chat:", err);
      setError("Failed to start chat. " + err.message);
    }
  };

  // Effect to fetch all users for the NewGroupModal
  useEffect(() => {
    const fetchAllUsers = async () => {
      if (!currentUser?.id) return;
      try {
        const { data, error: fetchUsersError } = await supabase
          .from("profiles")
          .select("id, username, full_name, avatar_url")
          .neq("id", currentUser.id); // Exclude current user from the list

        if (fetchUsersError) throw fetchUsersError;
        setAllUsers(data || []);
      } catch (err) {
        console.error("Error fetching all users:", err);
        setError("Failed to load users for group creation.");
        setAllUsers([]); // Ensure allUsers is an empty array on error
      }
    };

    fetchAllUsers();
  }, [currentUser?.id]);

  const handleCreateGroup = async ({ name: groupName, memberIds }) => {
    if (!currentUser || !profile) {
      setError("Current user or profile not loaded. Cannot create group.");
      return;
    }
    if (!groupName || memberIds.length === 0) {
      setError("Group name and at least one member are required.");
      return;
    }

    setIsNewGroupModalOpen(false); // Close modal immediately
    setLoadingConversations(true); // Indicate loading for sidebar update
    setError(null);

    try {
      // 1. Create a conversation row with is_group: true
      const { data: convData, error: convInsertError } = await supabase
        .from("conversations")
        .insert({ is_group: true, group_name: groupName })
        .select()
        .single();

      if (convInsertError) throw convInsertError;
      const newConversationId = convData.id;

      // 2. Add all selected users + yourself as participants
      const participantObjects = memberIds.map((id) => ({
        conversation_id: newConversationId,
        profile_id: id,
      }));
      participantObjects.push({
        conversation_id: newConversationId,
        profile_id: currentUser.id,
      });

      const { error: participantInsertError } = await supabase
        .from("conversation_participants")
        .insert(participantObjects);

      if (participantInsertError) throw participantInsertError;

      // 3. Construct new group object for UI state (fetch full participant profiles)
      // For simplicity now, we'll use the IDs and current user's profile.
      // A more robust solution would fetch all participant profiles here.
      const groupParticipantsProfiles = [
        profile, // Current user's profile
        ...allUsers.filter((u) => memberIds.includes(u.id)),
      ];

      const newGroupForState = {
        id: newConversationId,
        name: groupName, // Sidebar name will be group name
        lastMessage: "Group created",
        time: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        unread: 0,
        avatar: null, // Placeholder for group avatar, using default
        participants: groupParticipantsProfiles,
        is_group: true,
        group_name: groupName,
        group_avatar_url: null, // Default group avatar
      };

      // 4. Update State
      setConversations((prev) => [newGroupForState, ...prev]);
      setSelectedConversation(newGroupForState);
      setError(null);
    } catch (err) {
      console.error("Error creating group:", err);
      setError(`Failed to create group: ${err.message}`);
    } finally {
      setLoadingConversations(false);
    }
  };

  // --- Conditional Return for loading Signal context OR other states ---
  if (initializationError) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900 text-red-400">
        Error initializing secure session: {initializationError}
      </div>
    );
  }
  if (!isReady) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900 text-white">
        Initializing secure session...
      </div>
    );
  }
  if (error && !initializationError) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900 text-red-400">
        Error: {error}
      </div>
    );
  }

  // Main component JSX, ensure sig.deviceId is used where myDeviceIdForJSX was used
  return (
    <div className="flex h-screen bg-slate-900">
      {/* Sidebar - Chat List */}
      {(!isMobile || isMobileMenuOpen) && (
        <AnimatePresence>
          <div
            className={`${
              isMobile ? "absolute z-10 w-full max-w-xs" : "w-80"
            } h-full bg-slate-800 border-r border-slate-700 flex flex-col`}
          >
            {/* Header */}
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-emerald-400" />
                <h1 className="font-bold text-white">Messages</h1>
              </div>
              <div className="flex gap-1">
                <Dialog
                  open={isNewChatModalOpen}
                  onOpenChange={setIsNewChatModalOpen}
                >
                  <DialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Start new 1-on-1 chat"
                      className="text-slate-400 hover:text-white"
                    >
                      <Plus className="h-5 w-5" />
                    </Button>
                  </DialogTrigger>
                  <NewChatModal
                    currentUser={currentUser}
                    onUserSelect={handleUserSelect}
                    onOpenChange={setIsNewChatModalOpen}
                  />
                </Dialog>
                <Dialog
                  open={isNewGroupModalOpen}
                  onOpenChange={setIsNewGroupModalOpen}
                >
                  <DialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Create new group chat"
                      className="text-slate-400 hover:text-white"
                    >
                      <Users className="h-5 w-5" />
                    </Button>
                  </DialogTrigger>
                  <NewGroupModal
                    allUsers={allUsers}
                    currentUser={currentUser}
                    onCreate={handleCreateGroup}
                    onOpenChange={setIsNewGroupModalOpen}
                  />
                </Dialog>
                {isMobile && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-slate-400 hover:text-white"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                )}
              </div>
            </div>

            {/* Search */}
            <div className="p-4 border-b border-slate-700">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search conversations..."
                  className="pl-9 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* Chat List Area */}
            <ScrollArea className="flex-1">
              <div className="p-2">
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={`p-3 rounded-lg cursor-pointer mb-1 hover:bg-slate-700/50 ${
                      selectedConversation?.id === conv.id ? "bg-slate-700" : ""
                    }`}
                    onClick={() => {
                      setSelectedConversation(conv);
                      if (isMobile) setIsMobileMenuOpen(false);
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage
                          src={
                            conv.is_group
                              ? conv.group_avatar_url ||
                                "/group-placeholder.svg"
                              : conv.avatar || "/placeholder.svg"
                          }
                          alt={
                            conv.is_group
                              ? conv.group_name || "Group"
                              : conv.name
                          }
                        />
                        <AvatarFallback className="bg-emerald-500 text-white">
                          {(conv.is_group
                            ? conv.group_name || "Group"
                            : conv.name
                          )
                            ?.split(" ")
                            .map((n) => n[0])
                            .join("") || "??"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center">
                          <h3 className="font-medium text-white truncate">
                            {conv.is_group
                              ? conv.group_name || "Unnamed Group"
                              : conv.name}
                          </h3>
                          <span className="text-xs text-slate-400">
                            {conv.time}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <p className="text-sm text-slate-400 truncate">
                            {conv.lastMessage}
                          </p>
                          {conv.unread > 0 && (
                            <span className="bg-emerald-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                              {conv.unread}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {/* Footer Profile Section */}
            <div className="p-4 border-t border-slate-700 flex items-center justify-between">
              <Link to="/profile" className="flex items-center gap-3">
                <Avatar>
                  <AvatarImage
                    src={
                      profile?.avatar_url ||
                      "/placeholder.svg?height=40&width=40"
                    }
                    alt="Your Avatar"
                  />
                  <AvatarFallback className="bg-emerald-500 text-white">
                    {(profile?.full_name || profile?.username || "??")
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-white">
                    {profile?.full_name || profile?.username || "Loading..."}
                  </p>
                  <p className="text-xs text-slate-400">
                    {profile?.status || "Offline"}
                  </p>
                </div>
              </Link>
              <div className="flex gap-1">
                <Link to="/settings">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-slate-400 hover:text-white"
                  >
                    <Settings className="h-5 w-5" />
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-slate-400 hover:text-white"
                  onClick={handleLogout}
                >
                  <LogOut className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>
        </AnimatePresence>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full">
        {/* Chat Header */}
        <div className="p-4 border-b border-slate-700 flex items-center justify-between bg-slate-800">
          <div className="flex items-center gap-3">
            {isMobile && (
              <Button
                variant="ghost"
                size="icon"
                className="text-slate-400 hover:text-white"
                onClick={() => setIsMobileMenuOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
            )}

            {selectedConversation && (
              <>
                <Avatar>
                  <AvatarImage
                    src={
                      selectedConversation.is_group
                        ? selectedConversation.group_avatar_url ||
                          "/group-placeholder.svg"
                        : selectedConversation.avatar || "/placeholder.svg"
                    }
                    alt={
                      selectedConversation.is_group
                        ? selectedConversation.group_name || "Group Chat"
                        : selectedConversation.name
                    }
                  />
                  <AvatarFallback className="bg-emerald-500 text-white">
                    {selectedConversation.is_group
                      ? (selectedConversation.group_name || "Group")
                          .split(" ")
                          .map((w) => w[0])
                          .join("")
                      : selectedConversation.name
                          ?.split(" ")
                          .map((n) => n[0])
                          .join("") || "??"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h2 className="font-medium text-white">
                    {selectedConversation.is_group
                      ? selectedConversation.group_name || "Unnamed Group"
                      : selectedConversation.name}
                  </h2>
                  <p className="text-xs text-slate-400">Online</p>
                </div>
              </>
            )}
            {!selectedConversation && !loadingConversations && (
              <div className="text-slate-400">
                Select a conversation to start chatting
              </div>
            )}
          </div>

          {/* More Options Sheet - Conditionally render if selectedConversation exists */}
          {selectedConversation && (
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-slate-400 hover:text-white"
                >
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent className="bg-slate-800 border-slate-700 text-white">
                <div className="space-y-4 py-4">
                  <div className="flex flex-col items-center gap-2 pb-4 border-b border-slate-700">
                    <Avatar className="h-20 w-20">
                      <AvatarImage
                        src={
                          selectedConversation?.is_group
                            ? selectedConversation?.group_avatar_url ||
                              "/group-placeholder.svg"
                            : selectedConversation?.avatar || "/placeholder.svg"
                        }
                        alt={
                          selectedConversation?.is_group
                            ? selectedConversation?.group_name || "Group Chat"
                            : selectedConversation?.name
                        }
                      />
                      <AvatarFallback className="bg-emerald-500 text-white text-xl">
                        {(selectedConversation?.is_group
                          ? selectedConversation?.group_name || "Group"
                          : selectedConversation?.name
                        )
                          ?.split(" ")
                          .map((n) => n[0])
                          .join("") || "??"}
                      </AvatarFallback>
                    </Avatar>
                    <h3 className="text-xl font-bold">
                      {selectedConversation?.is_group
                        ? selectedConversation?.group_name || "Unnamed Group"
                        : selectedConversation?.name}
                    </h3>
                    <p className="text-sm text-slate-400">Online</p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-slate-400">
                      Options
                    </h4>
                    <div className="space-y-1">
                      <Button
                        variant="ghost"
                        className="w-full justify-start text-white"
                      >
                        <User className="mr-2 h-4 w-4" />
                        View Profile
                      </Button>
                      <Button
                        variant="ghost"
                        className="w-full justify-start text-white"
                      >
                        <MessageSquare className="mr-2 h-4 w-4" />
                        Search in Conversation
                      </Button>
                      {selectedConversation?.is_group && (
                        <Button
                          variant="ghost"
                          className="w-full justify-start text-white"
                          onClick={async () => {
                            const newName = window.prompt(
                              "Enter a new group name:",
                              selectedConversation?.group_name || ""
                            );
                            if (
                              !newName ||
                              newName === selectedConversation?.group_name
                            )
                              return;
                            setIsRenamingGroup(true);
                            setError(null);
                            try {
                              await post(
                                `/conversations/${selectedConversation?.id}`,
                                {
                                  group_name: newName,
                                }
                              );
                              // Optimistically update UI
                              setSelectedConversation((c) => ({
                                ...c,
                                group_name: newName,
                                name: newName,
                              }));
                              setConversations((list) =>
                                list.map((c) =>
                                  c.id === selectedConversation?.id
                                    ? {
                                        ...c,
                                        name: newName,
                                        group_name: newName,
                                      }
                                    : c
                                )
                              );
                            } catch (err) {
                              console.error("Error renaming group:", err);
                              setError(
                                `Failed to rename group: ${err.message}`
                              );
                            } finally {
                              setIsRenamingGroup(false);
                            }
                          }}
                          disabled={
                            isRenamingGroup || !selectedConversation?.id
                          }
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          {isRenamingGroup ? "Renaming..." : "Rename Group"}
                        </Button>
                      )}
                      {selectedConversation?.is_group && (
                        <Button
                          variant="ghost"
                          className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-900/20"
                          onClick={async () => {
                            if (
                              !window.confirm(
                                "Are you sure you want to leave this group? You'll have to be re-invited to participate again."
                              )
                            )
                              return;

                            setIsLeavingGroup(true);
                            setError(null);
                            try {
                              const { error: deleteError } = await supabase
                                .from("conversation_participants")
                                .delete()
                                .match({
                                  conversation_id: selectedConversation?.id,
                                  profile_id: currentUser?.id,
                                });

                              if (deleteError) throw deleteError;

                              // Remove from local state & navigate away
                              setConversations((list) =>
                                list.filter(
                                  (c) => c.id !== selectedConversation?.id
                                )
                              );
                              setSelectedConversation(null);
                              // navigate("/chat"); // Decided to keep user on the page
                            } catch (err) {
                              console.error("Error leaving group:", err);
                              setError(`Failed to leave group: ${err.message}`);
                            } finally {
                              setIsLeavingGroup(false);
                            }
                          }}
                          disabled={
                            isLeavingGroup ||
                            !selectedConversation?.id ||
                            !currentUser?.id
                          }
                        >
                          <LogOut className="mr-2 h-4 w-4" />
                          {isLeavingGroup ? "Leaving..." : "Leave Group"}
                        </Button>
                      )}
                      {/* Conditionally render Delete Conversation only if NOT a group and functionality is intended */}
                      {/* For now, completely hiding if not a group, as 1-on-1 delete is not implemented */}
                      {/* 
                      {!selectedConversation.is_group && (
                        <Button
                          variant="ghost"
                          className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-900/20"
                          onClick={() => alert("Delete 1-on-1 conversation (not implemented yet)")} 
                        >
                          <LogOut className="mr-2 h-4 w-4" />
                          Delete Conversation
                        </Button>
                      )}
                      */}
                    </div>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          )}
        </div>

        {/* Messages Area */}
        <ScrollArea className="flex-1 p-4 bg-gradient-to-b from-slate-900 to-slate-800">
          <div className="space-y-4">
            {loadingMessages && (
              <div className="text-center text-slate-400 py-4">
                Loading messages...
              </div>
            )}
            {!loadingMessages &&
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${
                    message.isSelf ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] ${
                      message.isSelf ? "order-2" : "order-1"
                    }`}
                  >
                    {!message.isSelf && (
                      <div className="flex items-center gap-2 mb-1">
                        <Avatar className="h-6 w-6">
                          <AvatarImage
                            src={message.senderAvatar || "/placeholder.svg"}
                            alt={message.senderName}
                          />
                          <AvatarFallback className="bg-emerald-500 text-white text-xs">
                            {message.senderName
                              ?.split(" ")
                              .map((n) => n[0])
                              .join("") || "??"}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs text-slate-400">
                          {message.senderName}
                        </span>
                      </div>
                    )}
                    <div
                      className={`rounded-lg p-3 ${
                        message.isSelf
                          ? "bg-emerald-500 text-white rounded-tr-none"
                          : "bg-slate-700 text-white rounded-tl-none"
                      }`}
                    >
                      <p>
                        {message.content.startsWith("[File](") ? (
                          // Format: [File](url) filename
                          (() => {
                            const match = message.content.match(
                              /\[File\]\((.*?)\)\s*(.*)/
                            );
                            const url = match?.[1];
                            const name = match?.[2] || "Download File";
                            return (
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline text-blue-400"
                              >
                                📎 {name}
                              </a>
                            );
                          })()
                        ) : message.content.startsWith("[File] ") ? (
                          // Format: [File] filename (no URL yet — fallback)
                          <span className="text-slate-300">
                            📎 {message.content.slice(7)}
                          </span>
                        ) : (
                          message.content
                        )}
                      </p>
                    </div>
                    <p
                      className={`text-xs text-slate-400 mt-1 ${
                        message.isSelf ? "text-right" : "text-left"
                      }`}
                    >
                      {message.timestamp}
                    </p>
                  </div>
                </div>
              ))}
            {!loadingMessages &&
              messages.length === 0 &&
              selectedConversation && (
                <div className="text-center text-slate-500 pt-10">
                  No messages yet. Start the conversation!
                </div>
              )}
            <div ref={messagesEndRef} />
          </div>
          {!selectedConversation && !loadingConversations && (
            <div className="text-center text-slate-500 pt-10">
              Select a conversation to view messages.
            </div>
          )}
        </ScrollArea>

        {/* Message Input */}
        <div className="p-4 border-t border-slate-700 bg-slate-800 relative">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <Button
              type="button"
              variant="ghost"
              className="text-slate-400 hover:text-white"
              onClick={() => fileInputRef.current.click()}
            >
              📎
            </Button>

            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={handleFileSelect}
            />

            <Input
              placeholder="Type a message..."
              className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              disabled={
                !selectedConversation || loadingConversations || !isReady
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setShowEmojiPicker((prev) => !prev)}
            >
              😀
            </Button>

            <Button
              type="submit"
              size="icon"
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
              disabled={
                (!newMessage.trim() && !selectedFile) ||
                !selectedConversation ||
                loadingConversations ||
                !isReady
              }
            >
              <Send className="h-5 w-5" />
            </Button>
          </form>
          {showEmojiPicker && (
            <div className="absolute bottom-24 right-8 z-50">
              <EmojiPicker
                onEmojiClick={(emojiData) =>
                  setNewMessage((prev) => prev + emojiData.emoji)
                }
              />
            </div>
          )}

          {selectedFile && (
            <div className="text-slate-400 text-xs mt-2 ml-2">
              Attached: {selectedFile.name}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
