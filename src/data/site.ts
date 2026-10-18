import type { NetlifySitesResult, PreviewsResult, SiteChange } from '../domain/site.ts';
import type { Project } from '../domain/types.ts';
import type { Backend, SupabaseConfig } from './client.ts';

// Site previews: the netlify Edge Function for Netlify data and framing checks, and
// Storage for uploaded screenshots. Loaded on demand; nothing here is in the entry bundle.

const BUCKET = 'project-screenshots';
const SIGNED_URL_SECONDS = 60 * 60;
/** Screenshots are stored downscaled to this width as WebP. */
const MAX_WIDTH = 1600;

export interface SiteSource {
  previews(projectIds: readonly string[]): Promise<PreviewsResult>;
  netlifySites(): Promise<NetlifySitesResult>;
  /** Short-lived URLs for uploaded screenshots, by storage path. Missing paths are left out. */
  screenshotUrls(paths: readonly string[]): Promise<ReadonlyMap<string, string>>;
  /** Saves the site URL and Netlify link, and uploads, replaces or removes the screenshot. */
  save(project: Pick<Project, 'id' | 'screenshotPath'>, change: SiteChange): Promise<void>;
}

/** Shrinks big screenshots before upload; falls back to the original if the browser can't. */
async function shrink(file: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_WIDTH / bitmap.width);
    const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const webp = await canvas.convertToBlob({ type: 'image/webp', quality: 0.85 });
    return webp.type === 'image/webp' && webp.size < file.size ? webp : file;
  } catch {
    return file;
  }
}

export function supabaseSite(backend: Backend, config: SupabaseConfig): SiteSource {
  const headers = async (extra: Record<string, string> = {}): Promise<Headers> => {
    const { data } = await backend.auth.getSession();
    return new Headers({
      apikey: config.publishableKey,
      Authorization: `Bearer ${data.session?.access_token ?? config.publishableKey}`,
      ...extra,
    });
  };

  const call = async <T>(path: string, init: RequestInit): Promise<T> => {
    const res = await fetch(`${config.url}${path}`, init);
    const out = (await res.json().catch(() => ({}))) as { error?: unknown; message?: unknown };
    if (!res.ok) {
      const why = typeof out.error === 'string' ? out.error : typeof out.message === 'string' ? out.message : '';
      throw new Error(why || `Request failed (${res.status})`);
    }
    return out as T;
  };

  const fn = <T>(body: unknown): Promise<T> => backend.invoke<T>('netlify', body);

  const remove = async (paths: readonly string[]): Promise<void> => {
    if (!paths.length) return;
    await call(`/storage/v1/object/${BUCKET}`, {
      method: 'DELETE',
      headers: await headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefixes: paths }),
    });
  };

  return {
    previews: (projectIds) => fn<PreviewsResult>({ action: 'previews', projectIds }),
    netlifySites: () => fn<NetlifySitesResult>({ action: 'sites' }),

    async screenshotUrls(paths) {
      if (!paths.length) return new Map();
      const signed = await call<{ path: string | null; signedURL: string | null }[]>(`/storage/v1/object/sign/${BUCKET}`, {
        method: 'POST',
        headers: await headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ expiresIn: SIGNED_URL_SECONDS, paths }),
      });
      const out = new Map<string, string>();
      for (const s of signed) if (s.path && s.signedURL) out.set(s.path, `${config.url}/storage/v1${s.signedURL}`);
      return out;
    },

    async save(project, { siteUrl, netlifySiteId, screenshot }) {
      let path = project.screenshotPath;
      if (screenshot.kind === 'replace') {
        const { data } = await backend.auth.getSession();
        const userId = data.session?.user.id;
        if (!userId) throw new Error('Sign in again to upload a screenshot.');
        const body = await shrink(screenshot.file);
        // A new name per upload, so a cached copy of the old image never shows.
        path = `${userId}/${project.id}/${Date.now()}`;
        await call(`/storage/v1/object/${BUCKET}/${path}`, {
          method: 'POST',
          headers: await headers({ 'Content-Type': body.type || 'image/png', 'Cache-Control': 'max-age=31536000' }),
          body,
        });
      } else if (screenshot.kind === 'remove') path = null;

      const { error } = await backend.db
        .from('projects')
        .update({ site_url: siteUrl.trim() || null, netlify_site_id: netlifySiteId || null, screenshot_path: path })
        .eq('id', project.id);
      if (error) throw new Error(error.message);
      // The row no longer points at the old file; a failed cleanup only leaves an orphan.
      if (project.screenshotPath && project.screenshotPath !== path) await remove([project.screenshotPath]).catch(() => undefined);
    },
  };
}
