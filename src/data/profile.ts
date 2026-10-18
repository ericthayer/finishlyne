import type { User } from '@supabase/auth-js';
import type { Backend } from './client.ts';

/** Who is signed in, from the GitHub identity Supabase keeps with the session. No extra request. */
export interface Profile {
  name: string;
  /** GitHub login, without the @. Null if the provider did not send one. */
  login: string | null;
  avatarUrl: string | null;
  /** When this account first signed in to Finishlyne. */
  since: string;
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

export function toProfile(user: Pick<User, 'user_metadata' | 'email' | 'created_at'>): Profile {
  const meta = user.user_metadata;
  const login = text(meta['user_name']) ?? text(meta['preferred_username']);
  const avatar = text(meta['avatar_url']);
  return {
    name: text(meta['full_name']) ?? text(meta['name']) ?? login ?? user.email ?? 'You',
    login,
    avatarUrl: avatar?.startsWith('https://') ? avatar : null,
    since: user.created_at,
  };
}

export async function loadProfile(backend: Backend): Promise<Profile | null> {
  const { data } = await backend.auth.getSession();
  return data.session ? toProfile(data.session.user) : null;
}
