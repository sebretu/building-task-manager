export type RequesterProfile = {
  id: string;
  role: string | null;
  company_id: string | null;
};

export async function requireRequesterProfile(client: any, userId: string | null): Promise<RequesterProfile> {
  console.log('[requireRequesterProfile] called with userId:', userId);
  if (!userId) {
    const err = new Error("AUTH_INVALID");
    (err as any).status = 401;
    (err as any).code = "AUTH_INVALID";
    console.log('[requireRequesterProfile] No userId provided, throwing:', err);
    throw err;
  }


  const supaRes = await client
    .from("profiles")
    .select("id, role, company_id")
    .eq("id", userId)
    .single();

  console.log('[requireRequesterProfile] full supabase response:', supaRes);
  const { data, error, status, statusText } = supaRes;
  console.log('[requireRequesterProfile] query result:', { data, error, status, statusText });

  if (error || !data) {
    const err = new Error(error?.message || "PROFILE_NOT_FOUND");
    (err as any).status = (error as any)?.status || 403;
    (err as any).code = (error as any)?.code || "PROFILE_NOT_FOUND";
    console.log('[requireRequesterProfile] Error or no data found, throwing:', err);
    throw err;
  }

  console.log('[requireRequesterProfile] returning profile data:', data);
  return data;
}

export function isAdminRole(role?: string | null): boolean {
  return (role || "").toUpperCase() === "ADMIN";
}
