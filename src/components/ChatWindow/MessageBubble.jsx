import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Check, CheckCheck, Clock, AlertCircle } from "lucide-react";

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

  const renderStatusIcon = () => {
    if (!message.isSelf) return null;

    const iconClassName = "h-3 w-3 ml-1 inline";

    switch (message.status) {
      case "sending":
        return (
          <Clock className={`${iconClassName} text-slate-400 animate-pulse`} />
        );
      case "sent":
        return <Check className={`${iconClassName} text-slate-400`} />;
      case "delivered":
        return <CheckCheck className={`${iconClassName} text-slate-400`} />;
      case "failed":
        return <AlertCircle className={`${iconClassName} text-red-400`} />;
      default:
        return message.isOptimistic ? (
          <Clock className={`${iconClassName} text-slate-400 animate-pulse`} />
        ) : null;
    }
  };

  const getMessageOpacity = () => {
    if (message.isOptimistic || message.status === "sending") {
      return "opacity-70";
    }
    return "opacity-100";
  };

  return (
    <div className={`flex ${message.isSelf ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] ${
          message.isSelf ? "order-2" : "order-1"
        } ${getMessageOpacity()}`}
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
          className={`text-xs text-slate-400 mt-1 flex items-center ${
            message.isSelf ? "justify-end" : "justify-start"
          }`}
        >
          {message.timestamp}
          {renderStatusIcon()}
        </p>
      </div>
    </div>
  );
}
