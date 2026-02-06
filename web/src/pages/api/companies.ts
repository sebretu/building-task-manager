import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const { client, userId } = await createServerSupabaseClient(req);

    // GET /api/companies - list all companies
    if (req.method === "GET") {
      const { data, error } = await client
        .from("companies")
        .select("id, name, slug, is_active, created_at")
        .order("name");

      if (error) {
        return res.status(400).json({ ok: false, error });
      }

      return res.status(200).json(data || []);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Error in /api/companies:", err);
    return res
      .status(500)
      .json({
        error: "Internal server error",
        message: err instanceof Error ? err.message : String(err),
      });
  }
}
