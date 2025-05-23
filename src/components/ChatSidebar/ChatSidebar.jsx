import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  LogOut,
  MessageSquare,
  Plus,
  Settings,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { AnimatePresence } from "framer-motion";
import { SearchBox } from "./SearchBox";
import { ConversationList } from "./ConversationList";
import NewChatModal from "../NewChatModal";
import NewGroupModal from "../NewGroupModal";

export function ChatSidebar({
  isMobile,
  onMobileMenuClose,
  profile,
  conversations,
  selectedConversation,
  onConversationSelect,
  onAcceptConversation,
  onRejectConversation,
  searchQuery,
  onSearchChange,
  currentUser,
  allUsers,
  onUserSelect,
  onCreateGroup,
  onLogout,
}) {
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [isNewGroupModalOpen, setIsNewGroupModalOpen] = useState(false);

  return (
    <AnimatePresence>
      <div
        className={`${
          isMobile ? "absolute z-10 w-full max-w-xs" : "w-80"
        } h-full bg-slate-800 border-r border-slate-700 flex flex-col overflow-hidden`}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-emerald-400" />
            <h1 className="font-bold text-white">Messages</h1>
          </div>
          <div className="flex gap-1">
            <Dialog
              open={isNewChatModalOpen}
              onOpenChange={setIsNewChatModalOpen}
            >
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Start new 1-on-1 chat"
                  className="text-slate-400 hover:text-white"
                >
                  <Plus className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <NewChatModal
                currentUser={currentUser}
                onUserSelect={(user) => {
                  onUserSelect(user);
                  setIsNewChatModalOpen(false);
                }}
                onOpenChange={setIsNewChatModalOpen}
              />
            </Dialog>

            <Dialog
              open={isNewGroupModalOpen}
              onOpenChange={setIsNewGroupModalOpen}
            >
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Create new group chat"
                  className="text-slate-400 hover:text-white"
                >
                  <Users className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <NewGroupModal
                allUsers={allUsers}
                currentUser={currentUser}
                onCreate={(data) => {
                  onCreateGroup(data);
                  setIsNewGroupModalOpen(false);
                }}
                onOpenChange={setIsNewGroupModalOpen}
              />
            </Dialog>

            {isMobile && (
              <Button
                variant="ghost"
                size="icon"
                className="text-slate-400 hover:text-white"
                onClick={onMobileMenuClose}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>

        {/* Search */}
        <SearchBox searchQuery={searchQuery} onSearchChange={onSearchChange} />

        {/* Conversation List */}
        <ConversationList
          conversations={conversations}
          selectedConversation={selectedConversation}
          onConversationSelect={onConversationSelect}
          onAcceptConversation={onAcceptConversation}
          onRejectConversation={onRejectConversation}
          onMobileMenuClose={isMobile ? onMobileMenuClose : undefined}
        />

        {/* Footer Profile Section */}
        <div className="p-4 border-t border-slate-700 flex items-center justify-between">
          <Link to="/profile" className="flex items-center gap-3">
            <Avatar>
              <AvatarImage
                src={
                  profile?.avatar_url || "/placeholder.svg?height=40&width=40"
                }
                alt="Your Avatar"
              />
              <AvatarFallback className="bg-emerald-500 text-white">
                {(profile?.full_name || profile?.username || "??")
                  .split(" ")
                  .map((n) => n[0])
                  .join("")}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium text-white">
                {profile?.full_name || profile?.username || "Loading..."}
              </p>
              <p className="text-xs text-slate-400">
                {profile?.status || "Offline"}
              </p>
            </div>
          </Link>
          <div className="flex gap-1">
            <Link to="/settings">
              <Button
                variant="ghost"
                size="icon"
                className="text-slate-400 hover:text-white"
              >
                <Settings className="h-5 w-5" />
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="text-slate-400 hover:text-white"
              onClick={onLogout}
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </AnimatePresence>
  );
}
