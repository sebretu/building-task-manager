import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerSupabaseClient } from '@/lib/supabaseServer';

type ApiOk = { ok: true; data: any[] };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET' } });
  }

  let supabase;
  try {
    ({ client: supabase } = createServerSupabaseClient(req));
  } catch (e: any) {
    return res.status(401).json({ ok: false, error: { code: 'AUTH_INVALID', message: 'Missing Bearer token' } });
  }

  const { data, error } = await supabase
    .from('projects')
    .select('id,name,address,is_archived,created_at,updated_at')
    .eq('is_archived', false)
    .order('created_at', { ascending: true });

  if (error) {
    // PostgREST error ma zwykle: message, code, details, hint, status
    return res.status((error as any).status || 400).json({
      ok: false,
      error: { code: 'SUPABASE', message: error.message, meta: { code: (error as any).code, details: (error as any).details } },
    });
  }

  return res.status(200).json({ ok: true, data: data ?? [] });
}
