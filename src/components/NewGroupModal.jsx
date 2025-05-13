import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "../lib/supabaseClient";
import { Button } from "./ui/button";

export default function NewGroupModal({
  allUsers,
  currentUser,
  onCreate,
  onOpenChange,
}) {
  const [groupName, setGroupName] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchError, setSearchError] = useState(null);

  useEffect(() => {
    if (allUsers && currentUser) {
      setSearchResults(allUsers.filter((u) => u.id !== currentUser.id));
    }
  }, [allUsers, currentUser]);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (searchQuery.trim().length > 0) {
        performSearch();
      } else if (allUsers && currentUser) {
        setSearchResults(allUsers.filter((u) => u.id !== currentUser.id));
        setSearchError(null);
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [searchQuery, currentUser, allUsers]);

  const performSearch = async () => {
    if (!currentUser || !searchQuery.trim()) {
      return;
    }

    setLoadingSearch(true);
    setSearchError(null);
    try {
      const searchTerm = `%${searchQuery.trim()}%`;
      const { data, error: dbSearchError } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url")
        .or(`username.ilike.${searchTerm},full_name.ilike.${searchTerm}`)
        .neq("id", currentUser.id)
        .limit(20);

      if (dbSearchError) throw dbSearchError;

      setSearchResults(data || []);
    } catch (err) {
      console.error("Error searching users for group:", err);
      setSearchError("Failed to search users.");
      setSearchResults([]);
    } finally {
      setLoadingSearch(false);
    }
  };

  const toggleUserSelection = (userId) => {
    setSelectedUserIds((prevSelected) => {
      const next = new Set(prevSelected);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const handleCreateGroup = () => {
    if (!groupName.trim() || selectedUserIds.size === 0) {
      alert("Please enter a group name and select at least one member.");
      return;
    }
    onCreate({
      name: groupName.trim(),
      memberIds: Array.from(selectedUserIds),
    });
    if (onOpenChange) {
      onOpenChange(false);
    }
  };

  return (
    <DialogContent className="bg-slate-800 border-slate-700 text-white sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Create New Group</DialogTitle>
        <DialogDescription>
          Select members and give your group a name.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <Input
          placeholder="Group name"
          className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
        />
        <Input
          placeholder="Search users to add..."
          className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <ScrollArea className="h-[250px] border border-slate-700 rounded-md p-2">
          {loadingSearch && (
            <p className="text-center text-slate-400">Searching...</p>
          )}
          {searchError && (
            <p className="text-center text-red-400">{searchError}</p>
          )}
          {!loadingSearch &&
            searchResults.length === 0 &&
            searchQuery.trim().length > 0 && (
              <p className="text-center text-slate-400">
                No users found matching your search.
              </p>
            )}
          {!loadingSearch &&
            searchResults.length === 0 &&
            searchQuery.trim().length === 0 &&
            allUsers &&
            allUsers.length <= 1 && (
              <p className="text-center text-slate-400">
                No other users available to create a group.
              </p>
            )}
          {!loadingSearch &&
            searchResults.map((user) => (
              <label
                key={user.id}
                className="flex items-center gap-3 p-2 mb-1 rounded-md hover:bg-slate-700 cursor-pointer"
                htmlFor={`user-${user.id}`}
              >
                <Checkbox
                  id={`user-${user.id}`}
                  checked={selectedUserIds.has(user.id)}
                  onCheckedChange={() => toggleUserSelection(user.id)}
                  className="border-slate-500 data-[state=checked]:bg-emerald-500 data-[state=checked]:text-white"
                />
                <Avatar className="h-9 w-9">
                  <AvatarImage
                    src={user.avatar_url || "/placeholder.svg"}
                    alt={user.username}
                  />
                  <AvatarFallback className="bg-emerald-600">
                    {(user.full_name || user.username || "??")
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">
                    {user.full_name || user.username}
                  </p>
                  {user.full_name && user.username && (
                    <p className="text-sm text-slate-400 truncate">
                      @{user.username}
                    </p>
                  )}
                </div>
              </label>
            ))}
        </ScrollArea>
        <Button
          className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
          onClick={handleCreateGroup}
          disabled={
            !groupName.trim() || selectedUserIds.size === 0 || loadingSearch
          }
        >
          Create Group
        </Button>
      </div>
    </DialogContent>
  );
}
