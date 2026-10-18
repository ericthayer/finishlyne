// Runs the real migration in an in-process Postgres (PGlite) with a minimal
// stand-in for Supabase's auth schema, then checks RLS and lifecycle gates.
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = new URL('../supabase/migrations/', import.meta.url);
const MIGRATION = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(new URL(f, MIGRATIONS_DIR), 'utf8'))
  .join('\n');

const SUPABASE_AUTH_STUB = `
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create role authenticated nologin;
  create role anon nologin;
  grant usage on schema auth to authenticated, anon;
  grant usage on schema public to anon;
  -- Supabase grants everything in public to API roles by default; RLS and the
  -- migration's revokes must hold up against that.
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`;

// The slice of Supabase Storage the migrations touch: buckets, objects (RLS on) and foldername().
const SUPABASE_STORAGE_STUB = `
  create schema storage;
  create table storage.buckets (
    id text primary key, name text not null, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text not null,
    owner uuid default auth.uid()
  );
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  $$;
  grant usage on schema storage to authenticated, anon;
  grant all on storage.objects to authenticated;
`;

const ALICE = '00000000-0000-0000-0000-00000000000a';
const BOB = '00000000-0000-0000-0000-00000000000b';

let db: PGlite;

/** Run statements as an authenticated user, the way PostgREST would. */
async function as<T>(uid: string, fn: () => Promise<T>): Promise<T> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
  await db.exec('set role authenticated');
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}

async function createProject(uid: string, slug: string, fields: Record<string, string> = {}): Promise<string> {
  return as(uid, async () => {
    const cols = ['name', 'slug', ...Object.keys(fields)];
    const vals = [slug, slug, ...Object.values(fields)];
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
    const res = await db.query<{ id: string }>(
      `insert into public.projects (${cols.join(', ')}) values (${placeholders}) returning id`,
      vals,
    );
    return res.rows[0]!.id;
  });
}

async function transition(uid: string, id: string, to: string, opts: Record<string, string | boolean> = {}) {
  return as(uid, async () => {
    const named = Object.keys(opts).map((k, i) => `p_${k} => $${i + 3}`);
    const sql = `select * from public.transition_project($1, $2::public.project_status${named.length ? ', ' + named.join(', ') : ''})`;
    return (await db.query<{ status: string; review_on: string | null }>(sql, [id, to, ...Object.values(opts)])).rows[0]!;
  });
}

/** A project that satisfies the Idea → Ready gate. */
async function readyProject(uid: string, slug: string): Promise<string> {
  const id = await createProject(uid, slug, { outcome: 'Ship it', next_action: 'Start' });
  await as(uid, () => db.query(`insert into public.ship_criteria (project_id, text) values ($1, 'Deployed')`, [id]));
  await transition(uid, id, 'ready');
  return id;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_AUTH_STUB);
  await db.exec(SUPABASE_STORAGE_STUB);
  await db.exec(MIGRATION);
  await db.query(`insert into auth.users (id) values ($1), ($2)`, [ALICE, BOB]);
});

