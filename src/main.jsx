import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

// Helper to unregister stale service workers (temporary fix for cached broken bundles)
if ("serviceWorker" in navigator) {
  // Check if we need to clear old cached versions
  const isOldCache = localStorage.getItem("sw-cleared") !== "v2";
  if (isOldCache) {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        registrations.forEach((registration) => {
          console.log(
            "[PWA] Unregistering old service worker:",
            registration.scope
          );
          registration.unregister();
        });
        localStorage.setItem("sw-cleared", "v2");
        console.log("[PWA] Old service workers cleared");
      })
      .catch((err) =>
        console.error("[PWA] Error clearing old service workers:", err)
      );
  }
}

// PWA Service Worker Registration
if ("serviceWorker" in navigator) {
  // Register the PWA service worker
  import("virtual:pwa-register")
    .then(({ registerSW }) => {
      const updateSW = registerSW({
        onNeedRefresh() {
          console.log(
            "[PWA] New content available, will update on next app restart"
          );
          // You could show a toast here asking user to refresh
          if (confirm("New content available. Reload to update?")) {
            updateSW(true);
          }
        },
        onOfflineReady() {
          console.log("[PWA] App ready to work offline");
          // You could show a toast here
        },
        onRegistered(r) {
          console.log("[PWA] SW Registered: ", r);
        },
        onRegisterError(error) {
          console.error("[PWA] SW registration error", error);
        },
      });
    })
    .catch((err) => {
      console.error("[PWA] Failed to register SW:", err);
    });
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
