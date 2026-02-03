import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rpcListTasks, mapSupabaseError, AppError } from '@repo/supabase';
import type { Database } from '@repo/supabase';

const PROJECT_ID = '55555555-5555-5555-5555-555555555555';

export async function GET(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const auth = req.headers.get('authorization') || '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : null;

  if (!token) {
    return NextResponse.json(
      { ok: false, error: { code: 'AUTH_INVALID', message: 'Missing Bearer token' } },
      { status: 401 }
    );
  }

  const supabase = createClient<Database>(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });

  try {
    const data = await rpcListTasks(supabase as any, {
      p_project_id: PROJECT_ID,
      p_limit: 10,
      p_offset: 0
    });
    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    const err = e instanceof AppError ? e : mapSupabaseError(e);
    const status =
      err.code === 'RLS_FORBIDDEN' ? 403 :
      err.code === 'AUTH_EXPIRED' ? 401 :
      400;
    return NextResponse.json({ ok: false, error: { code: err.code, message: err.message, meta: err.meta } }, { status });
  }
}
