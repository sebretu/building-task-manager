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
        console.log('[orders api] userId from token:', userId);
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const supabase = getAdminClient();

        // Get user role
        const { data: profile, error: profileErr } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", userId)
            .single();

        console.log('[orders api] profile:', profile, 'profileErr:', profileErr);
        const isAdmin = profile?.role === "ADMIN" || profile?.role === "admin";

        if (req.method === "GET") {
            const projectId = req.query.projectId as string;
            const status = req.query.status as string;

            let query = supabase
                .from("orders")
                .select(`
          *,
          user:profiles(id, full_name, role),
          items:order_items(
            id,
            quantity,
            custom_name,
            custom_unit,
            material:materials(id, name, unit, category)
          )
        `)
                .order("created_at", { ascending: false });

            if (projectId) {
                query = query.eq("project_id", projectId);
            }

            if (status) {
                query = query.eq("status", status);
            }

            if (!isAdmin) {
                // Normal users only see their own orders
                query = query.eq("user_id", userId);
            }

            const { data: orders, error } = await query;

            if (error) throw error;
            // DEBUG: log first item's material category
            const firstItem = orders?.[0]?.items?.[0];
            console.log('[orders debug] first item material:', JSON.stringify(firstItem?.material));
            return res.status(200).json({ ok: true, data: orders || [] });
        }

        if (req.method === "POST") {
            const { projectId, items } = req.body;

            if (!projectId) {
                return res.status(400).json({ error: "projectId is required" });
            }

            if (!items || !Array.isArray(items) || items.length === 0) {
                return res.status(400).json({ error: "Order must contain at least one item" });
            }

            // Check if project exists and user has access (either assigned or admin)
            // For now, simpler check - project must exist
            const { data: projectData, error: projErr } = await supabase
                .from("projects")
                .select("id")
                .eq("id", projectId)
                .single();

            if (projErr || !projectData) {
                return res.status(404).json({ error: "Project not found" });
            }

            // 1. Create the order
            const { data: order, error: orderErr } = await supabase
                .from("orders")
                .insert({
                    project_id: projectId,
                    user_id: userId,
                    status: "PENDING",
                })
                .select()
                .single();

            if (orderErr) throw orderErr;

            // 2. Prepare order items
            const insertItems = items.map((item: any) => {
                if (!item.quantity || item.quantity <= 0) {
                    throw new Error("Invalid quantity");
                }

                const baseItem = {
                    order_id: order.id,
                    quantity: item.quantity,
                    material_id: null,
                    custom_name: null,
                    custom_unit: null,
                };

                if (item.materialId) {
                    baseItem.material_id = item.materialId;
                } else if (item.customName) {
                    baseItem.custom_name = item.customName;
                    baseItem.custom_unit = item.customUnit || "szt.";
                } else {
                    throw new Error("Item must have either materialId or customName");
                }

                return baseItem;
            });

            // 3. Insert items
            const { error: itemsErr } = await supabase
                .from("order_items")
                .insert(insertItems);

            if (itemsErr) {
                // Rollback the order if items fail
                await supabase.from("orders").delete().eq("id", order.id);
                throw itemsErr;
            }

            return res.status(200).json({ ok: true, data: order });
        }

        if (req.method === "PATCH") {
            // Only admins can update order statuses
            if (!isAdmin) {
                return res.status(403).json({ error: "Forbidden: Admins only" });
            }

            const { orderId, status } = req.body;

            if (!orderId || !status) {
                return res.status(400).json({ error: "orderId and status are required" });
            }

            const allowedStatuses = ["PENDING", "APPROVED", "REJECTED", "DELIVERED"];
            if (!allowedStatuses.includes(status)) {
                return res.status(400).json({ error: "Invalid status" });
            }

            const { data: order, error } = await supabase
                .from("orders")
                .update({
                    status,
                    updated_at: new Date().toISOString()
                })
                .eq("id", orderId)
                .select()
                .single();

            if (error) throw error;
            return res.status(200).json({ ok: true, data: order });
        }

        if (req.method === "DELETE") {
            if (!isAdmin) {
                return res.status(403).json({ ok: false, error: { message: "Forbidden: Admins only" } });
            }

            const id = req.query.id as string;
            if (!id) {
                return res.status(400).json({ ok: false, error: { message: "Missing order id" } });
            }

            // Delete order items first (if no cascade), then order
            await supabase.from("order_items").delete().eq("order_id", id);
            const { error } = await supabase.from("orders").delete().eq("id", id);
            if (error) throw error;

            return res.status(200).json({ ok: true, data: { deleted: id } });
        }

        res.setHeader("Allow", ["GET", "POST", "PATCH", "DELETE"]);
        return res.status(405).json({ error: `Method ${req.method} not allowed` });
    } catch (error: any) {
        console.error("Orders API error:", error);
        return res.status(500).json({ error: error.message || "Internal server error" });
    }
}
