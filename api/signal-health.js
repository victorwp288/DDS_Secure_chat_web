import Signal from "@signalapp/libsignal-client";

export default async function handler(request, response) {
  try {
    // Import is now at the top level

    // Check for function existence
    if (Signal && typeof Signal.PrivateKey_Generate === "function") {
      response.status(200).json({
        message:
          "Successfully imported @signalapp/libsignal-client using ESM import. Found PrivateKey_Generate function.",
      });
    } else {
      response.status(500).json({
        message:
          "Imported @signalapp/libsignal-client using ESM import, but it seems incomplete or structured unexpectedly.",
        importedModule: typeof Signal,
      });
    }
  } catch (error) {
    console.error(
      "Error importing @signalapp/libsignal-client in Vercel function (ESM):",
      error
    );
    response.status(500).json({
      message: "Failed to import @signalapp/libsignal-client using ESM import.",
      error: error.message,
      stack: error.stack, // Include stack for debugging
    });
  }
}