describe('row-level security', () => {
  it('isolates projects between users', async () => {
    const id = await createProject(ALICE, 'private-thing');
    const seenByBob = await as(BOB, () => db.query(`select id from public.projects where id = $1`, [id]));
    expect(seenByBob.rows).toHaveLength(0);
    const updated = await as(BOB, () => db.query(`update public.projects set name = 'pwned' where id = $1`, [id]));
    expect(updated.affectedRows).toBe(0);
  });

  it("prevents attaching rows to another user's project", async () => {
    const id = await createProject(ALICE, 'alice-only');
    await expect(
      as(BOB, () => db.query(`insert into public.blockers (project_id, text) values ($1, 'x')`, [id])),
    ).rejects.toThrow(/foreign key/);
  });

  it("keeps the event log append-only and GitHub rows server-side", async () => {
    const id = await createProject(ALICE, 'append-only');
    await as(ALICE, () =>
      db.query(`insert into public.project_events (project_id, type, payload) values ($1, 'reviewed', '{"type":"reviewed"}')`, [id]),
    );
    await expect(as(ALICE, () => db.query(`delete from public.project_events where project_id = $1`, [id]))).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      as(ALICE, () =>
        db.query(
          `insert into public.project_events (project_id, type, payload, source)
           values ($1, 'github_push', '{"type":"github_push"}', 'github')`,
          [id],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      as(ALICE, () =>
        db.query(
          `insert into public.repo_links (project_id, github_repo_id, full_name, default_branch, installation_id)
           values ($1, 1, 'a/b', 'main', 1)`,
          [id],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('Supabase default privileges', () => {
  it('pins search_path on every public function', async () => {
    const { rows } = await db.query<{ proname: string }>(
      `select proname from pg_proc
       where pronamespace = 'public'::regnamespace
         and not coalesce(proconfig, '{}') @> array['search_path=""']`,
    );
    expect(rows.map((r) => r.proname)).toEqual([]);
  });

  it('gives anonymous callers nothing', async () => {
    await createProject(ALICE, 'hidden-from-anon');
    await db.exec('set role anon');
    try {
      await expect(db.query('select id from public.projects')).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec('reset role');
    }
  });

  it('only lets users retarget the tracked branch of a repo link', async () => {
    const id = await createProject(ALICE, 'linked');
    await db.query(
      `insert into public.repo_links (user_id, project_id, github_repo_id, full_name, default_branch, installation_id)
       values ($1, $2, 42, 'alice/linked', 'main', 7)`,
      [ALICE, id],
    );
    await as(ALICE, () => db.query(`update public.repo_links set tracked_branch = 'dev' where project_id = $1`, [id]));
    await expect(
      as(ALICE, () => db.query(`update public.repo_links set github_repo_id = 99 where project_id = $1`, [id])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('lifecycle gates', () => {
  it('forces new projects to start as ideas and blocks direct status edits', async () => {
    const id = await as(ALICE, async () =>
      (await db.query<{ id: string; status: string }>(
        `insert into public.projects (name, slug, status) values ('Sneaky', 'sneaky', 'active') returning id, status`,
      )).rows[0]!,
    );
    expect(id.status).toBe('idea');
    await expect(
      as(ALICE, () => db.query(`update public.projects set status = 'active' where id = $1`, [id.id])),
    ).rejects.toThrow(/GATE:USE_TRANSITION/);
  });

  it('reports every unmet Idea → Ready gate at once', async () => {
    const id = await createProject(ALICE, 'bare-idea');
    await expect(transition(ALICE, id, 'ready')).rejects.toThrow(
      /GATE:MISSING_NEXT_ACTION,MISSING_OUTCOME,MISSING_SHIP_CRITERIA/,
    );
    await expect(transition(ALICE, id, 'active')).rejects.toThrow(/GATE:NOT_ALLOWED/);
  });

  it('enforces the WIP cap of 3', async () => {
    const ids = await Promise.all(['wip-1', 'wip-2', 'wip-3', 'wip-4'].map((s) => readyProject(BOB, s)));
    for (const id of ids.slice(0, 3)) {
      expect((await transition(BOB, id, 'active')).status).toBe('active');
    }
    await expect(transition(BOB, ids[3]!, 'active')).rejects.toThrow(/GATE:WIP_CAP_REACHED/);
  });

  it('pausing writes a checkpoint, defaults the review date and records progress', async () => {
    const id = await readyProject(ALICE, 'pause-me');
    await transition(ALICE, id, 'active');
    await expect(transition(ALICE, id, 'paused')).rejects.toThrow(/GATE:MISSING_CHECKPOINT/);

    const paused = await transition(ALICE, id, 'paused', { checkpoint_summary: 'Wired auth', next_action: 'Add tests' });
    expect(paused.status).toBe('paused');
    expect(paused.review_on).not.toBeNull();

    const events = await as(ALICE, () =>
      db.query<{ type: string }>(`select type from public.project_events where project_id = $1 order by occurred_at, type`, [id]),
    );
    expect(events.rows.map((r) => r.type)).toContain('checkpoint_added');
    const cp = await as(ALICE, () =>
      db.query<{ next_action_set: string }>(`select next_action_set from public.checkpoints where project_id = $1`, [id]),
    );
    expect(cp.rows[0]?.next_action_set).toBe('Add tests');
  });

  it('requires an archive reason and clears it on reopen', async () => {
    const id = await createProject(ALICE, 'abandon-me');
    await expect(transition(ALICE, id, 'archived')).rejects.toThrow(/GATE:MISSING_ARCHIVE_REASON/);
    await transition(ALICE, id, 'archived', { archived_reason: 'Superseded by Finishline' });
    await as(ALICE, () => db.query(`update public.projects set outcome = 'x', next_action = 'y' where id = $1`, [id]));
    await as(ALICE, () => db.query(`insert into public.ship_criteria (project_id, text) values ($1, 'z')`, [id]));
    const reopened = await as(ALICE, async () => {
      await db.query(`select public.transition_project($1, 'ready')`, [id]);
      return (await db.query<{ archived_reason: string | null }>(`select archived_reason from public.projects where id = $1`, [id])).rows[0]!;
    });
    expect(reopened.archived_reason).toBeNull();
  });

  it("lets the Inbox's promote writes through, in order, as the owner", async () => {
    // Mirrors supabaseProjects().promote: save gate fields, sync the checklist, transition.
    const id = await createProject(ALICE, 'promote-me');
    await as(ALICE, async () => {
      await db.query(`insert into public.ship_criteria (project_id, text) values ($1, 'Old item')`, [id]);
      await db.query(`update public.projects set outcome = 'Ship it', next_action = 'Start' where id = $1`, [id]);
      await db.query(`delete from public.ship_criteria where project_id = $1`, [id]);
      await db.query(`insert into public.ship_criteria (project_id, text, position) values ($1, 'Deployed', 0)`, [id]);
    });
    expect((await transition(ALICE, id, 'ready')).status).toBe('ready');
  });

  it('only ships with every criterion done, unless shipping anyway', async () => {
    const id = await readyProject(ALICE, 'ship-me');
    await transition(ALICE, id, 'active');
    await expect(transition(ALICE, id, 'shipped')).rejects.toThrow(/GATE:UNMET_SHIP_CRITERIA/);
    expect((await transition(ALICE, id, 'shipped', { ship_anyway: true })).status).toBe('shipped');
  });
});

describe('open projects keep a next action', () => {
  it('rejects blanking the next action on Ready, Active or Paused with a plain update', async () => {
    const id = await readyProject(ALICE, 'keep-next');
    for (const blank of [null, '', '   ']) {
      await expect(
        as(ALICE, () => db.query(`update public.projects set next_action = $2 where id = $1`, [id, blank])),
      ).rejects.toThrow(/open_has_next_action/);
    }
    await transition(ALICE, id, 'active');
    await expect(as(ALICE, () => db.query(`update public.projects set next_action = null where id = $1`, [id]))).rejects.toThrow(
      /open_has_next_action/,
    );
  });

  it('still lets ideas and closed projects go without one', async () => {
    const id = await createProject(ALICE, 'no-next-idea');
    await as(ALICE, () => db.query(`update public.projects set next_action = null where id = $1`, [id]));
    const shipped = await readyProject(ALICE, 'no-next-shipped');
    await transition(ALICE, shipped, 'active');
    await transition(ALICE, shipped, 'shipped', { ship_anyway: true });
    await as(ALICE, () => db.query(`update public.projects set next_action = null where id = $1`, [shipped]));
  });
});

describe('set_current_platform', () => {
  const current = (id: string) =>
    as(ALICE, async () =>
      (
        await db.query<{ platform: string; label: string | null; url: string | null; role: string }>(
          `select platform, label, url, role from public.project_platforms where project_id = $1 order by created_at, role`,
          [id],
        )
      ).rows,
    );
  const set = (uid: string, id: string, platform: string | null, label: string | null = null, url: string | null = null) =>
    as(uid, () => db.query(`select public.set_current_platform($1, $2::public.agent_platform, $3, $4)`, [id, platform, label, url]));

  it('sets, edits in place, moves the old one to past, and clears', async () => {
    const id = await createProject(ALICE, 'platformed');
    await set(ALICE, id, 'bolt', null, 'https://bolt.new/p/1');
    expect(await current(id)).toEqual([{ platform: 'bolt', label: null, url: 'https://bolt.new/p/1', role: 'current' }]);

    await set(ALICE, id, 'bolt', null, '  ');
    expect(await current(id)).toEqual([{ platform: 'bolt', label: null, url: null, role: 'current' }]);

    await set(ALICE, id, 'other', ' Windsurf ', 'https://example.com/w');
    const rows = await current(id);
    expect(rows.find((r) => r.role === 'current')).toEqual({ platform: 'other', label: 'Windsurf', url: 'https://example.com/w', role: 'current' });
    expect(rows.find((r) => r.role === 'past')?.platform).toBe('bolt');

    await set(ALICE, id, null);
    expect((await current(id)).every((r) => r.role === 'past')).toBe(true);
  });

  it('rejects a non-https link, an unnamed Other, and other users', async () => {
    const id = await createProject(ALICE, 'platform-guard');
    await expect(set(ALICE, id, 'codex', null, 'http://x.test')).rejects.toThrow();
    await expect(set(ALICE, id, 'other', ' ')).rejects.toThrow(/other_has_label/);
    await expect(set(BOB, id, 'codex')).rejects.toThrow(/GATE:NOT_FOUND/);
    await expect(as('', () => db.exec(`set role anon; select public.set_current_platform(gen_random_uuid(), 'codex')`))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe('site previews', () => {
  it('takes an https site, a Netlify site id and a screenshot in the owner folder only', async () => {
    const id = await createProject(ALICE, 'with-site');
    await as(ALICE, () =>
      db.query(`update public.projects set site_url = 'https://a.dev', netlify_site_id = $2, screenshot_path = $3 where id = $1`, [
        id,
        '52a9fbd8-0883-43f0-b2f6-6d1145e12ddb',
        `${ALICE}/${id}/1`,
      ]),
    );
    await expect(as(ALICE, () => db.query(`update public.projects set site_url = 'http://a.dev' where id = $1`, [id]))).rejects.toThrow(
      /check constraint/,
    );
    await expect(
      as(ALICE, () => db.query(`update public.projects set screenshot_path = $2 where id = $1`, [id, `${BOB}/${id}/1`])),
    ).rejects.toThrow(/screenshot_in_owner_folder/);
  });

  it("keeps each user's screenshots in their own folder", async () => {
    const mine = `${ALICE}/p/1`;
    await as(ALICE, () => db.query(`insert into storage.objects (bucket_id, name) values ('project-screenshots', $1)`, [mine]));
    await expect(
      as(ALICE, () => db.query(`insert into storage.objects (bucket_id, name) values ('project-screenshots', $1)`, [`${BOB}/p/1`])),
    ).rejects.toThrow(/row-level security/);
    const seenByBob = await as(BOB, () => db.query(`select name from storage.objects where name = $1`, [mine]));
    expect(seenByBob.rows).toHaveLength(0);
    const deletedByBob = await as(BOB, () => db.query(`delete from storage.objects where name = $1`, [mine]));
    expect(deletedByBob.affectedRows).toBe(0);
    const bucket = await db.query<{ public: boolean }>(`select public from storage.buckets where id = 'project-screenshots'`);
    expect(bucket.rows[0]?.public).toBe(false);
  });
});
