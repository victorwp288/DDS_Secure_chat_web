import { ChatHeader } from "./ChatHeader";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { useState, useEffect } from "react";

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
  profile,
  getUserPresence,
  isUserOnline,
}) {
  // Check if chat is inactive due to status issues
  const chatInactive =
    selectedConversation &&
    (selectedConversation.my_status !== "accepted" ||
      (!selectedConversation.is_group &&
        selectedConversation.peer_status === "rejected") ||
      (!selectedConversation.is_group &&
        selectedConversation.peer_status === "pending"));

  const [showDecryptionNotice, setShowDecryptionNotice] = useState(false);
  const [decryptionFailureCount, setDecryptionFailureCount] = useState(0);

  // Monitor messages for decryption failures
  useEffect(() => {
    if (!messages || messages.length === 0) {
      setDecryptionFailureCount(0);
      setShowDecryptionNotice(false);
      return;
    }

    const failureCount = messages.filter(
      (msg) =>
        msg.content &&
        (msg.content.includes("[Decryption Failed - Device Keys Changed]") ||
          msg.content.includes("[Decryption Failed - No Buffer]") ||
          msg.content.includes("[Session Recovery Failed]"))
    ).length;

    setDecryptionFailureCount(failureCount);

    // Show notice if there are 2 or more decryption failures
    if (failureCount >= 2) {
      setShowDecryptionNotice(true);
    }
  }, [messages]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <ChatHeader
        isMobile={isMobile}
        onMobileMenuToggle={onMobileMenuToggle}
        selectedConversation={selectedConversation}
        loadingConversations={loadingConversations}
        currentUser={currentUser}
        onConversationUpdate={onConversationUpdate}
        onSelectedConversationUpdate={onSelectedConversationUpdate}
        onError={onError}
        getUserPresence={getUserPresence}
        isUserOnline={isUserOnline}
      />

      {/* Decryption Notice Banner */}
      {showDecryptionNotice && (
        <div className="bg-amber-900/50 border-l-4 border-amber-500 p-4 mx-4 mt-2 rounded">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-amber-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium text-amber-200">
                Some messages cannot be decrypted
              </h3>
              <div className="mt-2 text-sm text-amber-100">
                <p>
                  {decryptionFailureCount} message(s) failed to decrypt. This
                  usually happens after device cleanup or when encryption keys
                  have changed.
                </p>
                <p className="mt-1">
                  <strong>What you can do:</strong>
                </p>
                <ul className="mt-1 list-disc list-inside space-y-1">
                  <li>
                    Ask the other person to send a new message to re-establish
                    encryption
                  </li>
                  <li>
                    Use "Clear Sessions" in the chat header if problems persist
                  </li>
                  <li>
                    Old messages sent before device cleanup cannot be recovered
                  </li>
                </ul>
                <div className="mt-3 p-3 bg-amber-800/30 rounded border border-amber-600/50">
                  <p className="text-xs text-amber-100">
                    <strong>Why this happens:</strong> For security, each device
                    has unique encryption keys. When devices are reset, old keys
                    are permanently deleted to protect your privacy. This
                    prevents anyone from accessing your messages if a device is
                    compromised.
                  </p>
                  <p className="text-xs text-amber-100 mt-2">
                    <strong>Future improvement:</strong> We could add secure
                    message backup that encrypts your message history with a
                    master key, allowing recovery across devices while
                    maintaining end-to-end encryption.
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <button
                  onClick={() => setShowDecryptionNotice(false)}
                  className="text-sm text-amber-200 hover:text-amber-100 underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <MessageList
        messages={messages}
        loading={messagesLoading}
        selectedConversation={selectedConversation}
        messagesEndRef={messagesEndRef}
        profile={profile}
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
