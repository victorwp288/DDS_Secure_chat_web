import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import EmojiPicker from 'emoji-picker-react';
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
// import { encryptMessage } from "@/lib/encryption"

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

  // 3. Fetch messages when selectedConversation changes
  useEffect(() => {
    if (!selectedConversation?.id || !currentUser?.id) {
      setMessages([]); // Clear messages if no conversation selected
      return;
    }

    const fetchMessages = async () => {
      setLoadingMessages(true);
      setError(null); // Clear previous errors
      try {
        const { data, error: messagesError } = await supabase
          .from("messages")
          .select(
            `
            id,
            content,
            created_at,
            profile_id,
            profiles ( id, full_name, username, avatar_url )
          `
          )
          .eq("conversation_id", selectedConversation.id)
          .order("created_at", { ascending: true });

        if (messagesError) throw messagesError;

        const formatted = data.map(formatMessage).filter(Boolean); // Format and remove nulls
        setMessages(formatted);
      } catch (err) {
        console.error("Error fetching messages:", err);
        setError("Failed to load messages.");
        setMessages([]); // Clear messages on error
      } finally {
        setLoadingMessages(false);
      }
    };

    fetchMessages();

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

    // Define the message handler
    const handleNewMessage = async (payload) => {
      console.log("[Realtime] handleNewMessage triggered:", payload);

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
      // Note: This adds an extra fetch per message. For high traffic, consider including profile data in the payload or using DB functions.
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

      console.log("[Realtime] Fetched sender profile:", senderProfile);

      const formatted = formatMessage({
        ...payload.new,
        profiles: senderProfile,
      });
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
    if (!newMessage.trim() || !selectedConversation || !currentUser) return;

    const content = newMessage.trim();
    const conversationId = selectedConversation.id;
    const profileId = currentUser.id;

    console.log(
      `[SendMessage] Attempting to send: "${content}" to convo ${conversationId}`
    );

    setNewMessage("");

    try {
      const { data: insertedData, error: insertError } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          profile_id: profileId,
          content: content,
        })
        .select(); // Select the inserted row data

      if (insertError) {
        // Log error specifically
        console.error("[SendMessage] Error sending message:", insertError);
        setError(`Failed to send message: ${insertError.message}`);
      } else {
        // Log success
        console.log(
          "[SendMessage] Message insert successful, data:",
          insertedData
        );
        setError(null); // Clear previous errors on success
        // Real-time should handle adding it to the list, so no setMessages here needed usually
      }
    } catch (err) {
      console.error("[SendMessage] Unexpected error sending message:", err);
      setError("An unexpected error occurred while sending.");
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
          // --- Emoji Picker Feature ---
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
