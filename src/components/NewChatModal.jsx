import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "../lib/supabaseClient";
import { Button } from "./ui/button";

export default function NewChatModal({ currentUser, onUserSelect }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (searchQuery.trim().length > 1) {
        performSearch();
      } else {
        setSearchResults([]);
      }
    }, 500);

    return () => {
      clearTimeout(handler);
    };
  }, [searchQuery, currentUser]);

  const performSearch = async () => {
    if (!currentUser || !searchQuery.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const searchTerm = `%${searchQuery.trim()}%`;
      const { data, error: searchError } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url")
        .or(`username.ilike.${searchTerm},full_name.ilike.${searchTerm}`)
        .neq("id", currentUser.id)
        .limit(10);

      if (searchError) throw searchError;

      setSearchResults(data || []);
    } catch (err) {
      console.error("Error searching users:", err);
      setError("Failed to search users.");
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DialogContent className="bg-slate-800 border-slate-700 text-white sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>Start New Chat</DialogTitle>
        <DialogDescription>
          Search for users by username or full name.
        </DialogDescription>
      </DialogHeader>
      <div className="p-0">
        <Input
          placeholder="Search users..."
          className="mb-4 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <ScrollArea className="h-[300px]">
          {loading && (
            <p className="text-center text-slate-400">Searching...</p>
          )}
          {error && <p className="text-center text-red-400">{error}</p>}
          {!loading &&
            searchResults.length === 0 &&
            searchQuery.trim().length > 1 && (
              <p className="text-center text-slate-400">No users found.</p>
            )}
          {!loading &&
            searchResults.map((user) => (
              <div
                key={user.id}
                className="flex items-center gap-3 p-2 mb-1 rounded-md hover:bg-slate-700 cursor-pointer"
                onClick={() => onUserSelect(user)}
              >
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
              </div>
            ))}
        </ScrollArea>
      </div>
    </DialogContent>
  );
}
