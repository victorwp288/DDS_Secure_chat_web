import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { useState, useEffect } from "react";
import "./index.css";
import HomePage from "./pages/HomePage"; // Import the HomePage
import SignupPage from "./pages/SignupPage"; // Import the SignupPage
import SettingsPage from "./pages/SettingsPage"; // Import the SettingsPage
import ProfilePage from "./pages/ProfilePage"; // Import the ProfilePage
import LoginPage from "./pages/LoginPage"; // Import the LoginPage
import ForgotPasswordPage from "./pages/ForgotPasswordPage"; // Import the ForgotPasswordPage
import ChatPage from "./pages/ChatPage"; // Import the ChatPage
import AboutPage from "./pages/AboutPage"; // Import the AboutPage
import CryptoTestPage from "./pages/CryptoTestPage"; // Import the CryptoTestPage
import PWAInstallPrompt from "./components/PWAInstallPrompt"; // Import PWA install prompt
import { supabase } from "./lib/supabaseClient"; // Assuming client is exported as supabase
import { SignalProvider } from "./lib/signalContext";

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    // Cleanup subscription on unmount
    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900 text-white">
        Loading Session...
      </div>
    );
  }

  return (
    <SignalProvider userId={session?.user?.id}>
      <Router>
        {/* PWA Install Prompt - shown globally */}
        <PWAInstallPrompt />

        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/crypto-test" element={<CryptoTestPage />} />
        </Routes>
      </Router>
    </SignalProvider>
  );
}

export default App;
