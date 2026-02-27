import { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { getUserIdFromRequest } from "@/lib/supabaseServer";

function getAdminClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    return createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        const userId = getUserIdFromRequest(req);
        if (!userId) {
            return res.status(401).json({ ok: false, error: { message: "Unauthorized" } });
        }

        const supabase = getAdminClient();

        // Get user role
        const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", userId)
            .single();

        const isAdmin = profile?.role === "ADMIN" || profile?.role === "admin";

        if (req.method === "GET") {
            const { search } = req.query;
            let query = supabase.from("materials").select("*").order("name", { ascending: true });

            if (typeof search === "string" && search.trim() !== "") {
                const s = search.trim();
                query = query.or(`name.ilike.%${s}%,category.ilike.%${s}%`);
            }

            const { data: materials, error } = await query.limit(50);

            if (error) throw error;
            return res.status(200).json({ ok: true, data: materials || [] });
        }

        if (req.method === "POST") {
            // Any authenticated user can add a material (e.g. auto-save custom items)
            // Admins can set a category; regular users get null category (can be updated later)
            const { name, unit, category } = req.body;
            if (!name || !unit) {
                return res.status(400).json({ ok: false, error: { message: "Name and unit are required" } });
            }

            // Check if material with same name already exists (case-insensitive) to avoid duplicates
            const { data: existing } = await supabase
                .from("materials")
                .select("id, name, unit")
                .ilike("name", name.trim())
                .maybeSingle();

            if (existing) {
                // Return existing material instead of duplicate
                return res.status(200).json({ ok: true, data: existing });
            }

            const { data: material, error } = await supabase
                .from("materials")
                .insert({
                    name: name.trim(),
                    unit: unit.trim(),
                    category: category ? category.trim() : null,
                })
                .select()
                .single();

            if (error) throw error;
            return res.status(200).json({ ok: true, data: material });
        }

        if (req.method === "PUT") {
            if (!isAdmin) {
                return res.status(403).json({ ok: false, error: { message: "Forbidden: Admins only" } });
            }

            const { id, name, unit, category } = req.body;
            if (!id || !name || !unit) {
                return res.status(400).json({ ok: false, error: { message: "ID, name and unit are required" } });
            }

            // Check if another material with the same name exists
            const { data: existing } = await supabase
                .from("materials")
                .select("id")
                .ilike("name", name.trim())
                .neq("id", id)
                .maybeSingle();

            if (existing) {
                return res.status(400).json({ ok: false, error: { message: "Material with this name already exists" } });
            }

            const { data: material, error } = await supabase
                .from("materials")
                .update({
                    name: name.trim(),
                    unit: unit.trim(),
                    category: category ? category.trim() : null,
                })
                .eq("id", id)
                .select()
                .single();

            if (error) throw error;
            return res.status(200).json({ ok: true, data: material });
        }

        if (req.method === "DELETE") {
            if (!isAdmin) {
                return res.status(403).json({ ok: false, error: { message: "Forbidden: Admins only" } });
            }

            const id = req.query.id as string;

            if (!id) {
                return res.status(400).json({ ok: false, error: { message: "Missing material ID" } });
            }

            const { error } = await supabase
                .from("materials")
                .delete()
                .eq("id", id);

            if (error) throw error;
            return res.status(200).json({ ok: true, data: { success: true } });
        }

        res.setHeader("Allow", ["GET", "POST", "PUT", "DELETE"]);
        return res.status(405).json({ ok: false, error: { message: `Method ${req.method} not allowed` } });
    } catch (error: any) {
        console.error("Materials API error:", error);
        return res.status(500).json({ ok: false, error: { message: error.message || "Internal server error" } });
    }
}
