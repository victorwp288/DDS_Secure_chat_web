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
}) {
  const chatInactive =
    selectedConversation && selectedConversation.my_status !== "accepted";

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
      />
    </div>
  );
}
