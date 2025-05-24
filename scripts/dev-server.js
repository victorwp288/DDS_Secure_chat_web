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
    console.log(`[DEBUG] Handling route: ${routePath}`);
    const apiPath = join(projectRoot, "api", routePath);
    console.log(`[DEBUG] API path: ${apiPath}`);

    let handlerPath;
    let params = {};

    // First, try to find the exact file
    if (fs.existsSync(apiPath + ".js")) {
      handlerPath = apiPath + ".js";
      console.log(`[DEBUG] Found exact file: ${handlerPath}`);
    } else if (fs.existsSync(join(apiPath, "index.js"))) {
      handlerPath = join(apiPath, "index.js");
      console.log(`[DEBUG] Found index file: ${handlerPath}`);
    } else {
      console.log(`[DEBUG] No exact file found, looking for dynamic routes`);
      // If exact file doesn't exist, look for dynamic routes
      const pathParts = routePath.split("/");
      console.log(`[DEBUG] Path parts:`, pathParts);
      const apiDir = join(projectRoot, "api");

      // Try to find a matching dynamic route
      let currentDir = apiDir;
      let found = false;

      for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i];
        console.log(`[DEBUG] Processing part ${i}: ${part}`);
        const directPath = join(currentDir, part);

        if (
          fs.existsSync(directPath) &&
          fs.statSync(directPath).isDirectory()
        ) {
          // Direct directory exists, continue
          currentDir = directPath;
          console.log(`[DEBUG] Found directory: ${currentDir}`);
        } else {
          // Look for dynamic route in current directory
          console.log(`[DEBUG] Looking for dynamic routes in: ${currentDir}`);
          const files = fs.readdirSync(currentDir);
          console.log(`[DEBUG] Files in directory:`, files);
          let foundDynamic = false;

          for (const file of files) {
            if (file.includes("[") && file.includes("]")) {
              console.log(`[DEBUG] Found dynamic file: ${file}`);
              const paramName = file
                .replace("[", "")
                .replace("]", "")
                .replace(".js", "");
              params[paramName] = part;
              console.log(`[DEBUG] Setting param ${paramName} = ${part}`);

              if (i === pathParts.length - 1) {
                // This is the last part, should be a .js file
                const dynamicFile = join(currentDir, file);
                if (fs.existsSync(dynamicFile)) {
                  handlerPath = dynamicFile;
                  found = true;
                  console.log(`[DEBUG] Found handler file: ${handlerPath}`);
                  break;
                }
              } else {
                // This is a directory, continue
                const dynamicDir = join(currentDir, file);
                if (
                  fs.existsSync(dynamicDir) &&
                  fs.statSync(dynamicDir).isDirectory()
                ) {
                  currentDir = dynamicDir;
                  foundDynamic = true;
                  console.log(
                    `[DEBUG] Moving to dynamic directory: ${currentDir}`
                  );
                  break;
                }
              }
            }
          }

          if (!foundDynamic && !found) {
            console.log(`[DEBUG] No dynamic route found, breaking`);
            break;
          }
        }
      }

      if (!found && !handlerPath) {
        console.log(`[DEBUG] No handler found, returning 404`);
        res.status(404).json({ error: "API route not found" });
        return;
      }
    }

    if (!handlerPath) {
      console.log(`[DEBUG] No handler path set, returning 404`);
      res.status(404).json({ error: "API route not found" });
      return;
    }

    console.log(`[DEBUG] Using handler: ${handlerPath}`);
    console.log(`[DEBUG] Params:`, params);

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
