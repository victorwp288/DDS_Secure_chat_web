import { supabaseAdmin } from "../../../../_supabase";

export default async function handler(req, res) {
  const { id, userId } = req.query;
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 1️⃣ Remove the participant
  const { error: delErr } = await supabaseAdmin
    .from("conversation_participants")
    .delete()
    .match({ conversation_id: id, profile_id: userId });
  if (delErr) {
    console.error("Error deleting participant:", delErr);
    return res.status(500).json({ error: delErr.message });
  }

  // 2️⃣ Check remaining participants
  const { data: remaining, error: fetchErr } = await supabaseAdmin
    .from("conversation_participants")
    .select("profile_id")
    .eq("conversation_id", id);
  if (fetchErr) {
    console.error("Error fetching participants:", fetchErr);
    return res.status(500).json({ error: fetchErr.message });
  }

  // 3️⃣ If none left, delete the conversation
  if (!remaining || remaining.length === 0) {
    const { error: convDelErr } = await supabaseAdmin
      .from("conversations")
      .delete()
      .eq("id", id);
    if (convDelErr) {
      console.error("Error deleting empty conversation:", convDelErr);
      // we still return 204 even if cleanup fails
    }
  }

  return res.status(204).end();
}
