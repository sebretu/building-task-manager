import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const id = String(req.query.id || "").trim();
    if (!id) return res.status(400).send("Missing query: id");

    console.log("[plans/pdf] id=", id);

    const { data: plan, error } = await supabase
      .from("plans")
      .select("storage_bucket, storage_path")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[plans/pdf] db error:", error.message);
      return res.status(500).send("DB error");
    }
    if (!plan) {
      console.warn("[plans/pdf] plan not found");
      return res.status(404).send("Plan not found");
    }

    console.log("[plans/pdf] storage:", plan.storage_bucket, plan.storage_path);

    const { data, error: dlErr } = await supabase.storage.from(plan.storage_bucket).download(plan.storage_path);

    if (dlErr || !data) {
      console.error("[plans/pdf] storage download error:", dlErr?.message || "no data");
      return res.status(404).send("PDF not found in storage");
    }

    const buf = Buffer.from(await data.arrayBuffer());
res.setHeader("Content-Disposition", 'inline; filename="plan.pdf"');
    res.setHeader("Content-Length", String(buf.length));
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(buf);
  } catch (e: any) {
    console.error("[plans/pdf] fatal:", e?.message || e);
    return res.status(500).send("Server error");
  }
}
