import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const { client } = await createServerSupabaseClient(req);
    const { id } = req.query;

    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "Company ID is required" });
    }

    // POST /api/companies/[id]/members - add user to company
    if (req.method === "POST") {
      const { user_id } = req.body;

      if (!user_id) {
        return res
          .status(400)
          .json({ error: "user_id is required" });
      }

      // Update user's company_id
      const { data, error } = await client
        .from("profiles")
        .update({ company_id: id })
        .eq("id", user_id)
        .select("id, full_name, email, role, company_id")
        .single();

      if (error) {
        return res.status(400).json({ ok: false, error });
      }

      return res.status(200).json(data);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Error in /api/companies/[id]/members:", err);
    return res
      .status(500)
      .json({
        error: "Internal server error",
        message: err instanceof Error ? err.message : String(err),
      });
  }
}
