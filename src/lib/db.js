// src/lib/db.js
import Dexie from "dexie";

export const db = new Dexie("secureChatDatabase");

// Increment version number for schema change
db.version(2)
  .stores({
    // Keep existing indexes, ensure 'id' is primary key (auto-handled if first field without '++')
    // Add 'content' field to store plaintext for sent messages
    messages: "id, conversationId, timestamp, content", // Add 'content'
  })
  .upgrade(() => {
    // No specific migration needed for just adding a field if Dexie handles it,
    // but keep the upgrade function structure.
    console.log("Upgrading Dexie schema to version 2 (added content field)");
  });

// Re-declare version 1 just in case upgrade logic needs it or for clarity
db.version(1).stores({
  // Using 'id' as the primary key (unique message UUID from Supabase)
  // Indexing 'conversationId' for fast lookups per chat
  // Indexing 'timestamp' for sorting
  messages: "id, conversationId, timestamp",
  // You might add other tables later (e.g., conversations, userSettings)
});

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
export async function cacheSentMessage(message) {
  // message should contain id, conversationId, timestamp, content, etc.
  // Ensure you pass the PLAINTEXT content here.
  console.log(
    `[Dexie Cache] Caching sent message ${message.id}:`,
    message.content
  );
  await db.messages.put(message);
}

// Helper function to get cached message plaintext
export async function getCachedMessageContent(messageId) {
  const cachedMsg = await db.messages.get(messageId);
  console.log(
    `[Dexie Cache] Cache lookup for ${messageId}: ${
      cachedMsg ? "Found" : "Not Found"
    }`
  );
  return cachedMsg?.content; // Return only the content or undefined
}
