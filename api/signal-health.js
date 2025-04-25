import * as Signal from "@signalapp/libsignal-client";

export default async function handler(request, response) {
  try {
    // Import is now at the top level using named export style

    // Check for function existence on the imported namespace
    if (Signal && typeof Signal.PrivateKey_Generate === "function") {
      response.status(200).json({
        message:
          "Successfully imported @signalapp/libsignal-client using ESM * import. Found PrivateKey_Generate function.",
      });
    } else {
      // Log what Signal actually contains for debugging
      console.log("Signal module content:", Object.keys(Signal));
      response.status(500).json({
        message:
          "Imported @signalapp/libsignal-client using ESM * import, but PrivateKey_Generate not found directly.",
        importedKeys: Signal ? Object.keys(Signal) : null,
      });
    }
  } catch (error) {
    console.error(
      "Error importing @signalapp/libsignal-client in Vercel function (ESM *):",
      error
    );
    response.status(500).json({
      message:
        "Failed to import @signalapp/libsignal-client using ESM * import.",
      error: error.message,
      stack: error.stack, // Include stack for debugging
    });
  }
}
