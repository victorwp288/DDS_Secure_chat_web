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
  Plus,
  Search,
  Send,
  Settings,
  User,
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
import { useSignal } from "../lib/signalContext.jsx";
import {
  encryptMessage,
  decryptMessage,
  arrayBufferToString,
  buildSession,
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
async function safeBuildSession(store, userId, deviceId, preKeyBundle) {
  const addr = `${userId}.${deviceId}`;
  try {
    await buildSession(store, userId, deviceId, preKeyBundle);
  } catch (err) {
    if (err.message?.includes("Identity key changed")) {
      console.warn(
        `[safeBuildSession] Identity key changed for ${addr}. Resetting and rebuilding.`
      );
      await store.removeSession(addr);
      await store.removeIdentity(addr);
      try {
        await buildSession(store, userId, deviceId, preKeyBundle);
        console.log(
          `[safeBuildSession] Second buildSession successful for ${addr} after reset.`
        );
      } catch (err2) {
        console.warn(
          `[safeBuildSession] Second buildSession failed for ${addr} after reset: ${err2.message}. Swallowing error to allow further processing.`
        );
        // SWALLOW err2 to allow SessionBuilder.processPreKey or encryptMessage to proceed
      }
    } else {
      console.error(
        `[safeBuildSession] Error building session for ${addr} (not identity change):`,
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

  const isMobile = useMobile();
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);
  const sig = useSignal();
  const { isReady, signalStore, deviceId, initializationError } = sig || {};
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
            `id, created_at, conversation_participants(profile_id, profiles(id, username, full_name, avatar_url, status))`
          )
          .in("id", conversationIds);
        if (convError) throw convError;
        const formattedConversations = convData.map((conv) => {
          const participants = conv.conversation_participants.map(
            (p) => p.profiles
          );
          const otherParticipant =
            participants.find((p) => p.id !== profile.id) || participants[0];
          return {
            id: conv.id,
            name:
              otherParticipant?.full_name ||
              otherParticipant?.username ||
              "Unknown User",
            lastMessage: "...",
            time: "",
            unread: 0,
            avatar: otherParticipant?.avatar_url,
            participants,
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
    if (!isReady) {
      console.log(
        "[Effect 3] Signal context not ready, deferring message fetch."
      );
      setMessages([]);
      return;
    }
    const { signalStore } = sig;
    if (!selectedConversation?.id || !currentUser?.id) {
      setMessages([]);
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
        const { data, error: messagesError } = await supabase
          .from("messages")
          .select(
            `id, body, type, created_at, profile_id, device_id, target_device_id, profiles ( id, full_name, username, avatar_url )`
          )
          .eq("conversation_id", selectedConversation.id)
          .order("created_at", { ascending: true });
        if (messagesError) throw messagesError;
        const decryptedMessages = [];
        for (const msg of data) {
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
          const cachedContent = await getCachedMessageContent(msg.id);
          if (cachedContent) {
            processedContent = cachedContent;
          } else {
            if (isSelfSent) {
              processedContent = "[Self, Uncached - Error]";
            } else {
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
                try {
                  const senderDeviceId = msg.device_id;
                  const plaintextBuffer = await decryptMessage(
                    signalStore,
                    currentUser.id,
                    msg.profile_id,
                    senderDeviceId || 1,
                    { type: msg.type, body: bodyUint8Array }
                  );
                  if (plaintextBuffer) {
                    processedContent = arrayBufferToString(plaintextBuffer);
                    await cacheSentMessage({
                      id: msg.id,
                      content: processedContent,
                      conversationId: selectedConversation.id,
                      timestamp: msg.created_at,
                    });
                  } else {
                    processedContent = "[Decryption Failed]";
                  }
                } catch (decryptionError) {
                  console.error(
                    `[Effect 3] Decryption error for msg ${msg.id}:`,
                    decryptionError
                  );
                  processedContent = "[Decryption Error]";
                }
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
  }, [selectedConversation?.id, currentUser?.id, sig, isReady]);

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

    if (newMessageData.type === 3) {
      console.log(
        `[Realtime HNM] Received PreKeyWhisperMessage (Type 3) id: ${newMessageData.id} from ${senderAddressString}`
      );
      const existingSession = await currentSignalStore.loadSession(
        senderAddressString
      );
      if (!existingSession) {
        console.log(
          `[Realtime HNM] No existing session for ${senderAddressString} for Type 3. Attempting to build one.`
        );
        try {
          const peerBundlesData = await get(
            `/api/signal/bundles/${newMessageData.profile_id}`
          );
          if (!peerBundlesData || !Array.isArray(peerBundlesData)) {
            throw new Error(
              `No valid bundles array found for peer ${newMessageData.profile_id}.`
            );
          }
          const peerBundleMap = bundlesToMap(peerBundlesData);
          const specificDeviceBundle = peerBundleMap.get(
            newMessageData.device_id || 1
          );
          if (!specificDeviceBundle) {
            throw new Error(`Bundle not found for ${senderAddressString}`);
          }
          const sessionBuilder = new SessionBuilder(
            currentSignalStore,
            senderAddress
          );
          await sessionBuilder.processPreKey(specificDeviceBundle);
          console.log(
            `[Realtime HNM] SessionBuilder.processPreKey successful for ${senderAddressString}.`
          );
        } catch (buildError) {
          console.error(
            `[Realtime HNM] Error building session for Type 3 from ${senderAddressString}:`,
            buildError
          );
          // Allow decryption to proceed and likely fail, for logging.
        }
      } else {
        console.log(
          `[Realtime HNM] Existing session found for ${senderAddressString} for Type 3.`
        );
      }
    }

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
        currentUserId, // Pass currentUserId
        newMessageData.profile_id,
        newMessageData.device_id || 1,
        ciphertextForDecryption
      );
    } catch (e) {
      console.error("[Realtime HNM] Decryption error:", e);
      return;
    }
    if (!plaintextBuffer) {
      console.warn("[Realtime HNM] Decryption returned null.");
      return;
    }

    const plaintext = arrayBufferToString(plaintextBuffer);
    // Ensure selectedConversation is still valid before caching
    if (
      selectedConversationService &&
      selectedConversationService.id === newMessageData.conversation_id
    ) {
      await cacheSentMessage({
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
      !newMessage.trim() ||
      !selectedConversation ||
      !currentUser ||
      deviceId === null
    )
      return;

    const { signalStore, deviceId: myDeviceId } = sig;
    const content = newMessage.trim();
    const conversationId = selectedConversation.id;
    const profileId = currentUser.id;
    const originalNewMessage = newMessage;
    setNewMessage("");
    try {
      const peer = selectedConversation.participants.find(
        (p) => p.id !== profileId
      );
      if (!peer) throw new Error("Could not find peer.");
      const peerBundlesData = await get(`/api/signal/bundles/${peer.id}`);
      if (!peerBundlesData || !Array.isArray(peerBundlesData))
        throw new Error(`No key bundles for peer ${peer.id}.`);
      const bundleMap = bundlesToMap(peerBundlesData);
      if (bundleMap.size === 0)
        throw new Error(
          `No pre-key bundle published for ${
            selectedConversation.name || peer.id
          }.`
        );
      const plaintextBytes = new TextEncoder().encode(content);
      let lastInsertedMessageData = null;

      for (const [peerDeviceId, preKeyBundleForDevice] of bundleMap) {
        const addr = new SignalProtocolAddress(peer.id, peerDeviceId);
        const addrStr = addr.toString();

        try {
          if (!(await signalStore.containsSession(addrStr))) {
            console.log(
              `[SendMessage] No session for ${addrStr}, attempting initial safeBuildSession...`
            );
            await safeBuildSession(
              signalStore,
              peer.id,
              peerDeviceId,
              preKeyBundleForDevice
            );
            console.log(
              `[SendMessage] Initial safeBuildSession completed for ${addrStr}.`
            );
          }
        } catch (buildErr) {
          console.warn(
            `[SendMessage] Error during initial safeBuildSession for ${addrStr}, continuing to next step or device: `,
            buildErr.message || buildErr
          );
          // Continue to the explicit SessionBuilder.processPreKey attempt or next device
        }

        // --- force the PreKey handshake on sender side (USER'S DIFF) ---
        try {
          console.log(
            `[SendMessage] Attempting direct SessionBuilder.processPreKey for ${addrStr} before encryption.`
          );
          const builder = new SessionBuilder(signalStore, addr);
          await builder.processPreKey(preKeyBundleForDevice);
          console.log(
            `[SendMessage] Direct SessionBuilder.processPreKey successful for ${addrStr}.`
          );
        } catch (processPreKeyError) {
          console.warn(
            `[SendMessage] Error during direct SessionBuilder.processPreKey for ${addrStr}: ${processPreKeyError.message}. Encryption will still be attempted.`,
            processPreKeyError
          );
        }

        // Now, attempt encryption and DB insert
        try {
          console.log(`[SendMessage] Attempting encryption for ${addrStr}...`);
          const ct = await encryptMessage(
            signalStore,
            peer.id,
            peerDeviceId,
            plaintextBytes.buffer
          );
          const bodyUint8Array = Uint8Array.from(ct.body, (c) =>
            c.charCodeAt(0)
          );
          const pgByteaLiteral = `\\x${buf2hex(bodyUint8Array)}`;
          console.log(`[SendMessage] Attempting DB insert for ${addrStr}...`);
          const { data: insertedData, error: insertError } = await supabase
            .from("messages")
            .insert({
              conversation_id: conversationId,
              profile_id: profileId,
              type: ct.type,
              body: pgByteaLiteral,
              device_id: myDeviceId,
              target_device_id: peerDeviceId,
            })
            .select();
          if (insertError) {
            console.error(`DB insert failed for ${addrStr}:`, insertError);
            continue;
          }
          if (insertedData && insertedData.length > 0) {
            lastInsertedMessageData = insertedData[0];
            console.log(
              `[SendMessage] Successfully sent to ${addrStr}. Continuing to next device if any.`
            );
          }
        } catch (encryptErr) {
          if (
            encryptErr instanceof Error &&
            encryptErr.message?.includes("Identity key changed")
          ) {
            console.warn(
              `[SendMessage] Identity key changed during encrypt/send for ${addrStr}. Retrying build and send...`
            );
            await signalStore.removeSession(addrStr);
            await signalStore.removeIdentity(addrStr);
            try {
              await safeBuildSession(
                signalStore,
                peer.id,
                peerDeviceId,
                preKeyBundleForDevice
              );
              console.log(
                `[SendMessage] safeBuildSession successful for ${addrStr} after identity change during encrypt.`
              );
              // Retry encrypt + insert
              const ctRetry = await encryptMessage(
                signalStore,
                peer.id,
                peerDeviceId,
                plaintextBytes.buffer
              );
              const bodyRetry = Uint8Array.from(ctRetry.body, (c) =>
                c.charCodeAt(0)
              );
              const pgByteaRetry = `\\x${buf2hex(bodyRetry)}`;
              const { data: insertedDataRetry, error: insertErrRetry } =
                await supabase
                  .from("messages")
                  .insert({
                    conversation_id: conversationId,
                    profile_id: profileId,
                    type: ctRetry.type,
                    body: pgByteaRetry,
                    device_id: myDeviceId,
                    target_device_id: peerDeviceId,
                  })
                  .select();

              if (insertErrRetry) {
                console.error(
                  `[SendMessage] DB insert failed for ${addrStr} on retry:`,
                  insertErrRetry
                );
                continue;
              }
              if (insertedDataRetry && insertedDataRetry.length > 0) {
                lastInsertedMessageData = insertedDataRetry[0];
                console.log(
                  `[SendMessage] Successfully sent to ${addrStr} after retry. Continuing to next device if any.`
                );
              }
            } catch (retryBuildErr) {
              console.error(
                `[SendMessage] Failed to rebuild session or resend for ${addrStr} after identity change: ${retryBuildErr.message}. Skipping device.`,
                retryBuildErr
              );
              continue;
            }
          } else {
            console.error(
              `[SendMessage] Non-identity error during encrypt/send for ${addrStr}:`,
              encryptErr
            );
            continue;
          }
        }
      } // End for...of loop
      if (lastInsertedMessageData) {
        setError(null);
        const newMessageForUI = {
          id: lastInsertedMessageData.id,
          senderId: profileId,
          senderName: profile?.full_name || profile?.username || "Me",
          senderAvatar: profile?.avatar_url,
          content,
          timestamp: new Date(
            lastInsertedMessageData.created_at
          ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          isSelf: true,
        };
        setMessages((prevMessages) => [...prevMessages, newMessageForUI]);
        await cacheSentMessage({ ...newMessageForUI, conversationId });
      } else if (bundleMap.size > 0) {
        setError("Failed to send message to any peer device.");
        setNewMessage(originalNewMessage);
      } else {
        setError("No key bundles for recipient.");
        setNewMessage(originalNewMessage);
      }
    } catch (err) {
      setError(`Failed to send message: ${err.message}`);
      setNewMessage(originalNewMessage);
    }
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Error logging out:", error);
    } else {
      navigate("/login");
    }
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
              <div className="flex gap-2">
                <Dialog
                  open={isNewChatModalOpen}
                  onOpenChange={setIsNewChatModalOpen}
                >
                  <DialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-slate-400 hover:text-white"
                    >
                      <Plus className="h-5 w-5" />
                    </Button>
                  </DialogTrigger>
                  <NewChatModal
                    currentUser={currentUser}
                    onUserSelect={handleUserSelect}
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
                          src={conv.avatar || "/placeholder.svg"}
                          alt={conv.name}
                        />
                        <AvatarFallback className="bg-emerald-500 text-white">
                          {conv.name
                            ?.split(" ")
                            .map((n) => n[0])
                            .join("") || "??"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center">
                          <h3 className="font-medium text-white truncate">
                            {conv.name}
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
                    src={selectedConversation.avatar || "/placeholder.svg"}
                    alt={selectedConversation.name}
                  />
                  <AvatarFallback className="bg-emerald-500 text-white">
                    {selectedConversation.name
                      ?.split(" ")
                      .map((n) => n[0])
                      .join("") || "??"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h2 className="font-medium text-white">
                    {selectedConversation.name}
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

          {/* More Options Sheet */}
          <Sheet>
            <SheetTrigger asChild disabled={!selectedConversation}>
              <Button
                variant="ghost"
                size="icon"
                className="text-slate-400 hover:text-white disabled:opacity-50"
              >
                <MoreVertical className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent className="bg-slate-800 border-slate-700 text-white">
              <div className="space-y-4 py-4">
                <div className="flex flex-col items-center gap-2 pb-4 border-b border-slate-700">
                  <Avatar className="h-20 w-20">
                    <AvatarImage
                      src={selectedConversation?.avatar || "/placeholder.svg"}
                      alt={selectedConversation?.name}
                    />
                    <AvatarFallback className="bg-emerald-500 text-white text-xl">
                      {selectedConversation?.name
                        ?.split(" ")
                        .map((n) => n[0])
                        .join("") || "??"}
                    </AvatarFallback>
                  </Avatar>
                  <h3 className="text-xl font-bold">
                    {selectedConversation?.name}
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
                    <Button
                      variant="ghost"
                      className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-900/20"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Delete Conversation
                    </Button>
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>
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
                      <p>{message.content}</p>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 ${message.isSelf ? 'text-left' : 'text-right'}">
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
                !newMessage.trim() ||
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
        </div>
      </div>
    </div>
  );
}
