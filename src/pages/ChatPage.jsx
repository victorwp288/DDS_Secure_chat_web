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
import { useSignal } from "../SignalContext";
import {
  encryptMessage,
  decryptMessage,
  arrayBufferToString,
  buildSession,
  buf2hex,
  ensureIdentity,
  hexToUint8Array,
} from "../lib/signalUtils";
import { SignalProtocolAddress } from "@privacyresearch/libsignal-protocol-typescript";
import { get } from "../lib/backend";
import { cacheSentMessage, getCachedMessageContent } from "../lib/db"; // Import Dexie helpers

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

// Helper function to convert Base64 string to ArrayBuffer
function base64ToArrayBuffer(base64) {
  if (!base64) {
    console.warn("[base64ToArrayBuffer] Received null or empty input.");
    return null;
  }
  try {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  } catch (e) {
    console.error(
      "[base64ToArrayBuffer] Failed to decode Base64 string:",
      e,
      "Input:",
      base64
    );
    return null; // Indicate failure
  }
}

// Helper function to convert ArrayBuffer to Base64 string (useful for sending/storing if not using hex)
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

export default function ChatPage() {
  console.log("--- ChatPage Component Rendering ---");

  const { signalStore } = useSignal();
  // --- State Variables ---
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

  // 👇 Log messages state on each render
  console.log("[render] messages state length =", messages.length, messages);

  const isMobile = useMobile();
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);

  // --- Helper Functions ---
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // --- Effects ---

  // 1. Get current user and profile
  useEffect(() => {
    const fetchUserAndProfile = async () => {
      console.log("[Effect 1] Running fetchUserAndProfile...");
      setLoadingConversations(true); // Keep loading conversations true initially

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      console.log("[Effect 1] Session data:", session);
      console.error("[Effect 1] Session error:", sessionError);

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

      console.log("[Effect 1] User found:", session.user);
      setCurrentUser(session.user);

      // --- Ensure identity keys exist BEFORE fetching profile --- START ---
      try {
        console.log("[Effect 1] Ensuring Signal identity...");
        await ensureIdentity(session.user.id); // <-- Pass user ID here
        console.log("[Effect 1] Signal identity ensured.");
      } catch (identityError) {
        console.error(
          "[Effect 1] Failed to ensure Signal identity:",
          identityError
        );
        setError(
          `Failed to initialize secure session keys: ${identityError.message}`
        );
        setLoadingConversations(false);
        // Optionally, clear stored keys if initialization failed halfway?
        // await signalStore.clearAllData(); // USE WITH CAUTION!
        return; // Stop if identity cannot be ensured
      }
      // --- Ensure identity keys exist BEFORE fetching profile --- END ---

      // Fetch profile details
      console.log("[Effect 1] Fetching profile for user ID:", session.user.id);
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url, status") // Select id as well
        .eq("id", session.user.id)
        .single();

      console.log("[Effect 1] Profile fetch result:", {
        profileData,
        profileError,
      });

      if (profileError && profileError.code !== "PGRST116") {
        // PGRST116: Row not found, might be acceptable if profile creation is separate
        console.error("Error fetching profile:", profileError);
        setError(`Failed to load user profile: ${profileError.message}`);
        // Don't set profile, let subsequent effects handle null profile
      } else if (!profileData) {
        console.warn("[Effect 1] Profile not found for user:", session.user.id);
        setError("User profile not found. Please complete profile setup."); // More specific error
        // Don't set profile
      } else {
        console.log("[Effect 1] Setting profile state:", profileData);
        setProfile(profileData); // Set profile state successfully
        setError(null); // Clear any previous errors if profile loads
      }
      // setLoadingConversations(false); // Keep loading true until conversations are attempted
    };

    fetchUserAndProfile();
  }, [navigate]);

  // 2. Fetch conversations once user profile is loaded
  useEffect(() => {
    console.log("[Effect 2] Checking profile state:", profile);
    if (!profile?.id) {
      console.log(
        "[Effect 2] No profile ID found, skipping conversation fetch."
      );
      // If profile loading previously failed, we need to stop the main loading indicator
      if (!loadingConversations && !profile) {
        setLoadingConversations(false); // Ensure loading stops if profile never loads
      }
      return;
    }
    const fetchConversations = async () => {
      setLoadingConversations(true);
      console.log("Fetching conversations for profile:", profile.id);
      try {
        // Fetch conversation IDs the user is part of
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

        // Fetch details for these conversations and their participants
        // This query is more complex: get conversation, its participants, and their profiles
        // Adjust based on performance needs (might need separate queries or a DB function)
        const { data: convData, error: convError } = await supabase
          .from("conversations")
          .select(
            `
            id,
            created_at,
            conversation_participants(
              profile_id,
              profiles(id, username, full_name, avatar_url, status)
            )
          `
          )
          .in("id", conversationIds);

        if (convError) throw convError;

        console.log("Fetched raw conversation data:", convData);
        const formattedConversations = convData.map((conv) => {
          const participants = conv.conversation_participants.map(
            (p) => p.profiles
          );
          // Find the other participant(s) for naming/avatar
          const otherParticipant =
            participants.find((p) => p.id !== profile.id) || participants[0];
          const name =
            otherParticipant?.full_name ||
            otherParticipant?.username ||
            "Unknown User";
          const avatar = otherParticipant?.avatar_url;
          // TODO: Fetch last message and time (requires another query or denormalization)
          return {
            id: conv.id,
            name: name,
            lastMessage: "...",
            time: "",
            unread: 0,
            avatar: avatar,
            participants: participants,
          };
        });
        console.log("Formatted conversations:", formattedConversations);

        setConversations(formattedConversations);
        if (!selectedConversation && formattedConversations.length > 0) {
          console.log(
            "Setting selected conversation to first one:",
            formattedConversations[0]
          );
          setSelectedConversation(formattedConversations[0]);
        } else if (formattedConversations.length === 0) {
          console.log("No conversations found for this user.");
          setSelectedConversation(null); // Ensure it's null if none found
        }
      } catch (fetchError) {
        console.error("Error fetching conversations:", fetchError);
        setError("Failed to load conversations.");
      } finally {
        console.log(
          "Finished fetching conversations, setting loadingConversations to false."
        );
        setLoadingConversations(false);
      }
    };

    fetchConversations();
  }, [profile?.id]); // Removed selectedConversation dependency for clarity

  // 3. Fetch messages when selectedConversation changes
  useEffect(() => {
    if (!selectedConversation?.id || !currentUser?.id || !signalStore) {
      setMessages([]); // Clear messages if no conversation selected or signal not ready
      return;
    }

    // --- Define Recipient Info --- //
    // Find the other participant in the selected conversation
    const recipientParticipant = selectedConversation.participants.find(
      (p) => p.id !== currentUser.id
    );

    if (!recipientParticipant) {
      console.error(
        "Could not find recipient participant in conversation:",
        selectedConversation
      );
      setError("Error identifying recipient in this conversation.");
      setMessages([]);
      setLoadingMessages(false);
      return;
    }

    const recipientId = recipientParticipant.id;
    // Assuming deviceId is always 1 for now
    const deviceId = 1;
    const recipientAddress = new SignalProtocolAddress(recipientId, deviceId);
    const recipientAddressString = recipientAddress.toString();
    console.log(`[Effect 3] Target recipient: ${recipientAddressString}`);

    const fetchMessagesAndEnsureSession = async () => {
      setLoadingMessages(true);
      setError(null); // Clear previous errors

      try {
        // --- Ensure local identity keys exist --- START ---
        const localKeys = await ensureIdentity(); // Call the helper
        if (!localKeys) {
          throw new Error("Failed to ensure local Signal identity keys exist.");
        }
        // --- Ensure local identity keys exist --- END ---

        // --- Check for existing session with PEER --- //
        console.log(
          `[Effect 3] Checking for existing session with ${recipientAddressString}...`
        );
        const existingSession = await signalStore.loadSession(
          recipientAddressString
        );

        // --- Log the loaded session --- START
        if (existingSession) {
          console.log(
            `[Effect 3] Deserialized existing session for ${recipientAddressString}:`,
            existingSession
          );
        } else {
          console.log(
            `[Effect 3] No existing session found for ${recipientAddressString} after load attempt.`
          );
        }
        // --- Log the loaded session --- END

        // If no session exists here, decryption of the first PreKeyWhisperMessage
        // should establish it implicitly. If the first message is *not* a prekey message
        // and no session exists, decryption *will* fail, which is expected.
        console.log(
          `[Effect 3] Proceeding to fetch and decrypt messages for convo ${selectedConversation.id}...`
        );

        // --- Fetch Messages (Now that session is guaranteed to exist) --- //
        console.log(
          `[Effect 3] Fetching messages for convo: ${selectedConversation.id}`
        );
        const { data, error: messagesError } = await supabase
          .from("messages")
          .select(
            `
            id,
            body, 
            type, 
            created_at,
            profile_id,
            profiles ( id, full_name, username, avatar_url )
          `
          )
          .eq("conversation_id", selectedConversation.id)
          .order("created_at", { ascending: true });

        if (messagesError) throw messagesError;
        console.log(`[Effect 3] Fetched ${data.length} raw messages.`);

        // Decrypt messages using a sequential loop
        const decryptedMessages = [];
        for (const msg of data) {
          let processedContent = null; // <- Moved declaration to the top of the loop

          // --- Skip reprocessing PreKey messages if session exists --- //
          if (msg.type === 3 && existingSession) {
            console.log(
              `[Effect 3] Skipping already processed PreKeyWhisperMessage (type 3) msgId: ${msg.id}`
            );
            // We need the original content for the UI. Fetch from cache or show placeholder.
            // Let's try fetching from cache, assuming it was cached on first receipt/send.
            const cachedContent = await getCachedMessageContent(msg.id);
            if (cachedContent) {
              processedContent = cachedContent; // Now safe to assign
              // Need to construct the messageForUI here as well if cached
              const senderProfile = msg.profiles;
              const timestamp = msg.created_at
                ? new Date(msg.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "";
              const messageForUI = {
                id: msg.id,
                senderId: senderProfile?.id || msg.profile_id,
                senderName:
                  senderProfile?.full_name ||
                  senderProfile?.username ||
                  (msg.profile_id === currentUser.id ? "Me" : "Unknown User"),
                senderAvatar: senderProfile?.avatar_url,
                content: processedContent,
                timestamp: timestamp,
                isSelf: msg.profile_id === currentUser.id,
              };
              decryptedMessages.push(messageForUI);
            } else {
              console.warn(
                `[Effect 3] PreKey msg ${msg.id} skipped, but no cached content found. Message will be missing from UI.`
              );
            }
            continue; // Move to the next message
          }
          // --- End Skip --- //

          const senderProfile = msg.profiles; // Assuming profiles relation works
          const timestamp = msg.created_at
            ? new Date(msg.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "";

          console.log(
            `[Effect 3] Processing message ${msg.id}, sender: ${msg.profile_id}, current user: ${currentUser.id}`
          );

          if (msg.profile_id === currentUser.id) {
            // Message is from the current user (self-sent)
            console.log(
              `[Effect 3] Message ${msg.id} is self-sent. Checking cache.`
            );
            const cachedContent = await getCachedMessageContent(msg.id);
            console.log(
              `[Effect 3] Cache result for ${msg.id}: ${cachedContent}`
            );
            processedContent = cachedContent ?? "[Self, uncached]"; // Assign content
          } else {
            // Message is from the peer
            console.log(
              `[Effect 3] Message ${msg.id} is from peer. Attempting decryption.`
            );
            // const rawHexBody = msg.body; // Old name, was hex

            // Assume msg.body is \x... hex string from Supabase
            const dbHexString = msg.body;
            console.log(
              `[Effect 3] Received msg.body (expected \\x... string):`,
              typeof dbHexString === "string"
                ? dbHexString.substring(0, 50) + "..."
                : dbHexString
            );

            // Convert \x... hex string to Uint8Array for decryptMessage
            let bodyUint8Array;
            try {
              bodyUint8Array = hexToUint8Array(dbHexString);
            } catch (conversionError) {
              console.error(
                `[Effect 3] Failed to convert received hex string body to Uint8Array for msg ${msg.id}:`,
                conversionError
              );
              processedContent = "[Body Hex Conversion Error]";
              continue; // Skip this message
            }

            // ─── DEBUG: what are we about to decrypt? ───────────────────────────
            const rawRX = bodyUint8Array; // Already have this from hexToUint8Array
            try {
              console.log(
                `[DBG-RX] about-to-decrypt (Fetch) type=${msg.type}  len=${rawRX.byteLength}`,
                `sha256=${await crypto.subtle
                  .digest("SHA-256", rawRX)
                  .then((buf) =>
                    [...new Uint8Array(buf)]
                      .map((b) => b.toString(16).padStart(2, "0"))
                      .join("")
                  )}`,
                `(msgId: ${msg.id})` // Include the actual message ID
              );
            } catch (dbgError) {
              console.error(
                "[DBG-RX] Error logging debug info (Fetch):",
                dbgError
              );
            }
            // ─── END DEBUG ───────────────────────────────────────────────────────────

            try {
              const plaintextBuffer = await decryptMessage(
                signalStore,
                currentUser.id, // Recipient ID (current user)
                msg.profile_id, // Sender ID (peer)
                1, // Sender's device ID (assuming 1)
                { type: msg.type, body: bodyUint8Array } // Pass Uint8Array body
              );

              if (plaintextBuffer) {
                processedContent = arrayBufferToString(plaintextBuffer); // Assign content
                console.log(
                  `[Effect 3] Decrypted msg ${
                    msg.id
                  }: "${processedContent.substring(0, 20)}..."`
                );
              } else {
                console.warn(
                  `[Effect 3] Decryption returned null for msg ${msg.id}. Skipping.`
                );
                continue; // Skip this message iteration
              }
            } catch (decryptionError) {
              console.error(
                `[Effect 3] Decryption failed for msg ${msg.id}:`,
                decryptionError
              );
              processedContent = "[Decryption Error]";
              continue; // Skip adding this message to the UI
            }
          }

          // --- Construct the final message object for UI --- //
          if (processedContent !== null) {
            // Only add if content was successfully processed (cached or decrypted)
            const messageForUI = {
              id: msg.id,
              senderId: senderProfile?.id || msg.profile_id,
              senderName:
                senderProfile?.full_name ||
                senderProfile?.username ||
                (msg.profile_id === currentUser.id ? "Me" : "Unknown User"),
              senderAvatar: senderProfile?.avatar_url,
              content: processedContent, // Use the processed content
              timestamp: timestamp,
              isSelf: msg.profile_id === currentUser.id,
            };
            decryptedMessages.push(messageForUI);
          }
        } // End for...of loop

        console.log(
          `[Effect 3] Setting ${decryptedMessages.length} processed messages.`
        );
        setMessages(decryptedMessages); // Set the array of processed messages
      } catch (err) {
        console.error(
          "[Effect 3] Error in fetchMessagesAndEnsureSession:",
          err
        );
        setError(
          `Failed to load messages or establish session: ${err.message}`
        );
        setMessages([]); // Clear messages on error
      } finally {
        setLoadingMessages(false);
      }
    };

    fetchMessagesAndEnsureSession(); // Call the async function

    // Dependency array: Fetch when conversation, user, or signalStore changes
  }, [selectedConversation?.id, currentUser?.id, signalStore]); // Added signalStore

  // 4. Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 5. Realtime subscription for new messages
  useEffect(() => {
    if (!selectedConversation?.id || !currentUser?.id) {
      // If no conversation selected, remove any existing subscription
      if (messageSubscription) {
        supabase.removeChannel(messageSubscription);
        setMessageSubscription(null);
      }
      return;
    }

    // Define the message handler
    const handleNewMessage = async (payload) => {
      console.log("[Realtime] handleNewMessage triggered:", payload);

      // Fetch sender profile for the new message
      console.log("[Realtime] Raw payload.new object:", payload.new); // Log payload.new

      // --- Defensively check payload structure --- START
      if (
        !payload ||
        !payload.new ||
        payload.new.profile_id === undefined ||
        payload.new.conversation_id === undefined ||
        !payload.new.body // Add check for body presence
      ) {
        console.error(
          "[Realtime] Invalid or incomplete payload structure received:",
          payload
        );
        return;
      }
      // --- Defensively check payload structure --- END

      // --- Ignore messages sent by the current user --- //
      if (payload.new.profile_id === currentUser?.id) {
        console.log(
          "[Realtime] Ignoring own message received via subscription."
        );
        return;
      }
      // --- End Ignore --- //

      // Check if it belongs to the current conversation (extra safety)
      if (payload.new.conversation_id !== selectedConversation.id) {
        console.log(
          "[Realtime] Message is for a different conversation, skipping."
        );
        return;
      }

      // Avoid adding duplicates if message already exists (e.g., from initial fetch)
      if (messages.some((msg) => msg.id === payload.new.id)) {
        console.log("[Realtime] Duplicate message detected, skipping.");
        return;
      }

      // Fetch sender profile for the new message
      const { data: senderProfile, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, username, avatar_url")
        .eq("id", payload.new.profile_id)
        .single();

      if (profileError) {
        console.error("Error fetching profile for new message:", profileError);
        // Optionally handle the error, maybe display message with 'Unknown Sender'
        return;
      }

      console.log(`[Realtime] Fetched sender profile:`, senderProfile);

      // Assume payload.new.body is \x... hex string from Supabase
      const dbHexString = payload.new.body;
      console.log(
        `[Realtime] Received payload.new.body (expected \\x... string):`,
        typeof dbHexString === "string"
          ? dbHexString.substring(0, 50) + "..."
          : dbHexString
      );

      // Convert \x... hex string to Uint8Array for decryptMessage
      let bodyUint8Array;
      try {
        bodyUint8Array = hexToUint8Array(dbHexString);
      } catch (conversionError) {
        console.error(
          `[Realtime] Failed to convert received hex string body to Uint8Array for msg ${payload.new.id}:`,
          conversionError
        );
        return; // Skip processing
      }

      // ─── DEBUG: what are we about to decrypt? ───────────────────────────
      const rawRX = bodyUint8Array; // Already have this from hexToUint8Array
      try {
        console.log(
          `[DBG-RX] about-to-decrypt (Realtime) type=${payload.new.type}  len=${rawRX.byteLength}`,
          `sha256=${await crypto.subtle
            .digest("SHA-256", rawRX)
            .then((buf) =>
              [...new Uint8Array(buf)]
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("")
            )}`,
          `(msgId: ${payload.new.id})` // Include the actual message ID
        );
      } catch (dbgError) {
        console.error(
          "[DBG-RX] Error logging debug info (Realtime):",
          dbgError
        );
      }
      // ─── END DEBUG ───────────────────────────────────────────────────────────

      const ciphertextForDecryption = {
        type: payload.new.type,
        body: bodyUint8Array, // Pass Uint8Array
      };

      console.log(
        `[Realtime] Passing ciphertext object to decryptMessage for msg ${payload.new.id}:`,
        ciphertextForDecryption // Logging the object which now contains Uint8Array
      );

      const plaintextBuffer = await decryptMessage(
        signalStore,
        currentUser.id, // Recipient
        payload.new.profile_id, // Sender
        1, // Sender device ID (assuming 1)
        ciphertextForDecryption // Pass object with Uint8Array body
      );

      if (!plaintextBuffer) {
        console.warn(
          `[Realtime] Decryption returned null for msg ${payload.new.id}. Skipping.`
        );
        return; // Skip if decryption failed or returned null
      }
      const plaintext = arrayBufferToString(plaintextBuffer); // Convert result to string

      // 3) substitute decrypted text into UI object
      const formatted = {
        id: payload.new.id,
        senderId: senderProfile.id,
        senderName: senderProfile.full_name || senderProfile.username,
        senderAvatar: senderProfile.avatar_url,
        content: plaintext,
        timestamp: new Date(payload.new.created_at).toLocaleTimeString(),
        isSelf: senderProfile.id === currentUser.id,
      };
      if (formatted) {
        console.log("[Realtime] Adding formatted message to state:", formatted);
        setMessages((prevMessages) => [...prevMessages, formatted]);
      } else {
        console.warn(
          "[Realtime] Failed to format message payload:",
          payload.new
        );
      }
    };

    // Create a new channel for the selected conversation
    const channel = supabase
      .channel(`messages:${selectedConversation.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${selectedConversation.id}`, // Filter for current conversation
        },
        handleNewMessage
      )
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          console.log(
            `Subscribed to messages for conversation ${selectedConversation.id}`
          );
        } else if (status === "CHANNEL_ERROR") {
          console.error("Realtime channel error:", err);
          setError("Realtime connection error. Please refresh.");
        } else if (status === "TIMED_OUT") {
          console.warn("Realtime connection timed out.");
        }
      });

    setMessageSubscription(channel); // Store the channel

    // Cleanup function: Remove the channel subscription when conversation changes or component unmounts
    return () => {
      if (channel) {
        console.log(
          `Unsubscribing from messages for conversation ${selectedConversation.id}`
        );
        supabase.removeChannel(channel);
        setMessageSubscription(null);
      }
    };
  }, [selectedConversation?.id, currentUser?.id]); // Re-subscribe ONLY if conversation or user changes

  // Filter conversations based on search query
  const filteredConversations = conversations.filter((conv) =>
    conv.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSendMessage = async () => {
    if (
      !newMessage.trim() ||
      !selectedConversation ||
      !currentUser ||
      !signalStore
    )
      return;

    const content = newMessage.trim();
    const conversationId = selectedConversation.id;
    const profileId = currentUser.id;

    console.log(
      `[SendMessage] Attempting to send: "${content}" to convo ${conversationId}`
    );

    setNewMessage("");

    try {
      // --- Make sure we have a session with the peer before encrypting ---
      const peer = selectedConversation.participants.find(
        (p) => p.id !== profileId
      );
      const addr = new SignalProtocolAddress(peer.id, 1);
      const have = await signalStore.loadSession(addr.toString());

      if (!have) {
        console.log(
          "[SendMessage] No session found, fetching bundle and building..."
        );
        const bundleData = await get(`/api/signal/bundle/${peer.id}`);

        if (!bundleData) {
          throw new Error(`Failed to fetch pre-key bundle for peer ${peer.id}`);
        }

        // Validate required fields in bundleData
        if (
          bundleData.registrationId === undefined ||
          !bundleData.identityKey ||
          bundleData.signedPreKeyId === undefined ||
          !bundleData.signedPreKeyPublicKey ||
          !bundleData.signedPreKeySignature ||
          bundleData.preKeyId === undefined ||
          !bundleData.preKeyPublicKey
        ) {
          console.error(
            "[SendMessage] Incomplete pre-key bundle received:",
            bundleData
          );
          throw new Error("Received incomplete pre-key bundle from server.");
        }

        const identityKeyBuffer = base64ToArrayBuffer(bundleData.identityKey);
        const signedPreKeyPublicKeyBuffer = base64ToArrayBuffer(
          bundleData.signedPreKeyPublicKey
        );
        const signedPreKeySignatureBuffer = base64ToArrayBuffer(
          bundleData.signedPreKeySignature
        );
        const preKeyPublicKeyBuffer = base64ToArrayBuffer(
          bundleData.preKeyPublicKey
        );

        // Validate conversions
        if (
          !identityKeyBuffer ||
          !signedPreKeyPublicKeyBuffer ||
          !signedPreKeySignatureBuffer ||
          !preKeyPublicKeyBuffer
        ) {
          console.error(
            "[SendMessage] Failed to convert one or more bundle keys from Base64:",
            bundleData
          );
          throw new Error("Failed to process pre-key bundle data.");
        }

        const preKeyBundle = {
          registrationId: bundleData.registrationId,
          identityKey: identityKeyBuffer,
          signedPreKey: {
            keyId: bundleData.signedPreKeyId,
            publicKey: signedPreKeyPublicKeyBuffer,
            signature: signedPreKeySignatureBuffer,
          },
          preKey: {
            keyId: bundleData.preKeyId,
            publicKey: preKeyPublicKeyBuffer,
          },
        };

        await buildSession(signalStore, peer.id, 1, preKeyBundle);
        console.log("[SendMessage] → fresh session built for peer");
      }
      // --------------------------------------------------------------------

      // Wrap encryption and send in a try/catch for identity key errors
      try {
        // 1) Convert string to Uint8Array and encrypt locally
        const plaintextBytes = new TextEncoder().encode(content);
        let ct = await encryptMessage(
          signalStore,
          peer.id,
          1,
          plaintextBytes.buffer
        );
        console.log(
          "[SendMessage] Initial encryption done (Type:",
          ct.type,
          "Body Length:",
          ct.body?.length || 0,
          ")"
        );

        // Prepare data for DB insertion
        const bodyUint8Array = Uint8Array.from(ct.body, (c) => c.charCodeAt(0));
        const hexBody = buf2hex(bodyUint8Array);
        const pgByteaLiteral = `\\x${hexBody}`;

        // 🟢 HASH LOGGING (TX side) ... // Keep existing A, B, C logs
        const binBody = ct.body;
        try {
          await crypto.subtle
            .digest(
              "SHA-256",
              Uint8Array.from(binBody, (c) => c.charCodeAt(0))
            )
            .then((h) => console.log("[TX-A  SHA256]:", buf2hex(h)));
        } catch (e) {
          console.error("TX-A Hash Error:", e);
        }
        try {
          await crypto.subtle
            .digest("SHA-256", bodyUint8Array)
            .then((h) => console.log("[TX-B  SHA256]:", buf2hex(h)));
        } catch (e) {
          console.error("TX-B Hash Error:", e);
        }
        try {
          const testRound = hexToUint8Array(pgByteaLiteral);
          await crypto.subtle
            .digest("SHA-256", testRound)
            .then((h) => console.log("[TX-C  SHA256]:", buf2hex(h)));
        } catch (e) {
          console.error("TX-C Hash Error:", e);
        }
        // 🟢 END HASH LOGGING

        // Insert into DB
        const { data: insertedData, error: insertError } = await supabase
          .from("messages")
          .insert({
            conversation_id: conversationId,
            profile_id: profileId,
            type: ct.type,
            body: pgByteaLiteral,
          })
          .select();

        if (insertError) throw insertError; // Let the outer catch handle DB errors initially

        console.log(
          "[SendMessage] Message insert successful after initial attempt.",
          insertedData
        );
        // Handle successful UI update (copied from outer scope)
        setError(null);
        const newMessageForUI = {
          id: insertedData[0].id,
          senderId: profileId,
          senderName: profile?.full_name || profile?.username || "Me",
          senderAvatar: profile?.avatar_url,
          content: content,
          timestamp: new Date(insertedData[0].created_at).toLocaleTimeString(
            [],
            {
              hour: "2-digit",
              minute: "2-digit",
            }
          ),
          isSelf: true,
        };
        setMessages((prevMessages) => [...prevMessages, newMessageForUI]);
        await cacheSentMessage({ ...newMessageForUI, conversationId });
      } catch (err) {
        // Check for the specific identity key changed error
        if (
          err instanceof Error &&
          err.message?.includes("Identity key changed")
        ) {
          console.warn(
            "[SendMessage] Peer identity changed – wiping session & identity, rebuilding, and retrying send..."
          );

          const addr = new SignalProtocolAddress(peer.id, 1);
          const addrString = addr.toString();

          try {
            // Ditch old session and identity
            await signalStore.removeSession(addrString);
            await signalStore.removeIdentity(addrString);
            console.log(
              `[SendMessage] Removed session and identity for ${addrString}`
            );

            // Fetch fresh bundle
            console.log(
              `[SendMessage] Fetching fresh bundle for ${peer.id}...`
            );
            const bundleData = await get(`/api/signal/bundle/${peer.id}`);
            if (!bundleData) {
              throw new Error(
                `Retry failed: Could not fetch fresh bundle for peer ${peer.id}`
              );
            }
            console.log(`[SendMessage] Fetched fresh bundle.`);

            // Convert bundle data to PreKeyBundle format (inline toPreKeyBundle logic)
            const identityKeyBuffer = base64ToArrayBuffer(
              bundleData.identityKey
            );
            const signedPreKeyPublicKeyBuffer = base64ToArrayBuffer(
              bundleData.signedPreKeyPublicKey
            );
            const signedPreKeySignatureBuffer = base64ToArrayBuffer(
              bundleData.signedPreKeySignature
            );
            const preKeyPublicKeyBuffer = base64ToArrayBuffer(
              bundleData.preKeyPublicKey
            );

            if (
              !identityKeyBuffer ||
              !signedPreKeyPublicKeyBuffer ||
              !signedPreKeySignatureBuffer ||
              !preKeyPublicKeyBuffer
            ) {
              throw new Error(
                "Retry failed: Failed to convert keys/signatures from Base64 in the fresh bundle."
              );
            }

            const preKeyBundle = {
              registrationId: bundleData.registrationId,
              identityKey: identityKeyBuffer,
              signedPreKey: {
                keyId: bundleData.signedPreKeyId,
                publicKey: signedPreKeyPublicKeyBuffer,
                signature: signedPreKeySignatureBuffer,
              },
              preKey: {
                keyId: bundleData.preKeyId,
                publicKey: preKeyPublicKeyBuffer,
              },
            };

            // Build brand-new session
            console.log(
              `[SendMessage] Building fresh session with ${addrString}...`
            );
            await buildSession(signalStore, peer.id, 1, preKeyBundle);
            console.log(`[SendMessage] Fresh session built.`);

            // --- 🔁 RETRY the send once ---
            console.log("[SendMessage] Retrying encryption...");
            const plaintextBytesRetry = new TextEncoder().encode(content);
            const ctRetry = await encryptMessage(
              signalStore,
              peer.id,
              1,
              plaintextBytesRetry.buffer
            );
            console.log(
              "[SendMessage] Retry encryption done (Type:",
              ctRetry.type,
              "Body Length:",
              ctRetry.body?.length || 0,
              ")"
            );

            // Prepare data for DB insertion (Retry)
            const bodyUint8ArrayRetry = Uint8Array.from(ctRetry.body, (c) =>
              c.charCodeAt(0)
            );
            const hexBodyRetry = buf2hex(bodyUint8ArrayRetry);
            const pgByteaLiteralRetry = `\\x${hexBodyRetry}`;

            // TODO: Maybe add retry hash logs if needed?

            // Insert into DB (Retry)
            console.log("[SendMessage] Retrying database insert...");
            const { data: insertedDataRetry, error: insertErrorRetry } =
              await supabase
                .from("messages")
                .insert({
                  conversation_id: conversationId,
                  profile_id: profileId,
                  type: ctRetry.type,
                  body: pgByteaLiteralRetry,
                })
                .select();

            if (insertErrorRetry) {
              console.error(
                "[SendMessage] Database insert failed on retry:",
                insertErrorRetry
              );
              throw insertErrorRetry; // Throw retry error
            }

            console.log(
              "[SendMessage] Message insert successful after retry.",
              insertedDataRetry
            );
            // Handle successful UI update (Retry - copied again)
            setError(null);
            const newMessageForUIRetry = {
              id: insertedDataRetry[0].id,
              senderId: profileId,
              senderName: profile?.full_name || profile?.username || "Me",
              senderAvatar: profile?.avatar_url,
              content: content,
              timestamp: new Date(
                insertedDataRetry[0].created_at
              ).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
              isSelf: true,
            };
            setMessages((prevMessages) => [
              ...prevMessages,
              newMessageForUIRetry,
            ]);
            await cacheSentMessage({ ...newMessageForUIRetry, conversationId });
          } catch (retryError) {
            console.error(
              "[SendMessage] Error during identity change handling/retry:",
              retryError
            );
            setError(
              `Failed to send message after identity change: ${retryError.message}`
            );
            // Don't re-throw here, error is handled
          }
        } else {
          // Re-throw other errors (not identity key changed)
          console.error(
            "[SendMessage] Non-identity error during encryption/send:",
            err
          );
          throw err;
        }
      }
    } catch (err) {
      // Catch errors from the initial setup OR re-thrown errors from the inner catch
      console.error("[SendMessage] Final catch block error:", err);
      setError(`Failed to send message: ${err.message}`);
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

  if (loadingConversations && !profile) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900 text-white">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900 text-red-400">
        Error: {error}
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-900">
      {/* Sidebar - Chat List */}
      {!isMobile || isMobileMenuOpen ? (
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
                {filteredConversations.map((conv) => (
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
      ) : null}

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
              onChange={(e) => {
                console.log("Input Disabled Status:", {
                  hasSelected: !!selectedConversation,
                  isLoading: loadingConversations,
                });
                setNewMessage(e.target.value);
              }}
              disabled={!selectedConversation || loadingConversations}
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
                loadingConversations
              }
            >
              <Send className="h-5 w-5" />
            </Button>
          </form>
          {showEmojiPicker && (
            <div className="absolute bottom-24 right-8 z-50">
              <EmojiPicker
                onEmojiClick={(emojiData) => {
                  setNewMessage((prev) => prev + emojiData.emoji);
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
