import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useSignal } from "../lib/signalContext.jsx";

export function useCurrentUser() {
  const [currentUser, setCurrentUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();
  const sig = useSignal();
  const { signalStore } = sig || {};

  useEffect(() => {
    if (!sig) {
      console.log("[useCurrentUser] Signal context hook not ready, deferring.");
      return;
    }

    const fetchUserAndProfile = async () => {
      console.log("[useCurrentUser] Running fetchUserAndProfile...");
      setLoading(true);

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        console.error("Error getting session:", sessionError);
        setError("Failed to load user session.");
        setLoading(false);
        return;
      }

      if (!session?.user) {
        console.log("No user session found, redirecting to login.");
        navigate("/login");
        return;
      }

      setCurrentUser(session.user);

      if (session?.user && signalStore) {
        try {
          console.log(
            "[useCurrentUser] Initializing Signal protocol via context store for",
            session.user.id
          );
        } catch (initError) {
          console.error(
            "[useCurrentUser] Failed to initialize Signal protocol:",
            initError
          );
          setError(
            `Failed to initialize secure session keys: ${initError.message}`
          );
          setLoading(false);
          return;
        }
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url, status")
        .eq("id", session.user.id)
        .single();

      if (profileError && profileError.code !== "PGRST116") {
        console.error("Error fetching profile:", profileError);
        setError(`Failed to load user profile: ${profileError.message}`);
      } else if (!profileData) {
        console.warn(
          "[useCurrentUser] Profile not found for user:",
          session.user.id
        );
        setError("User profile not found. Please complete profile setup.");
      } else {
        setProfile(profileData);
        setError(null);
      }

      setLoading(false);
    };

    fetchUserAndProfile();
  }, [navigate, sig, signalStore]);

  const handleLogout = async () => {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      console.error("Error signing out from Supabase:", signOutError);
    }

    try {
      console.log(
        "[Logout] Selectively clearing localStorage (keeping _deviceId keys)...",
        localStorage
      );
      Object.keys(localStorage)
        .filter((k) => !k.endsWith("_deviceId"))
        .forEach((k) => {
          console.log(`[Logout] Removing localStorage item: ${k}`);
          localStorage.removeItem(k);
        });
      console.log(
        "[Logout] Selective localStorage clear complete.",
        localStorage
      );
    } catch (e) {
      console.error("[Logout] Error during selective localStorage clear:", e);
    }

    navigate("/login");
  };

  return {
    currentUser,
    profile,
    loading,
    error,
    handleLogout,
    setError,
  };
}
