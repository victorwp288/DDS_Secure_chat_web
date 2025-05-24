// scripts/dev-server.js
import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";
import { pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

const app = express();

// Middleware
app.use(express.json());

// CORS middleware - handle before API routes
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "http://localhost:5173");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.sendStatus(200);
    return;
  }
  next();
});

// Dynamic API route handler
async function handleApiRoute(req, res, routePath) {
  try {
    const apiPath = join(projectRoot, "api", routePath);

    // Check if it's a dynamic route (contains brackets)
    let actualPath = apiPath;
    let params = {};

    if (routePath.includes("[") && routePath.includes("]")) {
      // Handle dynamic routes like [id] or [userId]
      const parts = routePath.split("/");
      const actualParts = [];

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part.includes("[") && part.includes("]")) {
          // This is a dynamic segment
          const paramName = part.replace("[", "").replace("]", "");
          const pathSegments = req.path.split("/api/")[1].split("/");
          params[paramName] = pathSegments[i];
          actualParts.push(part);
        } else {
          actualParts.push(part);
        }
      }

      actualPath = join(projectRoot, "api", actualParts.join("/"));
    }

    // Try to find the handler file
    let handlerPath;
    if (fs.existsSync(actualPath + ".js")) {
      handlerPath = actualPath + ".js";
    } else if (fs.existsSync(join(actualPath, "index.js"))) {
      handlerPath = join(actualPath, "index.js");
    } else {
      res.status(404).json({ error: "API route not found" });
      return;
    }

    // Import and execute the handler
    const module = await import(
      pathToFileURL(handlerPath).href + "?t=" + Date.now()
    );
    const handler = module.default;

    if (typeof handler !== "function") {
      res.status(500).json({ error: "Invalid API handler" });
      return;
    }

    // Add params to request object
    req.query = { ...req.query, ...params };

    // Override response methods to prevent CORS conflicts
    const originalSetHeader = res.setHeader;
    res.setHeader = function (name, value) {
      // Skip CORS headers since we already set them
      if (name.toLowerCase().startsWith("access-control-")) {
        return;
      }
      return originalSetHeader.call(this, name, value);
    };

    // Execute the handler
    await handler(req, res);
  } catch (error) {
    console.error("API Error:", error);
    res
      .status(500)
      .json({ error: "Internal server error", details: error.message });
  }
}

// API route matcher
app.all("/api/*", async (req, res) => {
  const routePath = req.path.replace("/api/", "");
  await handleApiRoute(req, res, routePath);
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", message: "Local API server running" });
});

const PORT = process.env.API_PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Local API server running on http://localhost:${PORT}`);
  console.log(`📡 API endpoints available at http://localhost:${PORT}/api/*`);
});
