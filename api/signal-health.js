import * as Signal from "@signalapp/libsignal-client";

export default async function handler(request, response) {
  try {
    // Import is now at the top level using named export style

    // Check for a static method on the PrivateKey class
    if (
      Signal &&
      Signal.PrivateKey &&
      typeof Signal.PrivateKey.generate === "function"
    ) {
      response.status(200).json({
        message:
          "Successfully imported @signalapp/libsignal-client. Found static method PrivateKey.generate.",
      });
    } else {
      // Log what Signal and Signal.PrivateKey actually contain for debugging
      console.log("Signal module content keys:", Object.keys(Signal));
      console.log("Signal.PrivateKey content type:", typeof Signal.PrivateKey);
      if (
        typeof Signal.PrivateKey === "object" ||
        typeof Signal.PrivateKey === "function"
      ) {
        try {
          console.log(
            "Signal.PrivateKey keys:",
            Object.keys(Signal.PrivateKey)
          );
        } catch (e) {
          console.log("Could not get keys of Signal.PrivateKey");
        }
      }

      response.status(500).json({
        message:
          "Imported @signalapp/libsignal-client, but PrivateKey.generate static method not found.",
        signalKeys: Signal ? Object.keys(Signal) : null,
        privateKeyType: typeof Signal.PrivateKey,
      });
    }
  } catch (error) {
    console.error(
      "Error during import/check in Vercel function (ESM *):",
      error
    );
    response.status(500).json({
      message: "Failed during import/check using ESM * import.",
      error: error.message,
      stack: error.stack, // Include stack for debugging
    });
  }
}
