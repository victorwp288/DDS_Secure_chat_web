// api/index.js
import { corsHandler } from "../lib/cors.js";

async function handler(req, res) {
  // Handle CORS
  const corsHandled = corsHandler(req, res);
  if (corsHandled) return;

  res.status(200).json({ message: "Secure Chat Backend (JS)" });
}

export default handler;
