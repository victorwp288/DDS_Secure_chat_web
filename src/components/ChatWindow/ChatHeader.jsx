import { useState } from "react";
import {
  Menu,
  MoreVertical,
  User,
  MessageSquare,
  Pencil,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { post } from "../../lib/backend";
import { supabase } from "../../lib/supabaseClient";

export function ChatHeader({
  isMobile,
  onMobileMenuToggle,
  selectedConversation,
  loadingConversations,
  currentUser,
  onConversationUpdate,
  onSelectedConversationUpdate,
  onError,
}) {
  const [isRenamingGroup, setIsRenamingGroup] = useState(false);
  const [isLeavingGroup, setIsLeavingGroup] = useState(false);

  const handleRenameGroup = async () => {
    if (!selectedConversation) return;

    const newName = window.prompt(
      "Enter a new group name:",
      selectedConversation.group_name || ""
    );

    if (!newName || newName === selectedConversation.group_name) return;

    setIsRenamingGroup(true);
    onError(null);

    try {
      await post(`/conversations/${selectedConversation.id}`, {
        group_name: newName,
      });

      onSelectedConversationUpdate((c) => ({
        ...c,
        group_name: newName,
        name: newName,
      }));

      onConversationUpdate((list) =>
        list.map((c) =>
          c.id === selectedConversation.id
            ? { ...c, name: newName, group_name: newName }
            : c
        )
      );
    } catch (err) {
      console.error("Error renaming group:", err);
      onError(`Failed to rename group: ${err.message}`);
    } finally {
      setIsRenamingGroup(false);
    }
  };

  const handleLeaveGroup = async () => {
    if (!selectedConversation || !currentUser) return;

    if (
      !window.confirm(
        "Are you sure you want to leave this group? You'll have to be re-invited to participate again."
      )
    )
      return;

    setIsLeavingGroup(true);
    onError(null);

    try {
      const { error: deleteError } = await supabase
        .from("conversation_participants")
        .delete()
        .match({
          conversation_id: selectedConversation.id,
          profile_id: currentUser.id,
        });

      if (deleteError) throw deleteError;

      onConversationUpdate((list) =>
        list.filter((c) => c.id !== selectedConversation.id)
      );
      onSelectedConversationUpdate(null);
    } catch (err) {
      console.error("Error leaving group:", err);
      onError(`Failed to leave group: ${err.message}`);
    } finally {
      setIsLeavingGroup(false);
    }
  };

  return (
    <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-slate-700 bg-slate-800">
      <div className="flex items-center gap-3">
        {isMobile && (
          <Button
            variant="ghost"
            size="icon"
            className="text-slate-400 hover:text-white"
            onClick={onMobileMenuToggle}
          >
            <Menu className="h-5 w-5" />
          </Button>
        )}

        {selectedConversation && (
          <>
            <Avatar>
              <AvatarImage
                src={
                  selectedConversation.is_group
                    ? selectedConversation.group_avatar_url ||
                      "/group-placeholder.svg"
                    : selectedConversation.avatar || "/placeholder.svg"
                }
                alt={
                  selectedConversation.is_group
                    ? selectedConversation.group_name || "Group Chat"
                    : selectedConversation.name
                }
              />
              <AvatarFallback className="bg-emerald-500 text-white">
                {selectedConversation.is_group
                  ? (selectedConversation.group_name || "Group")
                      .split(" ")
                      .map((w) => w[0])
                      .join("")
                  : selectedConversation.name
                      ?.split(" ")
                      .map((n) => n[0])
                      .join("") || "??"}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="font-medium text-white">
                {selectedConversation.is_group
                  ? selectedConversation.group_name || "Unnamed Group"
                  : selectedConversation.name}
              </h2>
              <p className="text-xs text-slate-400">Online</p>
            </div>
          </>
        )}

        {!selectedConversation && !loadingConversations && (
          <div className="text-slate-400">
            Select a conversation to start chatting
          </div>
        )}
      </div>

      {selectedConversation && (
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-slate-400 hover:text-white"
            >
              <MoreVertical className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent className="bg-slate-800 border-slate-700 text-white">
            <div className="space-y-4 py-4">
              <div className="flex flex-col items-center gap-2 pb-4 border-b border-slate-700">
                <Avatar className="h-20 w-20">
                  <AvatarImage
                    src={
                      selectedConversation?.is_group
                        ? selectedConversation?.group_avatar_url ||
                          "/group-placeholder.svg"
                        : selectedConversation?.avatar || "/placeholder.svg"
                    }
                    alt={
                      selectedConversation?.is_group
                        ? selectedConversation?.group_name || "Group Chat"
                        : selectedConversation?.name
                    }
                  />
                  <AvatarFallback className="bg-emerald-500 text-white text-xl">
                    {(selectedConversation?.is_group
                      ? selectedConversation?.group_name || "Group"
                      : selectedConversation?.name
                    )
                      ?.split(" ")
                      .map((n) => n[0])
                      .join("") || "??"}
                  </AvatarFallback>
                </Avatar>
                <h3 className="text-xl font-bold">
                  {selectedConversation?.is_group
                    ? selectedConversation?.group_name || "Unnamed Group"
                    : selectedConversation?.name}
                </h3>
                <p className="text-sm text-slate-400">Online</p>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-medium text-slate-400">Options</h4>
                <div className="space-y-1">
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-white"
                  >
                    <User className="mr-2 h-4 w-4" />
                    View Profile
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-white"
                  >
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Search in Conversation
                  </Button>
                  {selectedConversation?.is_group && (
                    <Button
                      variant="ghost"
                      className="w-full justify-start text-white"
                      onClick={handleRenameGroup}
                      disabled={isRenamingGroup || !selectedConversation?.id}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      {isRenamingGroup ? "Renaming..." : "Rename Group"}
                    </Button>
                  )}
                  {selectedConversation?.is_group && (
                    <Button
                      variant="ghost"
                      className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-900/20"
                      onClick={handleLeaveGroup}
                      disabled={
                        isLeavingGroup ||
                        !selectedConversation?.id ||
                        !currentUser?.id
                      }
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      {isLeavingGroup ? "Leaving..." : "Leave Group"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
