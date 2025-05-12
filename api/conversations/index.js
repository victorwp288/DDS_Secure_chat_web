import { supabaseAdmin } from "../_supabase";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { groupName, groupAvatarUrl, participantIds } = req.body;
  if (!Array.isArray(participantIds) || participantIds.length < 2) {
    return res
      .status(400)
      .json({
        error: "participantIds must be an array of at least 2 user IDs",
      });
  }

  // 1️⃣ Create the conversation row
  const { data: conv, error: convErr } = await supabaseAdmin
    .from("conversations")
    .insert({
      is_group: true,
      group_name: groupName || null,
      group_avatar_url: groupAvatarUrl || null,
    })
    .select()
    .single();

  if (convErr) {
    console.error("Error creating conversation:", convErr);
    return res.status(500).json({ error: convErr.message });
  }

  // 2️⃣ Add participants
  const rows = participantIds.map((pid) => ({
    conversation_id: conv.id,
    profile_id: pid,
  }));
  const { error: partErr } = await supabaseAdmin
    .from("conversation_participants")
    .insert(rows);

  if (partErr) {
    console.error("Error inserting participants:", partErr);
    return res.status(500).json({ error: partErr.message });
  }

  return res.status(201).json({ conversationId: conv.id });
}
