import { useState } from "react";
import {
  Menu,
  MoreVertical,
  User,
  MessageSquare,
  Pencil,
  LogOut,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { post } from "../../lib/backend";
import { supabase } from "../../lib/supabaseClient";
import { useSignal } from "../../lib/signalContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ChatHeader({
  isMobile,
  onMobileMenuToggle,
  selectedConversation,
  loadingConversations,
  currentUser,
  onConversationUpdate,
  onSelectedConversationUpdate,
  onError,
  getUserPresence,
  isUserOnline,
}) {
  const [isRenamingGroup, setIsRenamingGroup] = useState(false);
  const [isLeavingGroup, setIsLeavingGroup] = useState(false);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [isClearingSessions, setIsClearingSessions] = useState(false);
  const signalContext = useSignal();

  // Calculate presence status for display
  const getPresenceStatus = () => {
    if (
      !selectedConversation?.participants ||
      !getUserPresence ||
      !isUserOnline
    ) {
      return "Offline";
    }

    if (selectedConversation.is_group) {
      // For groups, count online members (excluding self)
      const onlineCount = selectedConversation.participants.filter(
        (p) => p.id !== currentUser?.id && isUserOnline(p.id)
      ).length;

      if (onlineCount > 0) {
        return `${onlineCount} online`;
      }
      return "No one online";
    } else {
      // For 1-on-1 chats, show the other person's status
      const otherParticipant = selectedConversation.participants.find(
        (p) => p.id !== currentUser?.id
      );

      if (otherParticipant && isUserOnline(otherParticipant.id)) {
        return "Online";
      }
      return "Offline";
    }
  };

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

  // TEMPORARY: Force device cleanup function
  const handleForceCleanup = async () => {
    if (!currentUser?.id) {
      alert("No current user found");
      return;
    }

    if (
      !confirm(
        "This will clear all your devices and force re-registration. Continue?"
      )
    ) {
      return;
    }

    setIsCleaningUp(true);
    try {
      console.log("Force cleaning up devices...");

      // Call cleanup API
      const cleanupResponse = await post("/device/cleanup", {
        userId: currentUser.id,
      });

      console.log("Cleanup response:", cleanupResponse);

      // Clear localStorage
      const localStorageKey = `${currentUser.id}_deviceId`;
      localStorage.removeItem(localStorageKey);

      alert(
        `Cleanup successful! Removed ${cleanupResponse.devicesRemoved} devices. Please refresh the page.`
      );

      // Force page reload to re-initialize
      window.location.reload();
    } catch (error) {
      console.error("Cleanup failed:", error);
      alert(`Cleanup failed: ${error.message}`);
    } finally {
      setIsCleaningUp(false);
    }
  };

  // Clear sessions for conversation participants
  const handleClearSessions = async () => {
    if (!selectedConversation || !signalContext?.signalStore) {
      alert("No conversation selected or signal context not ready");
      return;
    }

    if (
      !confirm(
        "This will clear all sessions for participants in this conversation. This can help fix message decryption issues. Continue?"
      )
    ) {
      return;
    }

    setIsClearingSessions(true);
    try {
      console.log("Clearing sessions for conversation participants...");

      let clearedCount = 0;

      // Clear sessions for all participants in this conversation
      if (selectedConversation.participants) {
        for (const participant of selectedConversation.participants) {
          if (participant.id === currentUser?.id) continue; // Skip self

          // Clear sessions for a wide range of device IDs to catch any orphaned sessions
          for (let deviceId = 1; deviceId <= 300; deviceId++) {
            const participantAddress = `${participant.id}.${deviceId}`;
            try {
              const sessionExists = await signalContext.signalStore.loadSession(
                participantAddress
              );
              if (sessionExists) {
                await signalContext.signalStore.removeSession(
                  participantAddress
                );
                console.log(`Cleared session for ${participantAddress}`);
                clearedCount++;
              }

              // Also clear identity
              if (
                typeof signalContext.signalStore.removeIdentity === "function"
              ) {
                try {
                  await signalContext.signalStore.removeIdentity(
                    participantAddress
                  );
                } catch (error) {
                  // Ignore errors for non-existent identities
                }
              }
            } catch (error) {
              // Ignore errors for non-existent sessions
            }
          }
        }
      }

      alert(
        `Session clearing completed! Cleared ${clearedCount} sessions. Try sending a message now.`
      );
    } catch (error) {
      console.error("Session clearing failed:", error);
      alert(`Session clearing failed: ${error.message}`);
    } finally {
      setIsClearingSessions(false);
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
              <p className="text-xs text-slate-400">{getPresenceStatus()}</p>
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
                <p className="text-sm text-slate-400">{getPresenceStatus()}</p>
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

                  {/* Session clearing button */}
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-blue-400 hover:text-blue-300 hover:bg-blue-900/20"
                    onClick={handleClearSessions}
                    disabled={isClearingSessions}
                  >
                    <MessageSquare className="mr-2 h-4 w-4" />
                    {isClearingSessions ? "Clearing..." : "Clear Sessions"}
                  </Button>

                  {/* TEMPORARY: Device cleanup button */}
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-orange-400 hover:text-orange-300 hover:bg-orange-900/20"
                    onClick={handleForceCleanup}
                    disabled={isCleaningUp}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {isCleaningUp ? "Cleaning..." : "Fix Device Issues"}
                  </Button>
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
