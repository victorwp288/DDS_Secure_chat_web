// src/lib/db.js
import Dexie from "dexie";

export const db = new Dexie("secureChatDatabase");

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
