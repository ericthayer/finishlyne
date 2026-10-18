import { GoTrueClient } from '@supabase/auth-js';
import { PostgrestClient } from '@supabase/postgrest-js';

// Supabase without the umbrella SDK: Auth and PostgREST only, which keeps the bundle small.
// Both values are public by design; row-level security protects the data.

export interface SupabaseConfig {
  url: string;
  publishableKey: string;
}

export function readConfig(env: Readonly<Record<string, unknown>> = import.meta.env): SupabaseConfig | null {
  const url = env['VITE_SUPABASE_URL'];
  const key = env['VITE_SUPABASE_PUBLISHABLE_KEY'];
  if (typeof url !== 'string' || typeof key !== 'string' || !url || !key) return null;
  return { url: url.replace(/\/+$/, ''), publishableKey: key };
}

export interface Backend {
  auth: GoTrueClient;
  db: PostgrestClient;
  /** POSTs `body` to an Edge Function as the signed-in user; rejects with the function's error message. */
  invoke<T>(fn: string, body: unknown): Promise<T>;
}

export function createBackend(config: SupabaseConfig): Backend {
  const ref = new URL(config.url).hostname.split('.')[0] ?? 'finishline';
  const auth = new GoTrueClient({
    url: `${config.url}/auth/v1`,
    headers: { apikey: config.publishableKey },
    storageKey: `sb-${ref}-auth-token`,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  });
  const db = new PostgrestClient(`${config.url}/rest/v1`, {
    headers: { apikey: config.publishableKey },
    // Every request carries the signed-in user's token so RLS sees auth.uid().
    fetch: async (input, init) => {
      const { data } = await auth.getSession();
      const headers = new Headers(init?.headers);
      headers.set('Authorization', `Bearer ${data.session?.access_token ?? config.publishableKey}`);
      return fetch(input, { ...init, headers });
    },
  });
  const invoke = async <T>(fn: string, body: unknown): Promise<T> => {
    const { data } = await auth.getSession();
    const res = await fetch(`${config.url}/functions/v1/${fn}`, {
      method: 'POST',
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${data.session?.access_token ?? config.publishableKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const out = (await res.json().catch(() => ({}))) as { error?: unknown };
    if (!res.ok) throw new Error(typeof out.error === 'string' ? out.error : `${fn} answered ${res.status}`);
    return out as T;
  };
  return { auth, db, invoke };
}
