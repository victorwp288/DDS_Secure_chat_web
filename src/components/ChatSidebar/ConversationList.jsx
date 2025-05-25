import { ScrollArea } from "@/components/ui/scroll-area";
import { ConversationListItem } from "./ConversationListItem";

export function ConversationList({
  conversations,
  selectedConversation,
  onConversationSelect,
  onAcceptConversation,
  onRejectConversation,
  onMobileMenuClose,
  getUserPresence,
  isUserOnline,
  currentUserId,
}) {
  const filteredConversations = conversations.filter(
    (conv) => conv.my_status !== "rejected"
  );

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="p-2">
        {filteredConversations.map((conv) => (
          <ConversationListItem
            key={conv.id}
            conversation={conv}
            isSelected={selectedConversation?.id === conv.id}
            onClick={() => {
              onConversationSelect(conv);
              if (onMobileMenuClose) onMobileMenuClose();
            }}
            onAccept={onAcceptConversation}
            onReject={onRejectConversation}
            getUserPresence={getUserPresence}
            isUserOnline={isUserOnline}
            currentUserId={currentUserId}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
