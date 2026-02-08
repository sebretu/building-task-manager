import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const { client, userId } = await createServerSupabaseClient(req);

    // GET /api/users - list all users
    if (req.method === "GET") {
      const { data, error } = await client
        .from("profiles")
        .select("id, full_name, email, role, company_id, is_active, created_at")
        .order("created_at", { ascending: false });

      if (error) {
        return res.status(400).json({ ok: false, error });
      }

      return res.status(200).json(data || []);
    }

    // POST /api/users/invite - invite new user
    if (req.method === "POST") {
      const { email, full_name, company_id, role } = req.body;

      if (!email || !full_name) {
        return res
          .status(400)
          .json({
            ok: false,
            error: { message: "Email and full_name are required" },
          });
      }

      // Create user in profiles table
      const { data, error } = await client
        .from("profiles")
        .insert([
          {
            email,
            full_name,
            role: role || "USER",
            company_id: company_id || null,
            is_active: true,
          },
        ])
        .select("id, full_name, email, role, company_id, is_active, created_at")
        .single();

      if (error) {
        return res.status(400).json({ ok: false, error });
      }

      return res.status(201).json(data);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Error in /api/users:", err);
    return res
      .status(500)
      .json({
        error: "Internal server error",
        message: err instanceof Error ? err.message : String(err),
      });
  }
}
