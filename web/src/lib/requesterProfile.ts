export type RequesterProfile = {
  id: string;
  role: string | null;
};

export async function requireRequesterProfile(client: any, userId: string | null): Promise<RequesterProfile> {
  if (!userId) {
    const err = new Error("AUTH_INVALID");
    (err as any).status = 401;
    (err as any).code = "AUTH_INVALID";
    throw err;
  }

  const { data, error } = await client
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .single();

  if (error || !data) {
    const err = new Error(error?.message || "PROFILE_NOT_FOUND");
    (err as any).status = (error as any)?.status || 403;
    (err as any).code = (error as any)?.code || "PROFILE_NOT_FOUND";
    throw err;
  }

  return data;
}

export function isAdminRole(role?: string | null): boolean {
  return (role || "").toUpperCase() === "ADMIN";
}
