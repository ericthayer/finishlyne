// PostgREST with the service role: repo links and cached issues are written only here,
// after GitHub has confirmed the repo belongs to the caller's installation. Every query
// still filters on the caller's user id.

export interface Db {
  url: string;
  key: string;
}

export interface LinkRow {
  id: string;
  project_id: string;
  github_repo_id: number;
  full_name: string;
  installation_id: number;
  last_push_at: string | null;
}

export interface IssueRow {
  number: number;
  kind: 'issue' | 'pr';
  title: string;
  state: 'open';
  updated_at: string;
}

function headers(db: Db, extra: Record<string, string> = {}): Headers {
  const h = new Headers({ apikey: db.key, 'Content-Type': 'application/json', ...extra });
  // Legacy service-role keys are JWTs; new sb_secret_ keys go in apikey only.
  if (db.key.startsWith('ey')) h.set('Authorization', `Bearer ${db.key}`);
  return h;
}

async function rest<T>(db: Db, path: string, init: RequestInit & { prefer?: string } = {}): Promise<T> {
  const res = await fetch(`${db.url}/rest/v1/${path}`, {
    ...init,
    headers: headers(db, init.prefer ? { Prefer: init.prefer } : {}),
  });
  if (!res.ok) throw new Error(`Database ${init.method ?? 'GET'} ${path.split('?')[0]} failed: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

const eq = (v: string | number): string => `eq.${encodeURIComponent(String(v))}`;

export function listLinks(db: Db, userId: string): Promise<LinkRow[]> {
  return rest(db, `repo_links?user_id=${eq(userId)}&select=id,project_id,github_repo_id,full_name,installation_id,last_push_at`);
}

export async function ownsProject(db: Db, userId: string, projectId: string): Promise<boolean> {
  const rows = await rest<unknown[]>(db, `projects?id=${eq(projectId)}&user_id=${eq(userId)}&select=id`);
  return rows.length > 0;
}

/** Points the repo at one project: links elsewhere are dropped, so a repo has one home. */
export async function linkRepo(
  db: Db,
  userId: string,
  row: { project_id: string; github_repo_id: number; full_name: string; default_branch: string; installation_id: number },
): Promise<LinkRow> {
  await rest(db, `repo_links?user_id=${eq(userId)}&github_repo_id=${eq(row.github_repo_id)}&project_id=neq.${row.project_id}`, {
    method: 'DELETE',
  });
  const [link] = await rest<LinkRow[]>(db, 'repo_links?on_conflict=project_id,github_repo_id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: JSON.stringify({ ...row, user_id: userId }),
  });
  if (!link) throw new Error('Link was not saved');
  return link;
}

export function updateLink(db: Db, id: string, fields: Record<string, string | null>): Promise<unknown> {
  return rest(db, `repo_links?id=${eq(id)}`, { method: 'PATCH', body: JSON.stringify(fields) });
}

/** The cache holds open items only: whatever GitHub no longer lists as open is dropped. */
export async function replaceIssues(db: Db, userId: string, linkId: string, items: readonly IssueRow[]): Promise<void> {
  const keep = items.map((i) => i.number).join(',');
  await rest(db, `issue_links?repo_link_id=${eq(linkId)}${keep ? `&number=not.in.(${keep})` : ''}`, { method: 'DELETE' });
  if (!items.length) return;
  await rest(db, 'issue_links?on_conflict=repo_link_id,number', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates',
    body: JSON.stringify(items.map((i) => ({ ...i, user_id: userId, repo_link_id: linkId }))),
  });
}

export function addPushEvent(
  db: Db,
  userId: string,
  projectId: string,
  push: { repoLinkId: string; branch: string; sha: string; at: string },
): Promise<unknown> {
  return rest(db, 'project_events', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      project_id: projectId,
      type: 'github_push',
      source: 'github',
      occurred_at: push.at,
      payload: { type: 'github_push', repoLinkId: push.repoLinkId, branch: push.branch, sha: push.sha },
    }),
  });
}
