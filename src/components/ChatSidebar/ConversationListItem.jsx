import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export function ConversationListItem({
  conversation,
  isSelected,
  onClick,
  onAccept,
  onReject,
}) {
  return (
    <div
      className={`p-3 rounded-lg cursor-pointer mb-1 hover:bg-slate-700/50 ${
        isSelected ? "bg-slate-700" : ""
      }`}
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <Avatar>
          <AvatarImage
            src={
              conversation.is_group
                ? conversation.group_avatar_url || "/group-placeholder.svg"
                : conversation.avatar || "/placeholder.svg"
            }
            alt={
              conversation.is_group
                ? conversation.group_name || "Group"
                : conversation.name
            }
          />
          <AvatarFallback className="bg-emerald-500 text-white">
            {(conversation.is_group
              ? conversation.group_name || "Group"
              : conversation.name
            )
              ?.split(" ")
              .map((n) => n[0])
              .join("") || "??"}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-center">
            <h3 className="font-medium text-white truncate">
              {conversation.is_group
                ? conversation.group_name || "Unnamed Group"
                : conversation.name}
            </h3>
            <span className="text-xs text-slate-400">{conversation.time}</span>
          </div>
          <div className="flex justify-between items-center">
            <p className="text-sm text-slate-400 truncate">
              {conversation.lastMessage}
            </p>
            {conversation.unread > 0 && (
              <span className="bg-emerald-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                {conversation.unread}
              </span>
            )}
          </div>
          {conversation.my_status === "pending" && (
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                className="bg-green-500 hover:bg-green-600 text-xs h-7 flex-1"
                onClick={(e) => {
                  e.stopPropagation();
                  onAccept(conversation.id);
                }}
              >
                Accept
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="bg-red-500 hover:bg-red-600 text-xs h-7 flex-1"
                onClick={(e) => {
                  e.stopPropagation();
                  onReject(conversation.id);
                }}
              >
                Reject
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
