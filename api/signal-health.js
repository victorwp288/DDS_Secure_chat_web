export default function handler(request, response) {
  try {
    // Attempt to import the library
    const Signal = require("@signalapp/libsignal-client");

    // If import succeeds, maybe check for a specific function existence
    if (Signal && typeof Signal.PrivateKey_Generate === "function") {
      response.status(200).json({
        message:
          "Successfully imported @signalapp/libsignal-client. Found PrivateKey_Generate function.",
      });
    } else {
      response.status(500).json({
        message:
          "Imported @signalapp/libsignal-client, but it seems incomplete or structured unexpectedly.",
        importedModule: typeof Signal,
      });
    }
  } catch (error) {
    console.error(
      "Error importing @signalapp/libsignal-client in Vercel function:",
      error
    );
    response.status(500).json({
      message: "Failed to import @signalapp/libsignal-client.",
      error: error.message,
      stack: error.stack, // Include stack for debugging
    });
  }
}
