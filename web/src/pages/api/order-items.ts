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

/**
 * PATCH /api/order-items
 * Body: { itemId: string, quantity?: number, customName?: string, customUnit?: string }
 * Admin only — allows editing a single order item's quantity, name and unit.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        const userId = getUserIdFromRequest(req);
        if (!userId) {
            return res.status(401).json({ ok: false, error: { message: "Unauthorized" } });
        }

        const supabase = getAdminClient();

        // Check admin role
        const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", userId)
            .single();

        const isAdmin = profile?.role === "ADMIN" || profile?.role === "admin";
        if (!isAdmin) {
            return res.status(403).json({ ok: false, error: { message: "Forbidden: Admins only" } });
        }

        if (req.method === "PATCH") {
            const { itemId, quantity, customName, customUnit } = req.body;

            if (!itemId) {
                return res.status(400).json({ ok: false, error: { message: "itemId is required" } });
            }

            // Build update object — only update fields that are provided
            const updateData: Record<string, any> = {};

            if (quantity !== undefined) {
                const qty = Number(quantity);
                if (isNaN(qty) || qty <= 0) {
                    return res.status(400).json({ ok: false, error: { message: "quantity must be a positive number" } });
                }
                updateData.quantity = qty;
            }

            if (customName !== undefined) {
                updateData.custom_name = customName ? customName.trim() : null;
            }

            if (customUnit !== undefined) {
                updateData.custom_unit = customUnit ? customUnit.trim() : null;
            }

            if (Object.keys(updateData).length === 0) {
                return res.status(400).json({ ok: false, error: { message: "Nothing to update" } });
            }

            const { data: item, error } = await supabase
                .from("order_items")
                .update(updateData)
                .eq("id", itemId)
                .select()
                .single();

            if (error) throw error;
            return res.status(200).json({ ok: true, data: item });
        }

        res.setHeader("Allow", ["PATCH"]);
        return res.status(405).json({ ok: false, error: { message: `Method ${req.method} not allowed` } });
    } catch (error: any) {
        console.error("Order items API error:", error);
        return res.status(500).json({ ok: false, error: { message: error.message || "Internal server error" } });
    }
}
