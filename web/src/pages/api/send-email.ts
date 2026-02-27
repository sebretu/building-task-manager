import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile, isAdminRole } from "@/lib/server/requesterProfile";

type ApiOk = { ok: true; data: any };
type ApiErr = { ok: false; error: { code: string; message: string } };

function readJsonBody(req: NextApiRequest): any {
    if (typeof req.body === "string") {
        try {
            return JSON.parse(req.body);
        } catch {
            return null;
        }
    }
    return req.body;
}

function getFunctionsBaseUrl() {
    if (process.env.SUPABASE_FUNCTIONS_URL) return process.env.SUPABASE_FUNCTIONS_URL;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    return supabaseUrl ? `${supabaseUrl}/functions/v1` : "";
}

async function sendNotificationEmail(authToken: string, input: { to: string; subject: string; html: string }) {
    const baseUrl = getFunctionsBaseUrl();
    if (!baseUrl) {
        throw new Error("Missing Supabase Functions URL");
    }

    if (!authToken) {
        throw new Error("Missing Supabase Auth Token");
    }

    const res = await fetch(`${baseUrl}/notify-task`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(input),
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Edge function error: ${res.status} - ${errText}`);
    }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use POST" } });
    }

    let supabase: any;
    let userId: string | null = null;

    try {
        ({ client: supabase, userId } = createServerSupabaseClient(req));
    } catch (e: any) {
        return res.status(401).json({ ok: false, error: { code: 'AUTH_INVALID', message: 'Missing Bearer token' } });
    }

    let requester: { id: string; role: string | null };
    try {
        requester = await requireRequesterProfile(supabase, userId);
    } catch (err: any) {
        return res.status(err?.status || 403).json({
            ok: false,
            error: {
                code: err?.code || "PROFILE_ERROR",
                message: err?.message || "Unable to load profile",
            },
        });
    }

    if (!isAdminRole(requester.role)) {
        return res.status(403).json({
            ok: false,
            error: { code: "FORBIDDEN", message: "Only administrators can send these emails" }
        });
    }

    const body = readJsonBody(req);
    const { to, subject, html } = body || {};

    if (!to || !subject || !html) {
        return res.status(400).json({
            ok: false,
            error: { code: "BAD_REQUEST", message: "Missing to, subject, or html parameters" }
        });
    }

    try {
        const authHeader = req.headers.authorization || "";
        const token = authHeader.replace(/^Bearer\s+/i, "").trim();

        await sendNotificationEmail(token, { to, subject, html });
        return res.status(200).json({ ok: true, data: { sent: true } });
    } catch (error: any) {
        console.error("[send-email api] Error sending email:", error);
        return res.status(500).json({
            ok: false,
            error: { code: "INTERNAL_ERROR", message: error.message || "Error sending email" }
        });
    }
}
