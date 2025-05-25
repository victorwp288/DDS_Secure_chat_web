// lib/cors.js
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000", // Add support for port 3000
  "https://dds-secure-chat-web.vercel.app",
  // Add any branch preview URLs that might be needed
  /^https:\/\/dds-secure-chat-git-.+\.vercel\.app$/,
  /^https:\/\/dds-secure-chat-.+\.vercel\.app$/,
];

export function corsHandler(req, res) {
  const origin = req.headers.origin;

  // Check if the origin is allowed
  const isAllowed = allowedOrigins.some((allowedOrigin) => {
    if (typeof allowedOrigin === "string") {
      return allowedOrigin === origin;
    } else if (allowedOrigin instanceof RegExp) {
      return allowedOrigin.test(origin);
    }
    return false;
  });

  if (isAllowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Max-Age", "86400"); // 24 hours

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return true; // Indicates that the request was handled
  }

  return false; // Indicates that the request should continue
}

// For backward compatibility, export a function that can be used as middleware
export const cors = (handler) => {
  return (req, res) => {
    const handled = corsHandler(req, res);
    if (!handled) {
      return handler(req, res);
    }
  };
};
