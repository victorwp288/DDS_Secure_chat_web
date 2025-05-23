import { useState, useRef } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmojiPickerPanel } from "./EmojiPickerPanel";

export function MessageInput({
  newMessage,
  onMessageChange,
  onSendMessage,
  selectedFile,
  onFileSelect,
  disabled,
  isReady,
  loading,
  selectedConversation,
  sendingStatus,
}) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const fileInputRef = useRef();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isMessageSendable()) return;
    onSendMessage();
  };

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const maxSizeMB = 10;
    if (file.size > maxSizeMB * 1024 * 1024) {
      alert(`File size exceeds ${maxSizeMB}MB limit.`);
      return;
    }

    onFileSelect(file);
  };

  const handleEmojiClick = (emoji) => {
    onMessageChange(newMessage + emoji);
  };

  const isMessageSendable = () => {
    return (newMessage.trim() || selectedFile) && !isDisabled;
  };

  const isDisabled =
    disabled ||
    !isReady ||
    loading ||
    sendingStatus === "encrypting" ||
    sendingStatus === "sending";

  const getPlaceholderText = () => {
    if (!isReady) return "Initializing secure session...";
    if (sendingStatus === "encrypting") return "Encrypting message...";
    if (sendingStatus === "sending") return "Sending message...";
    if (loading) return "Sending...";

    if (selectedConversation) {
      const chatInactive =
        selectedConversation.my_status !== "accepted" ||
        (!selectedConversation.is_group &&
          selectedConversation.peer_status === "rejected") ||
        (!selectedConversation.is_group &&
          selectedConversation.peer_status === "pending");

      if (chatInactive) {
        if (selectedConversation.my_status === "pending") {
          return "Accept invitation to start messaging...";
        }
        if (selectedConversation.my_status === "rejected") {
          return "Chat request declined";
        }
        if (
          !selectedConversation.is_group &&
          selectedConversation.peer_status === "pending"
        ) {
          return "Waiting for user to accept request...";
        }
        if (
          !selectedConversation.is_group &&
          selectedConversation.peer_status === "rejected"
        ) {
          return "Chat request was declined";
        }
      }
    }

    return "Type a message...";
  };

  const getSendButtonContent = () => {
    if (sendingStatus === "encrypting") {
      return (
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
      );
    }
    if (sendingStatus === "sending") {
      return (
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
      );
    }
    return <Send className="h-5 w-5" />;
  };

  return (
    <div className="p-4 border-t border-slate-700 bg-slate-800 relative">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          className="text-slate-400 hover:text-white"
          onClick={handleFileClick}
          disabled={isDisabled}
        >
          📎
        </Button>

        <input
          type="file"
          ref={fileInputRef}
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        <Input
          placeholder={getPlaceholderText()}
          className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400"
          value={newMessage}
          onChange={(e) => onMessageChange(e.target.value)}
          disabled={isDisabled}
        />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setShowEmojiPicker((prev) => !prev)}
          disabled={isDisabled}
        >
          😀
        </Button>

        <Button
          type="submit"
          size="icon"
          className="bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50"
          disabled={!isMessageSendable()}
        >
          {getSendButtonContent()}
        </Button>
      </form>

      {showEmojiPicker && <EmojiPickerPanel onEmojiClick={handleEmojiClick} />}

      {selectedFile && (
        <div className="text-slate-400 text-xs mt-2 ml-2">
          Attached: {selectedFile.name}
        </div>
      )}

      {sendingStatus && sendingStatus !== "sent" && (
        <div className="text-xs text-slate-400 mt-1 ml-2 flex items-center gap-1">
          {sendingStatus === "encrypting" && (
            <>
              <div className="h-2 w-2 bg-blue-400 rounded-full animate-pulse" />
              Encrypting message...
            </>
          )}
          {sendingStatus === "sending" && (
            <>
              <div className="h-2 w-2 bg-green-400 rounded-full animate-pulse" />
              Sending message...
            </>
          )}
        </div>
      )}
    </div>
  );
}
