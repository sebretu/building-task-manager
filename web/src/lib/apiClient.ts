"use client";

import { supabase } from "./supabase";

function looksLikeJwt(t: string | null | undefined) {
  if (!t) return false;
  const parts = t.split(".");
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

/**
 * Get current user's access token
 */
export async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const tok = data.session?.access_token ?? null;
  console.log('[apiClient] getToken:', tok ? (tok.slice(0,12)+'...') : null);
  return looksLikeJwt(tok) ? tok : null;
}

/**
 * Generic API client with automatic token injection
 */
export async function apiCall<T>(
  path: string,
  options?: {
    method?: string;
    body?: any;
    headers?: Record<string, string>;
    token?: string | null;
  }
): Promise<T> {
  const token = options?.token !== undefined ? options.token : await getToken();
  console.log('[apiClient] apiCall:', path, options?.method, 'token:', token);
  
  const headers: Record<string, string> = {
    ...options?.headers,
  };

  if (looksLikeJwt(token)) {
    headers.Authorization = `Bearer ${token}`;
  }

  const fetchOptions: any = {
    method: options?.method || "GET",
  };

  if (headers && Object.keys(headers).length > 0) {
    fetchOptions.headers = headers;
  }

  if (options?.body !== undefined) {
    fetchOptions.body =
      typeof options.body === "string" ? options.body : JSON.stringify(options.body);
    if (!headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
      fetchOptions.headers = headers;
    }
  }

  const r = await fetch(path, fetchOptions);
  const j = await r.json();

  if (!j.ok) {
    const msg = j?.error?.message || "API error";
    throw new Error(msg);
  }

  return j.data as T;
}

/**
 * Convenience: GET with auto-token
 */
export async function apiGet<T>(path: string, token?: string | null): Promise<T> {
  return apiCall<T>(path, { method: "GET", token });
}

/**
 * Convenience: POST with auto-token
 */
export async function apiPost<T>(path: string, body?: any, token?: string | null): Promise<T> {
  return apiCall<T>(path, { method: "POST", body, token });
}

/**
 * Convenience: PATCH with auto-token
 */
export async function apiPatch<T>(path: string, body?: any, token?: string | null): Promise<T> {
  return apiCall<T>(path, { method: "PATCH", body, token });
}

/**
 * Convenience: DELETE with auto-token
 */
export async function apiDelete<T>(path: string, token?: string | null): Promise<T> {
  return apiCall<T>(path, { method: "DELETE", token });
}
