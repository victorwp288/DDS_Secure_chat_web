import EmojiPicker from "emoji-picker-react";

export function EmojiPickerPanel({ onEmojiClick }) {
  return (
    <div className="absolute bottom-24 right-8 z-50">
      <EmojiPicker
        onEmojiClick={(emojiData) => onEmojiClick(emojiData.emoji)}
      />
    </div>
  );
}
