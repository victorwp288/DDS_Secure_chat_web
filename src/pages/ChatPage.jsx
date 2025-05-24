import { useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { useMobile } from "../hooks/use-mobile";
import { useSignal } from "../lib/signalContext.jsx";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { useConversations } from "../hooks/useConversations";
import { useMessages } from "../hooks/useMessages";
import { useSendMessage } from "../hooks/useSendMessage";
import { useRealtimeSubscriptions } from "../hooks/useRealtimeSubscriptions";
import { useAllUsers } from "../hooks/useAllUsers";
import { ChatSidebar } from "../components/ChatSidebar/ChatSidebar";
import { ChatWindow } from "../components/ChatWindow/ChatWindow";

export default function ChatPage() {
  console.log("--- ChatPage Component Rendering ---");

  const [selectedConversation, setSelectedConversation] = useState(null);
  const [newMessage, setNewMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  const isMobile = useMobile();
  const sig = useSignal();
  const { isReady, signalStore, deviceId, initializationError } = sig || {};

  // Use our custom hooks
  const {
    currentUser,
    profile,
    error: userError,
    handleLogout,
    setError,
  } = useCurrentUser();

  const {
    conversations,
    setConversations,
    loading: conversationsLoading,
    error: conversationsError,
    handleAcceptConversation,
    handleRejectConversation,
    fetchAndFormatSingleConversation,
  } = useConversations(profile?.id);

  const {
    messages,
    setMessages,
    loading: messagesLoading,
    error: messagesError,
    messagesEndRef,
  } = useMessages(
    selectedConversation,
    currentUser,
    isReady,
    deviceId,
    signalStore,
    profile
  );

  const {
    sendMessage,
    error: sendError,
    sendingStatus,
  } = useSendMessage(sig, currentUser, profile);

  const { allUsers } = useAllUsers(currentUser?.id);

  // Memoize callback functions to prevent unnecessary re-renders
  const handleNewMessage = useCallback(
    (newMessage) => {
      setMessages((prevMessages) => {
        if (prevMessages.some((msg) => msg.id === newMessage.id)) {
          return prevMessages;
        }
        return [...prevMessages, newMessage];
      });
    },
    [setMessages]
  );

  const handleConversationUpdate = useCallback(
    (updateFunction) => {
      setConversations(updateFunction);
    },
    [setConversations]
  );

  // Memoize additional callbacks passed to child components
  const handleMobileMenuClose = useCallback(() => {
    setIsMobileMenuOpen(false);
  }, []);

  const handleMobileMenuToggle = useCallback(() => {
    setIsMobileMenuOpen(true);
  }, []);

  const handleSearchChange = useCallback((query) => {
    setSearchQuery(query);
  }, []);

  const handleMessageChange = useCallback((message) => {
    setNewMessage(message);
  }, []);

  const handleFileSelect = useCallback((file) => {
    setSelectedFile(file);
  }, []);

  // Set up realtime subscriptions
  useRealtimeSubscriptions({
    selectedConversation,
    currentUser,
    profile,
    isReady,
    signalContext: sig,
    conversations,
    onNewMessage: handleNewMessage,
    onConversationUpdate: handleConversationUpdate,
    onSelectedConversationUpdate: setSelectedConversation,
    fetchAndFormatSingleConversation,
  });

  // Handle conversation selection
  const handleConversationSelect = useCallback(
    (conversation) => {
      setError(null);
      setSelectedConversation(conversation);
    },
    [setError]
  );

  // Handle accepting conversation
  const handleAcceptConversationWrapper = useCallback(
    async (conversationId) => {
      try {
        const updatedConv = await handleAcceptConversation(
          conversationId,
          currentUser?.id
        );
        if (updatedConv) {
          setSelectedConversation(updatedConv);
        }
      } catch (err) {
        setError(err.message);
      }
    },
    [handleAcceptConversation, currentUser?.id, setError]
  );

  // Handle rejecting conversation
  const handleRejectConversationWrapper = useCallback(
    async (conversationId) => {
      try {
        await handleRejectConversation(conversationId, currentUser?.id);
        if (selectedConversation?.id === conversationId) {
          setSelectedConversation(null);
        }
      } catch (err) {
        setError(err.message);
      }
    },
    [
      handleRejectConversation,
      currentUser?.id,
      selectedConversation?.id,
      setError,
    ]
  );

  // Handle sending messages
  const handleSendMessage = useCallback(async () => {
    if (!newMessage.trim() && !selectedFile) return;

    const tempMessage = newMessage;
    const tempFile = selectedFile;

    // Clear input immediately for better UX
    setNewMessage("");
    setSelectedFile(null);

    const handleOptimisticUpdate = (optimisticMessage) => {
      setMessages((prevMessages) => [...prevMessages, optimisticMessage]);
    };

    const result = await sendMessage(
      selectedConversation,
      tempMessage,
      tempFile,
      handleOptimisticUpdate
    );

    if (result?.success) {
      // Replace optimistic message with real message
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg.id === result.optimisticId ? result.message : msg
        )
      );
    } else if (result?.optimisticId) {
      // Mark optimistic message as failed
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg.id === result.optimisticId
            ? { ...msg, status: "failed", isOptimistic: false }
            : msg
        )
      );
    }
  }, [
    sendMessage,
    selectedConversation,
    newMessage,
    selectedFile,
    setMessages,
  ]);

  // Handle user selection for new chat
  const handleUserSelect = useCallback(
    async (selectedUser) => {
      console.log("Selected user to start chat with:", selectedUser);
      if (!currentUser || !profile) {
        console.error("Current user or profile not loaded.");
        return;
      }
      if (selectedUser.id === currentUser.id) {
        console.warn("Cannot start chat with self.");
        return;
      }

      try {
        // Check if a conversation already exists
        const existingConversation = conversations.find((conv) => {
          if (!conv.participants || conv.participants.length !== 2)
            return false;
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
          // Create New Conversation
          const { data: newConvData, error: convInsertError } = await supabase
            .from("conversations")
            .insert({})
            .select()
            .single();

          if (convInsertError) throw convInsertError;
          const newConversationId = newConvData.id;
          console.log("Created new conversation with ID:", newConversationId);

          // Add Participants with appropriate status
          const { error: participantInsertError } = await supabase
            .from("conversation_participants")
            .insert([
              {
                conversation_id: newConversationId,
                profile_id: currentUser.id,
                status: "accepted",
              },
              {
                conversation_id: newConversationId,
                profile_id: selectedUser.id,
                status: "pending",
              },
            ]);

          if (participantInsertError) throw participantInsertError;
          console.log("Added participants to new conversation.");

          // Construct new conversation object for UI state
          const newConversationForState = {
            id: newConversationId,
            name: selectedUser.full_name || selectedUser.username,
            lastMessage: "",
            time: "",
            unread: 0,
            avatar: selectedUser.avatar_url,
            participants: [
              {
                id: profile.id,
                username: profile.username,
                full_name: profile.full_name,
                avatar_url: profile.avatar_url,
                status: profile.status,
              },
              {
                id: selectedUser.id,
                username: selectedUser.username,
                full_name: selectedUser.full_name,
                avatar_url: selectedUser.avatar_url,
                status: "offline",
              },
            ],
            is_group: false,
            group_name: null,
            group_avatar_url: null,
            my_status: "accepted",
            peer_status: "pending",
          };

          // Update State
          setConversations((prev) => [newConversationForState, ...prev]);
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
    },
    [
      currentUser,
      profile,
      conversations,
      setError,
      setConversations,
      setSelectedConversation,
    ]
  );

  // Handle group creation
  const handleCreateGroup = useCallback(
    async ({ name: groupName, memberIds }) => {
      if (!currentUser || !profile) {
        setError("Current user or profile not loaded. Cannot create group.");
        return;
      }
      if (!groupName || memberIds.length === 0) {
        setError("Group name and at least one member are required.");
        return;
      }

      setError(null);

      try {
        // Create a conversation row with is_group: true
        const { data: convData, error: convInsertError } = await supabase
          .from("conversations")
          .insert({ is_group: true, group_name: groupName })
          .select()
          .single();

        if (convInsertError) throw convInsertError;
        const newConversationId = convData.id;

        // Add all selected users + yourself as participants
        const participantObjects = memberIds.map((id) => ({
          conversation_id: newConversationId,
          profile_id: id,
          status: "pending",
        }));
        participantObjects.push({
          conversation_id: newConversationId,
          profile_id: currentUser.id,
          status: "accepted",
        });

        const { error: participantInsertError } = await supabase
          .from("conversation_participants")
          .insert(participantObjects);

        if (participantInsertError) throw participantInsertError;

        // Construct new group object for UI state
        const groupParticipantsProfiles = [
          profile,
          ...allUsers.filter((u) => memberIds.includes(u.id)),
        ];

        const newGroupForState = {
          id: newConversationId,
          name: groupName,
          lastMessage: "Group created",
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          unread: 0,
          avatar: null,
          participants: groupParticipantsProfiles,
          is_group: true,
          group_name: groupName,
          group_avatar_url: null,
          my_status: "accepted",
        };

        // Update State
        setConversations((prev) => [newGroupForState, ...prev]);
        setSelectedConversation(newGroupForState);
        setError(null);
      } catch (err) {
        console.error("Error creating group:", err);
        setError(`Failed to create group: ${err.message}`);
      }
    },
    [
      currentUser,
      profile,
      allUsers,
      setError,
      setConversations,
      setSelectedConversation,
    ]
  );

  // Handle any global error from the current user, conversations, messages, or send operations
  const globalError =
    userError || conversationsError || messagesError || sendError;

  // Early returns for loading and error states
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

  if (globalError && !initializationError) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900 text-red-400">
        Error: {globalError}
      </div>
    );
  }

  return (
    <div className="flex h-screen-mobile bg-slate-900">
      {/* Sidebar */}
      {(!isMobile || isMobileMenuOpen) && (
        <ChatSidebar
          isMobile={isMobile}
          isMobileMenuOpen={isMobileMenuOpen}
          onMobileMenuClose={handleMobileMenuClose}
          onMobileMenuToggle={handleMobileMenuToggle}
          profile={profile}
          conversations={conversations}
          selectedConversation={selectedConversation}
          onConversationSelect={handleConversationSelect}
          onAcceptConversation={handleAcceptConversationWrapper}
          onRejectConversation={handleRejectConversationWrapper}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          currentUser={currentUser}
          allUsers={allUsers}
          onUserSelect={handleUserSelect}
          onCreateGroup={handleCreateGroup}
          onLogout={handleLogout}
        />
      )}

      {/* Main Chat Window */}
      <ChatWindow
        isMobile={isMobile}
        onMobileMenuToggle={handleMobileMenuToggle}
        selectedConversation={selectedConversation}
        loadingConversations={conversationsLoading}
        currentUser={currentUser}
        onConversationUpdate={setConversations}
        onSelectedConversationUpdate={setSelectedConversation}
        onError={setError}
        messages={messages}
        messagesLoading={messagesLoading}
        messagesEndRef={messagesEndRef}
        newMessage={newMessage}
        onMessageChange={handleMessageChange}
        onSendMessage={handleSendMessage}
        selectedFile={selectedFile}
        onFileSelect={handleFileSelect}
        isReady={isReady}
        sendLoading={false}
        sendingStatus={sendingStatus}
      />
    </div>
  );
}
