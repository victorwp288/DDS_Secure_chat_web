// api/index.js
import { cors } from "../lib/cors.js";

async function handler(req, res) {
  res.status(200).json({ message: "Secure Chat Backend (JS)" });
}

export default cors(handler);
