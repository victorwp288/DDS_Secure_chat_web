import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";
import { fileURLToPath } from "url";
// Polyfill imports for Node core modules compatibility
import { nodePolyfills } from "vite-plugin-node-polyfills";

// Get the directory name in an ES module context
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Add Node.js polyfills for browser compatibility
    nodePolyfills({
      // Whether to polyfill `node:` protocol imports.
      protocolImports: true,
      // Whether to polyfill specific globals.
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      // Whether to polyfill the `util` module.
      util: true,
      // Optional: To reduce bundle size, you could specify only needed polyfills:
      // include: ['crypto', 'buffer', 'events', 'stream', 'util', 'path'],
    }),
    VitePWA({
      registerType: "autoUpdate",
      // Disable PWA in non-production builds to prevent stale cache issues
      devOptions: {
        enabled: false,
      },
      includeAssets: [
        "favicon.ico",
        "apple-touch-icon-180x180.png",
        "app-icon.svg",
      ],
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        navigateFallback: "index.html", // Enable navigate fallback for SPA routing
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 365 days
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 365 days
              },
            },
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "images-cache",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
        ],
        skipWaiting: true,
        clientsClaim: true,
      },
      manifest: {
        name: "SecureChat - End-to-End Encrypted Messaging",
        short_name: "SecureChat",
        description:
          "A secure, privacy-focused messaging platform with end-to-end encryption using the Signal Protocol",
        theme_color: "#064e3b",
        background_color: "#0f172a",
        display: "standalone",
        orientation: "portrait-primary",
        scope: "/",
        start_url: "/",
        categories: ["social", "communication", "productivity"],
        lang: "en-US",
        icons: [
          {
            src: "/pwa-64x64.png",
            sizes: "64x64",
            type: "image/png",
          },
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.js",
    css: true,
  },
  build: {
    // Target ES2018 for better Safari compatibility (supports Safari 12+)
    target: "es2018",
    chunkSizeWarningLimit: 2000, // Increase warning limit for large chunks
    rollupOptions: {
      onwarn(warning, warn) {
        // Suppress eval warnings from protobufjs
        if (
          warning.code === "EVAL" &&
          warning.id?.includes("@protobufjs/inquire")
        ) {
          return;
        }
        // Show all other warnings
        warn(warning);
      },
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"],
          signal: [
            "@privacyresearch/libsignal-protocol-typescript",
            "@signalapp/libsignal-client",
          ],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
});
