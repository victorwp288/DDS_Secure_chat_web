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
import { post } from "../lib/backend"; // <-- Import post helper
import { db } from "../lib/db"; // <-- Import Dexie db instance

export default function ChatPage() {
  console.log("--- ChatPage Component Rendering ---");
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
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef();

  const isMobile = useMobile();
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);

  // --- Helper Functions ---
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Format Supabase message to UI structure
  const formatMessage = (msg) => {
    if (!msg || !msg.profiles) {
      console.warn("Attempted to format invalid message:", msg);
      return null; // Or return a default structure
    }
    const senderProfile = msg.profiles;
    const timestamp = msg.created_at
      ? new Date(msg.created_at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
    return {
      id: msg.id,
      senderId: senderProfile.id, // Keep sender ID
      senderName:
        senderProfile.full_name || senderProfile.username || "Unknown User",
      senderAvatar: senderProfile.avatar_url,
      content: msg.content,
      timestamp: timestamp,
      isSelf: senderProfile.id === currentUser?.id,
      isEncrypted: msg.is_encrypted, // Pass flag for potential UI indicators
      originalCiphertextType: msg.encryption_header?.type, // Pass original type if needed
    };
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

  // 3. Fetch messages when selectedConversation changes - UPDATED FOR INDEXEDDB + Rehydration
  useEffect(() => {
    if (!selectedConversation?.id || !currentUser?.id) {
      setMessages([]); // Clear messages if no conversation selected
      return;
    }

    let isMounted = true; // Flag to prevent state updates on unmounted component
    setLoadingMessages(true);
    setError(null);
    console.log(
      `[Effect 3 - Combined] Loading messages for convo ${selectedConversation.id}`
    );

    // Helper to format messages loaded from IndexedDB
    const formatLocalMessage = (localMsg) => ({
      id: localMsg.id,
      senderId: localMsg.senderId,
      senderName: localMsg.senderName,
      senderAvatar: localMsg.senderAvatar,
      content: localMsg.content, // Content is already plaintext
      timestamp: new Date(localMsg.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }), // Format timestamp for display
      isSelf: localMsg.senderId === currentUser.id, // Re-calculate isSelf based on current user
    });

    const loadAndRehydrateMessages = async () => {
      try {
        // --- Step 1: Load existing messages from IndexedDB ---
        let localMessages = await db.messages
          .where("conversationId")
          .equals(selectedConversation.id)
          .toArray();

        // Purge any that are empty *or* the initial-session placeholder
        localMessages = await Promise.all(
          localMessages.map(async (m) => {
            const shouldPurge =
              !m.content.trim() || m.content === "(initial session packet)";
            if (shouldPurge) {
              await db.messages.delete(m.id);
              console.log(`Purged message ${m.id} from IndexedDB`);
              return null;
            }
            return m;
          })
        ).then((arr) => arr.filter(Boolean));

        // Sort by timestamp
        localMessages.sort(
          (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
        );

        if (!isMounted) return;

        console.log(
          `[Effect 3 - DB] Using ${localMessages.length} clean messages locally.`
        );
        setMessages(localMessages.map(formatLocalMessage));

        // --- Step 2: Fetch ALL messages from Supabase to find missing ones ---
        console.log(
          `[Effect 3 - Supa] Fetching all messages from Supabase for potential rehydration.`
        );
        const { data: supabaseMessages, error: messagesError } = await supabase
          .from("messages")
          .select(
            `
            id,
            conversation_id,
            content,
            created_at,
            profile_id,
            is_encrypted,
            encryption_header,
            profiles ( id, full_name, username, avatar_url )
          `
          )
          .eq("conversation_id", selectedConversation.id)
          .order("created_at", { ascending: true });

        if (messagesError) throw messagesError;
        if (!isMounted) return;

        console.log(
          `[Effect 3 - Supa] Fetched ${supabaseMessages.length} raw messages from Supabase.`
        );

        // --- Step 3: Identify and decrypt messages NOT already in IndexedDB ---
        const localIds = new Set(localMessages.map((m) => m.id));
        const messagesToProcess = supabaseMessages.filter(
          (supaMsg) =>
            supaMsg.profile_id !== currentUser.id && // from someone else
            !localIds.has(supaMsg.id) // not already stored
        );

        console.log(
          `[Effect 3 - Decrypt] Found ${messagesToProcess.length} missing/undecrypted messages.`
        );

        if (messagesToProcess.length === 0) {
          console.log("No messages to process.");
          return;
        }

        if (messagesToProcess.length > 0) {
          for (const msg of messagesToProcess) {
            let plaintext = msg.content;

            // *only* decrypt if it's still marked encrypted
            if (msg.is_encrypted) {
              try {
                const { plaintext: p } = await post("/api/messages/decrypt", {
                  recipient_id: currentUser.id,
                  sender_id: msg.profile_id,
                  header_b64: msg.encryption_header,
                  ciphertext_b64: msg.content,
                });
                plaintext = p;
              } catch (err) {
                console.warn(`Failed to decrypt ${msg.id}, skipping:`, err);
                continue; // or set plaintext = "[decryption error]" if you prefer
              }
            }
            if (!plaintext.trim()) {
              console.log(`Skipping empty/handshake message ${msg.id}`);
              continue;
            }
            const toStore = {
              id: msg.id,
              conversationId: msg.conversation_id,
              senderId: msg.profile_id,
              senderName:
                msg.profiles?.full_name || msg.profiles?.username || "Unknown",
              senderAvatar: msg.profiles?.avatar_url,
              content: plaintext,
              timestamp: new Date(msg.created_at).toISOString(),
            };

            await db.messages.put(toStore);

            if (!isMounted) break;

            setMessages((prev) => {
              const formatted = {
                id: toStore.id,
                senderId: toStore.senderId,
                senderName: toStore.senderName,
                senderAvatar: toStore.senderAvatar,
                content: toStore.content,
                timestamp: new Date(toStore.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
                isSelf: toStore.senderId === currentUser.id,
              };
              return [...prev, formatted].sort(
                (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
              );
            });
          }
        }
      } catch (err) {
        console.error("[Effect 3] Error loading messages:", err);
        if (isMounted) setError("Failed to load messages.");
      } finally {
        if (isMounted) {
          setLoadingMessages(false);
          console.log("[Effect 3] Finished loading messages.");
        }
      }
    };

    loadAndRehydrateMessages();

    // Cleanup function
    return () => {
      isMounted = false;
      console.log("[Effect 3 - Combined] Unmounting/cleanup.");
    };

    // Dependency array: Fetch when conversation or user changes
  }, [selectedConversation?.id, currentUser?.id]);

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
        // Modified handler to include decryption
        async (payload) => {
          console.log("[Realtime] handleNewMessage triggered:", payload);

          const newMessageData = payload.new;

          // --- BEGIN FIX: Ignore own messages from realtime insert ---
          if (newMessageData.profile_id === currentUser.id) {
            console.log(
              "[Realtime] Ignoring own message insert notification (already handled by local echo)."
            );
            return;
          }
          // --- END FIX ---

          // Check if it belongs to the current conversation (extra safety)
          if (newMessageData.conversation_id !== selectedConversation.id) {
            console.log(
              "[Realtime] Message is for a different conversation, skipping."
            );
            return;
          }

          // Avoid adding duplicates if message already exists (e.g., from initial fetch)
          if (messages.some((msg) => msg.id === newMessageData.id)) {
            console.log("[Realtime] Duplicate message detected, skipping.");
            return;
          }

          // Fetch sender profile for the new message
          const { data: senderProfile, error: profileError } = await supabase
            .from("profiles")
            .select("id, full_name, username, avatar_url")
            .eq("id", newMessageData.profile_id)
            .single();

          if (profileError) {
            console.error(
              "[Realtime] Error fetching profile for new message:",
              profileError
            );
            return;
          }
          console.log("[Realtime] Fetched sender profile:", senderProfile);

          let contentToFormat = { ...newMessageData, profiles: senderProfile };

          // Check if message is encrypted and needs decryption
          if (
            newMessageData.is_encrypted &&
            newMessageData.profile_id !== currentUser.id
            // Removed check for content/header here, rely on is_encrypted
          ) {
            console.log(
              `[Realtime] Encrypted message ${newMessageData.id} received, needs decryption.`
            );
            try {
              console.log(
                `[Realtime] Calling backend decrypt for msg ${newMessageData.id}...`
              );
              // Use post helper for decryption
              const decryptResult = await post("/api/messages/decrypt", {
                recipient_id: currentUser.id,
                sender_id: newMessageData.profile_id,
                header_b64: newMessageData.encryption_header,
                ciphertext_b64: newMessageData.content,
              });

              // Only need plaintext now, already_decrypted check happens via !localIds.has()
              const { plaintext } = decryptResult;

              console.log(
                `[Realtime] Decryption successful for msg ${newMessageData.id}.`
              );

              // Update contentToFormat with decrypted data
              contentToFormat.content = plaintext;
              contentToFormat.is_encrypted = false; // Mark as plaintext for formatting
              contentToFormat.encryption_header = null; // Conceptually nullify header
            } catch (decryptionError) {
              console.error(
                `[Realtime] Error during decryption call for msg ${newMessageData.id}:`,
                decryptionError
              );
              contentToFormat.content = "[Decryption Error]"; // Update content to show error
              contentToFormat.is_encrypted = true; // Keep flag true as decryption failed
            }
          } else {
            // Message is plaintext or self-sent
            console.log(
              `[Realtime] Message ${newMessageData.id} is plaintext or self-sent.`
            );
            // Ensure contentToFormat reflects this if necessary (it should already have the correct content/flags from payload)
          }

          // *** NEW: skip both empty and handshake packets ***
          if (
            !contentToFormat.content.trim() ||
            contentToFormat.content === "(initial session packet)"
          ) {
            console.log(
              `Skipping realtime handshake/empty msg ${newMessageData.id}`
            );
            return;
          }

          // Format the message for the UI (using potentially decrypted content)
          const formatted = formatMessage(contentToFormat);
          if (formatted) {
            const toStore = {
              id: contentToFormat.id,
              conversationId: contentToFormat.conversation_id,
              senderId: contentToFormat.profile_id,
              senderName: senderProfile.full_name || senderProfile.username,
              senderAvatar: senderProfile.avatar_url,
              content: contentToFormat.content,
              timestamp: new Date(payload.new.created_at).toISOString(),
            };
            try {
              await db.messages.put(toStore);
            } catch (err) {
              console.error("Failed to persist incoming msg:", err);
            }
            console.log(
              "[Realtime] Adding formatted message to state:",
              formatted
            );
            setMessages((prevMessages) => [...prevMessages, formatted]);
          } else {
            console.warn(
              "[Realtime] Failed to format message payload:",
              payload.new
            );
          }
        }
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
    if (!newMessage.trim() || !selectedConversation || !profile?.id) return;

    const recipientProfile = selectedConversation.participants.find(
      (p) => p.id !== profile.id
    );

    if (!recipientProfile) {
      console.error(
        "Could not find recipient profile in selected conversation."
      );
      setError("Error sending message: Recipient not found.");
      return;
    }

    const recipientId = recipientProfile.id;
    const plaintextMessage = newMessage.trim();
    setNewMessage(""); // Clear input immediately
    console.log(`[SendMessage] Preparing to encrypt: "${plaintextMessage}"`);

    try {
      // --- Step 0: Ensure Session is Initiated ---
      console.log(
        `[SendMessage] Ensuring session initiated for ${profile.id} -> ${recipientId}...`
      );
      // Use post helper to initiate session
      const initiateResult = await post("/api/sessions/initiate", {
        sender_id: profile.id,
        recipient_id: recipientId,
      });

      console.log(
        "[SendMessage] Session initiation check completed:",
        initiateResult.message // Use message from post result
      );
      // Step 0b: If there's an initial handshake packet, store it
      if (initiateResult.initial_packet_header_b64) {
        console.log("[SendMessage] Storing handshake packet…");
        const { error: hsError } = await supabase.from("messages").insert({
          conversation_id: selectedConversation.id,
          profile_id: profile.id,
          content: initiateResult.initial_packet_ciphertext_b64,
          is_encrypted: true,
          encryption_header: initiateResult.initial_packet_header_b64,
        });
        if (hsError) {
          console.error("Failed to store handshake packet:", hsError);
          throw new Error("Handshake storage failed");
        }
        console.log("[SendMessage] Handshake packet stored.");
      }
      // --- Step 1: Call Backend Encryption API ---
      console.log(
        `[SendMessage] Calling backend encrypt for recipient ${recipientId}...`
      );
      // Use post helper to encrypt
      const { header_b64, ciphertext_b64 } = await post(
        "/api/messages/encrypt",
        {
          sender_id: profile.id,
          recipient_id: recipientId,
          plaintext: plaintextMessage,
        }
      );

      console.log(
        `[SendMessage] Encryption successful. Header and Ciphertext received.`
      );

      // --- Step 2: Store Encrypted Message in Supabase ---
      console.log(`[SendMessage] Storing encrypted message to Supabase...`);
      const { data: insertedMessages, error: insertError } = await supabase
        .from("messages")
        .insert({
          conversation_id: selectedConversation.id,
          profile_id: profile.id,
          content: ciphertext_b64,
          is_encrypted: true,
          encryption_header: header_b64,
        })
        .select("id") // Select the ID of the inserted row
        .single(); // Expecting a single row back

      if (insertError) {
        console.error(
          "[SendMessage] Error inserting message into Supabase:",
          insertError
        );
        throw new Error(
          `Database Error: ${insertError.message || "Failed to save message"}`
        );
      }

      // --- Step 3: Store Plaintext Locally in IndexedDB ---
      if (!insertedMessages?.id) {
        console.error(
          "[SendMessage] Failed to get ID of inserted message from Supabase. Cannot store locally."
        );
      } else {
        const messageId = insertedMessages.id;
        const messageForDb = {
          id: messageId, // Use the REAL ID from Supabase
          conversationId: selectedConversation.id,
          senderId: profile.id,
          senderName: profile.full_name || profile.username,
          senderAvatar: profile.avatar_url,
          content: plaintextMessage, // Store PLAINTEXT
          timestamp: new Date().toISOString(), // Store ISO string for consistent sorting
        };
        try {
          await db.messages.put(messageForDb);
          console.log(
            `[SendMessage] Stored outgoing plaintext message locally with ID: ${messageId}`
          );
        } catch (dbError) {
          console.error(
            "[SendMessage] Error storing outgoing message locally in IndexedDB:",
            dbError
          );
          // Consider how to handle this failure - the message IS sent.
        }
      }

      // --- Step 4: Optimistic UI Update ---
      // Keep this for immediate feedback. Reloads will use the data stored in DB.
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(), // Use a temporary ID for the optimistic UI update
          senderId: profile.id,
          senderName: profile.full_name || profile.username,
          senderAvatar: profile.avatar_url,
          content: plaintextMessage, // <-- clear-text
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          isSelf: true,
          isEncrypted: false, // UI shows plaintext
        },
      ]);
    } catch (err) {
      console.error("[SendMessage] Error during message sending process:", err);
      setError(`Error sending message: ${err.message}`);
      // Restore the input field content if sending fails?
      setNewMessage(plaintextMessage); // Put message back on error
    } finally {
      // setLoadingMessages(false); // Maybe not needed here as insert is quick?
      setNewMessage("");
      setSelectedFile(null);
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
                (!newMessage.trim() && !selectedFile) ||
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
