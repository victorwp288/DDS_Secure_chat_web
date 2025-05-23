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
}) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const fileInputRef = useRef();

  const handleSubmit = (e) => {
    e.preventDefault();
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

  const isDisabled = disabled || !isReady || loading;

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
          placeholder="Type a message..."
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
          className="bg-emerald-500 hover:bg-emerald-600 text-white"
          disabled={(!newMessage.trim() && !selectedFile) || isDisabled}
        >
          <Send className="h-5 w-5" />
        </Button>
      </form>

      {showEmojiPicker && <EmojiPickerPanel onEmojiClick={handleEmojiClick} />}

      {selectedFile && (
        <div className="text-slate-400 text-xs mt-2 ml-2">
          Attached: {selectedFile.name}
        </div>
      )}
    </div>
  );
}
