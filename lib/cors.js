// lib/cors.js
import Cors from "micro-cors";

export const cors = Cors({
  allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  origin: ["http://localhost:5173", "https://dds-secure-chat-web.vercel.app"],
});
