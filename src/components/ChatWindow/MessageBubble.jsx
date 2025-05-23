import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function MessageBubble({ message }) {
  const renderContent = () => {
    if (message.content.startsWith("[File](")) {
      const match = message.content.match(/\[File\]\((.*?)\)\s*(.*)/);
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
    } else if (message.content.startsWith("[File] ")) {
      return (
        <span className="text-slate-300">📎 {message.content.slice(7)}</span>
      );
    } else {
      return message.content;
    }
  };

  return (
    <div className={`flex ${message.isSelf ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] ${message.isSelf ? "order-2" : "order-1"}`}>
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
            <span className="text-xs text-slate-400">{message.senderName}</span>
          </div>
        )}
        <div
          className={`rounded-lg p-3 ${
            message.isSelf
              ? "bg-emerald-500 text-white rounded-tr-none"
              : "bg-slate-700 text-white rounded-tl-none"
          }`}
        >
          <p>{renderContent()}</p>
        </div>
        <p
          className={`text-xs text-slate-400 mt-1 ${
            message.isSelf ? "text-right" : "text-left"
          }`}
        >
          {message.timestamp}
        </p>
      </div>
    </div>
  );
}
