import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "./MessageBubble";

export function MessageList({
  messages,
  loading,
  selectedConversation,
  messagesEndRef,
}) {
  // Check if chat is inactive due to status issues
  const chatInactive =
    selectedConversation &&
    (selectedConversation.my_status !== "accepted" ||
      (!selectedConversation.is_group &&
        selectedConversation.peer_status === "rejected") ||
      (!selectedConversation.is_group &&
        selectedConversation.peer_status === "pending"));

  const renderEmptyState = () => {
    if (!selectedConversation) {
      return (
        <div className="text-center text-slate-500 pt-10">
          Select a conversation to view messages.
        </div>
      );
    }

    if (chatInactive) {
      if (selectedConversation.my_status === "pending") {
        return (
          <div className="text-center text-slate-500 pt-10">
            You've been invited to this{" "}
            {selectedConversation.is_group ? "group" : "chat"}. Choose{" "}
            <b>Accept</b> or <b>Reject</b> in the sidebar.
          </div>
        );
      }
      if (selectedConversation.my_status === "rejected") {
        return (
          <div className="text-center text-slate-500 pt-10">
            This chat request was declined.
          </div>
        );
      }
      if (
        !selectedConversation.is_group &&
        selectedConversation.my_status === "accepted" &&
        selectedConversation.peer_status === "pending"
      ) {
        return (
          <div className="text-center text-slate-500 pt-10">
            Waiting for the other user to accept your chat request…
          </div>
        );
      }
      if (
        !selectedConversation.is_group &&
        selectedConversation.my_status === "accepted" &&
        selectedConversation.peer_status === "rejected"
      ) {
        return (
          <div className="text-center text-slate-500 pt-10">
            This chat request was declined by the other user.
          </div>
        );
      }
    }

    return (
      <div className="text-center text-slate-500 pt-10">
        No messages yet. Start the conversation!
      </div>
    );
  };

  return (
    <ScrollArea className="flex-1 min-h-0 p-4 bg-gradient-to-b from-slate-900 to-slate-800">
      <div className="space-y-4">
        {loading && (
          <div className="text-center text-slate-400 py-4">
            Loading messages...
          </div>
        )}

        {!loading && messages.length === 0 && renderEmptyState()}

        {!loading &&
          messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

        <div ref={messagesEndRef} />
      </div>
    </ScrollArea>
  );
}
