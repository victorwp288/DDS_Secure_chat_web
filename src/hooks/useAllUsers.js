import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";

export function useAllUsers(currentUserId) {
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAllUsers = async () => {
      if (!currentUserId) return;

      setLoading(true);
      try {
        const { data, error: fetchUsersError } = await supabase
          .from("profiles")
          .select("id, username, full_name, avatar_url")
          .neq("id", currentUserId);

        if (fetchUsersError) throw fetchUsersError;

        setAllUsers(data || []);
        setError(null);
      } catch (err) {
        console.error("Error fetching all users:", err);
        setError("Failed to load users for group creation.");
        setAllUsers([]);
      } finally {
        setLoading(false);
      }
    };

    fetchAllUsers();
  }, [currentUserId]);

  return {
    allUsers,
    loading,
    error,
  };
}
