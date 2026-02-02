import { clamp01 } from '@repo/shared';
import { AppError } from '@repo/supabase';

export function repoSmoke(x: number) {
  const v = clamp01(x);
  return new AppError('UNKNOWN', 'ok', null, { v }).meta;
}
