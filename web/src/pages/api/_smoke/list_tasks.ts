import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { rpcListTasks, mapSupabaseError, AppError } from '@/lib/supabaseRpc';

const PROJECT_ID = '55555555-5555-5555-5555-555555555555';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || null;
  const auth = req.headers.authorization || '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : null;
  const effectiveToken = token || service || anon;

  if (!effectiveToken) {
    return res.status(401).json({ ok: false, error: { code: 'AUTH_INVALID', message: 'Missing Bearer token' } });
  }

  const supabase = createClient(url, (service || anon), {
    global: { headers: { Authorization: `Bearer ${effectiveToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });

  try {
    const data = await rpcListTasks(supabase as any, {
      p_project_id: PROJECT_ID,
      p_limit: 10,
      p_offset: 0
    });
    return res.status(200).json({ ok: true, data });
  } catch (e: any) {
    const err = e instanceof AppError ? e : mapSupabaseError(e);
    const status =
      err.code === 'RLS_FORBIDDEN' ? 403 :
      err.code === 'AUTH_EXPIRED' ? 401 :
      400;
    return res.status(status).json({ ok: false, error: { code: err.code, message: err.message, meta: err.meta } });
  }
}
