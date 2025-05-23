# Secure E2EE Chat Application

A real-time chat application featuring end-to-end encryption (E2EE) using the Signal Protocol. Built with React, Vite, Supabase, and TailwindCSS.

## Key Features

*   **User Authentication**: Secure sign-up, login, and profile management.
*   **Real-time Chat**: Engage in 1-on-1 and group conversations instantly.
*   **End-to-End Encryption**: All messages are secured with the Signal Protocol, ensuring private communication.
*   **Conversation Lifecycle**: Manage chat invitations with accept/reject options.
*   **File Attachments**: Share files within your conversations. (Note: E2EE handling for files should be verified by the user.)
*   **Emoji Picker**: Express yourself with a wide range of emojis.

## Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

*   Node.js (v18 or newer recommended)
*   npm (comes with Node.js)

### Cloning the Repository

```bash
git clone https://github.com/your-username/your-repository-name.git
cd your-repository-name
```
(Replace `https://github.com/your-username/your-repository-name.git` with the actual URL of this repository)

### Installation

Install the project dependencies:

```bash
npm install
```

### Environment Setup

1.  **Create `.env` file**:
    In the root directory of the project, create a new file named `.env`.

2.  **Client-Side Variables**:
    Add the following variables to your `.env` file, replacing the placeholder values with your actual Supabase and backend details:

    ```env
    VITE_SUPABASE_URL="your_supabase_url"
    VITE_SUPABASE_ANON_KEY="your_supabase_anon_key"
    VITE_BACKEND_URL="your_deployed_api_url"
    ```
    *   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`: Your Supabase project URL and anonymous key.
    *   `VITE_BACKEND_URL`: The URL where your backend API functions (in the `api/` directory) are deployed (e.g., your Vercel project URL).

3.  **Server-Side Variables (for API functions/Vercel)**:
    These variables are needed for the serverless functions in the `api/` directory. If deploying to Vercel (or similar), set these in your Vercel project's environment variable settings. For local development of these functions using Vercel CLI, you can add them to a `.env` file that Vercel CLI uses or set them directly in your local environment.

    ```env
    SUPABASE_URL="your_supabase_url"
    SUPABASE_SERVICE_ROLE_KEY="your_supabase_service_role_key"
    ```
    *   `SUPABASE_URL`: Your Supabase project URL.
    *   `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key (provides admin-level access, keep it secret).

### Running the Application Locally

*   **Frontend (Vite Development Server)**:
    ```bash
    npm run dev
    ```
    This will start the Vite development server, typically on `http://localhost:5173`.

*   **Backend API Functions (Serverless)**:
    The backend API routes are located in the `api/` directory and are designed to be deployed as serverless functions (e.g., on Vercel).
    To run these locally alongside your frontend for development, you can use the Vercel CLI:
    1.  Install Vercel CLI: `npm install -g vercel`
    2.  Run Vercel development server: `vercel dev`
    This will typically start a server on a different port (e.g., `http://localhost:3000`) that serves both your frontend and simulates the serverless environment for your API functions. Ensure your `VITE_BACKEND_URL` in the `.env` file for the frontend points to this local Vercel server URL if you are testing them together.

### Building for Production

To create a production build of the frontend:

```bash
npm run build
```
This will output the static files to the `dist/` directory.

## Project Structure

A brief overview of the key directories:

*   `src/`: Contains the core frontend React application code.
    *   `components/`: Reusable UI components (e.g., buttons, modals).
    *   `pages/`: Top-level components representing different pages/views of the application.
    *   `lib/`: Utility functions, Supabase client configuration, Signal protocol helper functions, and custom data stores.
    *   `hooks/`: Custom React hooks for shared logic.
    *   `assets/`: Static assets like images and SVGs used directly by the React code.
*   `api/`: Contains the serverless functions that make up the backend of the application (e.g., for handling Signal Protocol key bundles, device registration).
*   `public/`: Static assets that are served directly by the webserver (e.g., `favicon.ico`, images).
*   `.github/`: GitHub specific files, like workflow definitions.
*   `eslint.config.js`: ESLint configuration.
*   `index.html`: The main HTML entry point for the Vite application.
*   `package.json`: Project metadata, dependencies, and scripts.
*   `vite.config.js`: Vite build tool configuration.

## Tech Stack

*   **Frontend**: React, Vite, JavaScript (with some TypeScript utility files)
*   **Styling**: TailwindCSS
*   **Backend**: Serverless Functions (Node.js, deployed on Vercel)
*   **Database & Auth**: Supabase (Authentication, Realtime Database, Functions for some parts if any)
*   **E2EE**: Signal Protocol (via `@privacyresearch/libsignal-protocol-typescript`)
*   **Routing**: React Router
*   **UI Components**: Shadcn/ui (likely, based on component structure)
