import { ChatHeader } from "./ChatHeader";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";

export function ChatWindow({
  isMobile,
  onMobileMenuToggle,
  selectedConversation,
  loadingConversations,
  currentUser,
  onConversationUpdate,
  onSelectedConversationUpdate,
  onError,
  messages,
  messagesLoading,
  messagesEndRef,
  newMessage,
  onMessageChange,
  onSendMessage,
  selectedFile,
  onFileSelect,
  isReady,
  sendLoading,
  sendingStatus,
}) {
  // Check if chat is inactive due to status issues
  const chatInactive =
    selectedConversation &&
    (selectedConversation.my_status !== "accepted" ||
      (!selectedConversation.is_group &&
        selectedConversation.peer_status === "rejected") ||
      (!selectedConversation.is_group &&
        selectedConversation.peer_status === "pending"));

  return (
    <div className="flex-1 flex flex-col h-full">
      <ChatHeader
        isMobile={isMobile}
        onMobileMenuToggle={onMobileMenuToggle}
        selectedConversation={selectedConversation}
        loadingConversations={loadingConversations}
        currentUser={currentUser}
        onConversationUpdate={onConversationUpdate}
        onSelectedConversationUpdate={onSelectedConversationUpdate}
        onError={onError}
      />

      <MessageList
        messages={messages}
        loading={messagesLoading}
        selectedConversation={selectedConversation}
        messagesEndRef={messagesEndRef}
      />

      <MessageInput
        newMessage={newMessage}
        onMessageChange={onMessageChange}
        onSendMessage={onSendMessage}
        selectedFile={selectedFile}
        onFileSelect={onFileSelect}
        disabled={!selectedConversation || loadingConversations || chatInactive}
        isReady={isReady}
        loading={sendLoading}
        selectedConversation={selectedConversation}
        sendingStatus={sendingStatus}
      />
    </div>
  );
}
