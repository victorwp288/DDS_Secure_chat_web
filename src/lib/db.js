// src/lib/db.js
import Dexie from "dexie";

// --- Namespacing Dexie Instances --- START ---
// Cache Dexie instances per userId
const dexieInstances = new Map();

/**
 * Gets a Dexie instance for the specific user.
 * @param {string} userId
 * @returns {Dexie}
 */
function getCacheDb(userId) {
  if (!userId) {
    throw new Error("[getCacheDb] userId is required.");
  }

  if (!dexieInstances.has(userId)) {
    const dbName = `SecureChatDB_${userId}`; // Use the same naming convention
    console.log(`[Dexie Cache] Creating/Getting instance for DB: ${dbName}`);
    const db = new Dexie(dbName);

    // Define the schema (make sure this matches the latest version needed)
    db.version(2).stores({
      messages: "id, conversationId, timestamp, content",
    });
    // Add migration logic if needed for future versions

    // You might need error handling for Dexie opening itself, though less common than raw IDB
    // db.open().catch(err => {
    //   console.error(`Failed to open Dexie DB ${dbName}:`, err);
    //   dexieInstances.delete(userId); // Remove instance if open fails
    // });

    dexieInstances.set(userId, db);
  }

  return dexieInstances.get(userId);
}
// --- Namespacing Dexie Instances --- END ---

// Example usage (can add helper functions here later if needed)
// export async function addMessage(message) {
//   await db.messages.put(message); // put handles add or update
// }

// export async function getMessagesForConversation(conversationId) {
//   return await db.messages
//     .where('conversationId')
//     .equals(conversationId)
//     .sortBy('timestamp');
// }

// Helper function to add/update message with plaintext
// Now requires userId to get the correct DB instance
export async function cacheSentMessage(userId, message) {
  if (!userId) throw new Error("cacheSentMessage requires userId.");
  const db = getCacheDb(userId);
  console.log(
    `[Dexie Cache] Caching sent message ${message.id} for user ${userId}:`,
    message.content
  );
  try {
    const putKey = await db.messages.put(message);
    console.log(
      `[Dexie Cache] Successfully put message ${message.id} for user ${userId} with key:`,
      putKey
    );
  } catch (error) {
    console.error(
      `[Dexie Cache] Error putting message ${message.id} for user ${userId}:`,
      error
    );
  }
}

// Helper function to get cached message plaintext
// Now requires userId
export async function getCachedMessageContent(userId, messageId) {
  if (!userId) throw new Error("getCachedMessageContent requires userId.");
  const db = getCacheDb(userId);
  const cachedMsg = await db.messages.get(messageId);
  console.log(
    `[Dexie Cache] Cache lookup for ${messageId} (User: ${userId}): ${
      cachedMsg ? "Found" : "Not Found"
    }`
  );
  return cachedMsg?.content;
}

// Helper function to get all cached messages for a conversation
export async function getCachedMessagesForConversation(userId, conversationId) {
  if (!userId)
    throw new Error("getCachedMessagesForConversation requires userId.");
  if (!conversationId)
    throw new Error(
      "getCachedMessagesForConversation requires conversationId."
    );

  const db = getCacheDb(userId);
  try {
    const cachedMessages = await db.messages
      .where("conversationId")
      .equals(conversationId)
      .toArray();

    console.log(
      `[Dexie Cache] Found ${cachedMessages.length} cached messages for conversation ${conversationId} (User: ${userId})`
    );

    return cachedMessages;
  } catch (error) {
    console.error(
      `[Dexie Cache] Error getting cached messages for conversation ${conversationId} (User: ${userId}):`,
      error
    );
    return [];
  }
}

// REMOVED: Old export
// export const db = new Dexie("secureChatDatabase");

// NEW: Export the necessary functions
export { getCacheDb };
