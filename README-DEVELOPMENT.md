# Development Setup Guide

This project supports two development modes to accommodate different team setups:

## 🚀 Development Options

### Option 1: Vercel Dev (For Project Owner)

If you have access to the Vercel account:

```bash
vercel dev
```

This runs the full Vercel environment locally with API routes.

### Option 2: Local Development Server (For Team Members)

If you don't have Vercel access:

```bash
npm run dev:full
```

This runs both the Vite dev server and a local API server that mimics Vercel's functionality.

## 📋 Setup Instructions

### For Team Members (Local Development)

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd DDS_Secure_chat_web
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory:

   ```env
   # Supabase Configuration (ask project owner for these values)
   VITE_SUPABASE_URL=your_supabase_url_here
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
   SUPABASE_URL=your_supabase_url_here
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

   # API Configuration
   VITE_BACKEND_URL=http://localhost:3001/api
   API_PORT=3001
   ```

   > **Note:** Ask the project owner for the actual Supabase credentials.

4. **Run the development environment**

   ```bash
   npm run dev:full
   ```

   This will start:

   - Vite dev server on `http://localhost:5173`
   - Local API server on `http://localhost:3001`

### For Project Owner (Vercel Development)

1. **Continue using your existing setup**

   Make sure your `.env` file contains:

   ```env
   # Supabase Configuration
   VITE_SUPABASE_URL=your_supabase_url_here
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
   SUPABASE_URL=your_supabase_url_here
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

   # For Vercel Dev (usually port 3000)
   VITE_BACKEND_URL=http://localhost:3000/api
   ```

   Then run:

   ```bash
   vercel dev
   ```

2. **Alternative: Use local development**
   If you want to test the local setup or work offline, update your `.env`:

   ```env
   VITE_BACKEND_URL=http://localhost:3001/api
   ```

   Then run:

   ```bash
   npm run dev:full
   ```

## 🛠 Available Scripts

- `npm run dev` - Start only Vite dev server (requires API proxy)
- `npm run dev:full` - Start both Vite and local API server
- `npm run dev:api` - Start only the local API server
- `npm run dev:vite` - Start only the Vite dev server
- `vercel dev` - Start Vercel development environment (requires Vercel CLI and project access)

## 🌐 API Routes

The local development server supports all your existing API routes:

- `GET /api/` - Health check
- `POST /api/device/register` - Device registration
- `GET /api/device/[deviceId]` - Get device info
- `GET /api/signal/bundles/[userId]` - Signal protocol bundles
- `GET /api/conversations/` - List conversations
- `GET /api/conversations/[id]` - Get specific conversation
- And more...

## 🔄 How It Works

### Local Development Mode

When you run `npm run dev:full`:

1. **Vite Dev Server** starts on port 5173
2. **Local API Server** starts on port 3001
3. **Vite Proxy** forwards `/api/*` requests to the local API server
4. **API Server** dynamically loads and executes your Vercel-style API routes

### Vercel Development Mode

When you run `vercel dev`:

1. **Vercel CLI** handles everything
2. **No proxy needed** - direct API route execution
3. **Same API routes** work identically

## 🔧 Troubleshooting

### Common Issues

1. **Port conflicts**

   - Change API_PORT in your .env file
   - Make sure ports 3001 and 5173 are available

2. **API routes not working**

   - Ensure you're running `npm run dev:full` (not just `npm run dev`)
   - Check that the local API server started successfully

3. **Environment variables not loading**

   - Verify your `.env` file is in the project root
   - Restart the development servers after changing .env

4. **CORS errors**

   - The local server is configured for localhost:5173
   - If using different ports, update the CORS configuration in `scripts/dev-server.js`

5. **"Failed to fetch" or "Connection refused" errors**
   - Check that `VITE_BACKEND_URL` is correctly set in your `.env` file
   - For local development: `VITE_BACKEND_URL=http://localhost:3001/api`
   - For Vercel dev: `VITE_BACKEND_URL=http://localhost:3000/api`

### Debug Mode

To see detailed API server logs:

```bash
DEBUG=* npm run dev:api
```

## 🚀 Deployment

The project deploys to Vercel automatically. The local development setup doesn't affect production deployment - your API routes will work exactly the same way on Vercel.

## 🤝 Contributing

1. Use `npm run dev:full` for local development
2. Test your changes work with both development modes if possible
3. Ensure all API routes follow the existing Vercel function format
4. Update this documentation if you add new setup requirements
