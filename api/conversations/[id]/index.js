import { supabaseAdmin } from "../../_supabase";

export default async function handler(req, res) {
  const { id } = req.query;
  if (req.method === "PATCH") {
    const { groupName, groupAvatarUrl } = req.body;
    const updates = {};
    if (groupName !== undefined) updates.group_name = groupName;
    if (groupAvatarUrl !== undefined) updates.group_avatar_url = groupAvatarUrl;
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const { data, error } = await supabaseAdmin
      .from("conversations")
      .update(updates)
      .eq("id", id)
      .eq("is_group", true)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Group not found" });

    return res.status(200).json({ conversation: data });
  }

  res.setHeader("Allow", "PATCH");
  return res.status(405).json({ error: "Method not allowed" });
}
