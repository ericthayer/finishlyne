import { PostgrestClient } from '@supabase/postgrest-js';
import { describe, expect, it } from 'vitest';
import type { Backend } from '../src/data/client.ts';
import { supabaseProjects } from '../src/data/projects.ts';
import { explainGate, parseCriteria, parseGateError, planCriteria, uniqueSlug } from '../src/domain/index.ts';
import { saveError } from '../src/app/errors.ts';
import { buildInbox } from '../src/state/inbox-model.ts';
import { project } from './fixtures.ts';

describe('uniqueSlug', () => {
  it('takes the base when free, then the next number', () => {
    expect(uniqueSlug('devlog', new Set())).toBe('devlog');
    expect(uniqueSlug('devlog', new Set(['devlog', 'devlog-2']))).toBe('devlog-3');
  });

  it('stays within 60 characters', () => {
    const base = 'a'.repeat(60);
    expect(uniqueSlug(base, new Set([base]))).toBe(`${'a'.repeat(58)}-2`);
  });
});

describe('gate copy', () => {
  it('says what to add, for client and server failures alike', () => {
    expect(explainGate({ code: 'MISSING_OUTCOME' }, 'ready')).toBe('Add an outcome to move this to Ready.');
    expect(explainGate({ code: 'WIP_CAP_REACHED', cap: 3, active: 3 }, 'active')).toMatch(/^All 3 lanes are full/);
    expect(explainGate({ code: 'NOT_ALLOWED', from: 'idea', to: 'shipped' }, 'shipped')).toBe("Idea projects can't move to Shipped.");
  });

  it('reads GATE: codes out of database errors', () => {
    expect(parseGateError('GATE:MISSING_OUTCOME,MISSING_SHIP_CRITERIA')).toEqual([
      { code: 'MISSING_OUTCOME' },
      { code: 'MISSING_SHIP_CRITERIA' },
    ]);
    expect(parseGateError('permission denied for table projects')).toBeNull();
    expect(saveError(new Error('GATE:MISSING_ARCHIVE_REASON'), 'archived')).toBe('Say why you are archiving it.');
    expect(saveError(new Error('Failed to fetch'))).toBe("That didn't save. Failed to fetch");
  });
});

describe('parseCriteria', () => {
  it('one per line, without bullets, blanks or repeats', () => {
    expect(parseCriteria('- Deployed\n\n* [x] Docs written\n  deployed \n• Tests green')).toEqual(['Deployed', 'Docs written', 'Tests green']);
  });
});

describe('planCriteria', () => {
  const existing = [
    { id: 'a', text: 'Deployed', position: 0 },
    { id: 'b', text: 'Docs', position: 1 },
  ];

  it('keeps matching rows, reorders, removes the rest and inserts new text', () => {
    expect(planCriteria(existing, ['Docs', 'Tests'])).toEqual({
      remove: ['a'],
      update: [{ id: 'b', position: 0 }],
      insert: [{ text: 'Tests', position: 1 }],
    });
  });

  it('writes nothing when the list is unchanged', () => {
    expect(planCriteria(existing, ['Deployed', 'Docs'])).toEqual({ remove: [], update: [], insert: [] });
  });
});

describe('buildInbox', () => {
  const now = new Date('2026-10-10T12:00:00Z');

  it('lists newest first and flags ideas past triage age', () => {
    const model = buildInbox(
      [
        { project: project({ id: 'old', name: 'Old', createdAt: '2026-08-01T00:00:00Z' }), criteria: [] },
        {
          project: project({ id: 'new', name: 'New', createdAt: '2026-10-10T11:00:00Z', outcome: null, nextAction: null }),
          criteria: [
            { id: 'c2', text: 'Second', position: 1, doneAt: null },
            { id: 'c1', text: 'First', position: 0, doneAt: null },
          ],
        },
      ],
      now,
    );
    expect(model.items.map((i) => i.id)).toEqual(['new', 'old']);
    expect(model.items[0]).toMatchObject({ captured: 'Captured 1 hr ago', outcome: '', nextAction: '', criteria: ['First', 'Second'] });
    expect(model.items[0]?.stale).toBeUndefined();
    expect(model.items[1]).toMatchObject({ captured: 'Captured on Aug 1', stale: { level: 'stale', days: 70 } });
    expect(model.staleCount).toBe(1);
  });
});

// A PostgREST stand-in: records each request and answers from a queue.
function fakeBackend(responses: { status: number; body: unknown }[]): { backend: Backend; calls: string[] } {
  const calls: string[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    calls.push(`${init?.method ?? 'GET'} ${url.pathname}${decodeURIComponent(url.search)}${init?.body ? ` ${String(init.body)}` : ''}`);
    const next = responses.shift() ?? { status: 200, body: [] };
    return new Response(next.body === null ? null : JSON.stringify(next.body), { status: next.status, headers: { 'content-type': 'application/json' } });
  };
  const db = new PostgrestClient('https://x.supabase.co/rest/v1', { fetch });
  return { backend: { db } as unknown as Backend, calls };
}

const row = (slug: string) => ({
  id: 'p', slug, name: 'Dev Log', outcome: null, summary: null, status: 'idea', status_changed_at: 'now', next_action: null,
  agent_instructions: null, focus_rank: null, review_on: null, last_reviewed_at: null, last_progress_at: 'now', shipped_at: null,
  shipped_url: null, archived_at: null, archived_reason: null, tags: [], created_at: 'now', updated_at: 'now',
});

describe('supabaseProjects', () => {
  it('captures with the next free slug and retries when another tab took it first', async () => {
    const { backend, calls } = fakeBackend([
      { status: 200, body: [{ slug: 'dev-log' }] },
      { status: 409, body: { code: '23505', message: 'duplicate key value violates unique constraint' } },
      { status: 200, body: [{ slug: 'dev-log' }, { slug: 'dev-log-2' }] },
      { status: 201, body: row('dev-log-3') },
    ]);
    const p = await supabaseProjects(backend).capture({ name: '  Dev Log ' });
    expect(p.slug).toBe('dev-log-3');
    expect(calls[1]).toContain('"slug":"dev-log-2"');
    expect(calls[3]).toContain('"name":"Dev Log","slug":"dev-log-3","summary":null');
  });

  it('promotes by saving the gate fields, syncing the checklist, then transitioning', async () => {
    const { backend, calls } = fakeBackend([
      { status: 204, body: null },
      { status: 200, body: [{ id: 'a', text: 'Stale item', position: 0 }] },
      { status: 204, body: null },
      { status: 201, body: null },
      { status: 200, body: row('dev-log') },
    ]);
    await supabaseProjects(backend).promote('p', { outcome: 'Ship it', nextAction: 'Start', criteria: ['Deployed'] });
    expect(calls.map((c) => c.split(' ').slice(0, 2).join(' '))).toEqual([
      'PATCH /rest/v1/projects?id=eq.p',
      'GET /rest/v1/ship_criteria?select=id,text,position&project_id=eq.p',
      'DELETE /rest/v1/ship_criteria?id=in.(a)',
      'POST /rest/v1/ship_criteria?columns="project_id","text","position"',
      'POST /rest/v1/rpc/transition_project',
    ]);
    expect(calls[4]).toContain('"p_to":"ready"');
  });

  it('surfaces gate errors from the database', async () => {
    const { backend } = fakeBackend([{ status: 400, body: { code: 'P0001', message: 'GATE:MISSING_ARCHIVE_REASON' } }]);
    await expect(supabaseProjects(backend).archive('p', ' ')).rejects.toThrow('GATE:MISSING_ARCHIVE_REASON');
  });
});

describe('supabaseProjects edits', () => {
  it('captures with an outcome when one is given', async () => {
    const { backend, calls } = fakeBackend([
      { status: 200, body: [] },
      { status: 201, body: row('dev-log') },
    ]);
    await supabaseProjects(backend).capture({ name: 'Dev Log', summary: '', outcome: ' Ship v1 ' });
    expect(calls[1]).toContain('"summary":null,"outcome":"Ship v1"');
  });

  it('captures with a platform by setting it right after the insert', async () => {
    const { backend, calls } = fakeBackend([
      { status: 200, body: [] },
      { status: 201, body: row('dev-log') },
      { status: 204, body: null },
    ]);
    const platform = { platform: 'bolt' as const, label: null, url: 'https://bolt.new/x' };
    const created = await supabaseProjects(backend).capture({ name: 'Dev Log', platform });
    expect(calls[2]).toBe(
      `POST /rest/v1/rpc/set_current_platform {"p_project_id":"${created.id}","p_platform":"bolt","p_label":null,"p_url":"https://bolt.new/x"}`,
    );
  });

  it('saves words trimmed, with blanks as NULL, never writes status, then sets the platform', async () => {
    const { backend, calls } = fakeBackend([
      { status: 204, body: null },
      { status: 204, body: null },
    ]);
    await supabaseProjects(backend).update('p', { name: '  Dev Log ', summary: ' ', outcome: 'Ship v1', nextAction: '', platform: null });
    expect(calls).toEqual([
      'PATCH /rest/v1/projects?id=eq.p {"name":"Dev Log","summary":null,"outcome":"Ship v1","next_action":null}',
      'POST /rest/v1/rpc/set_current_platform {"p_project_id":"p","p_platform":null,"p_label":null,"p_url":null}',
    ]);
  });

  it('surfaces a database refusal', async () => {
    const { backend } = fakeBackend([{ status: 400, body: { code: 'P0001', message: 'GATE:MISSING_NEXT_ACTION' } }]);
    await expect(supabaseProjects(backend).update('p', { name: 'Dev', summary: '', outcome: '', nextAction: '', platform: null })).rejects.toThrow(
      'GATE:MISSING_NEXT_ACTION',
    );
  });
});

describe('supabaseProjects moves', () => {
  it('starts or resumes through the transition function with nothing else', async () => {
    const { backend, calls } = fakeBackend([{ status: 204, body: null }]);
    await supabaseProjects(backend).move('p', { to: 'active' });
    expect(calls).toEqual(['POST /rest/v1/rpc/transition_project {"p_project_id":"p","p_to":"active"}']);
  });

  it('pauses with the checkpoint and next action, trimmed', async () => {
    const { backend, calls } = fakeBackend([{ status: 204, body: null }]);
    await supabaseProjects(backend).move('p', { to: 'paused', checkpointSummary: ' Wrote the parser ', nextAction: ' Test the edge cases ', reviewOn: '2026-10-24' });
    expect(calls).toEqual([
      'POST /rest/v1/rpc/transition_project {"p_project_id":"p","p_to":"paused","p_next_action":"Test the edge cases","p_checkpoint_summary":"Wrote the parser","p_review_on":"2026-10-24"}',
    ]);
  });

  it('surfaces the WIP cap the database enforces', async () => {
    const { backend } = fakeBackend([{ status: 400, body: { code: 'P0001', message: 'GATE:WIP_CAP_REACHED' } }]);
    await expect(supabaseProjects(backend).move('p', { to: 'active' })).rejects.toThrow('GATE:WIP_CAP_REACHED');
  });
});

describe('supabaseProjects ship', () => {
  it('saves the checklist changes, then ships through the transition function', async () => {
    const { backend, calls } = fakeBackend([
      { status: 204, body: null },
      { status: 204, body: null },
      { status: 204, body: null },
    ]);
    await supabaseProjects(backend).ship('p', { check: ['a'], uncheck: ['b'], shipAnyway: false, shippedUrl: ' https://x.dev ' });
    expect(calls.map((c) => c.split(' ').slice(0, 2).join(' '))).toEqual([
      'PATCH /rest/v1/ship_criteria?id=in.(a)',
      'PATCH /rest/v1/ship_criteria?id=in.(b)',
      'POST /rest/v1/rpc/transition_project',
    ]);
    expect(calls[1]).toContain('{"done_at":null}');
    expect(calls[2]).toContain('"p_to":"shipped","p_ship_anyway":false,"p_shipped_url":"https://x.dev"');
  });

  it('skips the checklist writes when nothing changed and sends no link as null', async () => {
    const { backend, calls } = fakeBackend([{ status: 204, body: null }]);
    await supabaseProjects(backend).ship('p', { check: [], uncheck: [], shipAnyway: true, shippedUrl: '' });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('"p_ship_anyway":true,"p_shipped_url":null');
  });

  it('lists the checklist in order', async () => {
    const { backend } = fakeBackend([{ status: 200, body: [{ id: 'a', project_id: 'p', text: 'Docs', position: 0, done_at: null }] }]);
    expect(await supabaseProjects(backend).listCriteria('p')).toEqual([{ id: 'a', text: 'Docs', position: 0, doneAt: null }]);
  });
});

describe('supabaseProjects settings', () => {
  it('reads the saved cap, or the default when none is saved yet', async () => {
    const saved = fakeBackend([{ status: 200, body: { wip_cap: 5 } }]);
    expect(await supabaseProjects(saved.backend).loadWipCap()).toBe(5);
    const fresh = fakeBackend([{ status: 200, body: null }]);
    expect(await supabaseProjects(fresh.backend).loadWipCap()).toBe(3);
  });

  it('saves the cap as one upsert on the user', async () => {
    const { backend, calls } = fakeBackend([{ status: 204, body: null }]);
    await supabaseProjects(backend).saveWipCap(4);
    expect(calls).toEqual(['POST /rest/v1/user_settings?on_conflict=user_id {"wip_cap":4}']);
  });

  it('reads saved stale thresholds over the defaults', async () => {
    const saved = fakeBackend([{ status: 200, body: { stale_thresholds: { activeStaleDays: 5 } } }]);
    expect((await supabaseProjects(saved.backend).loadStaleThresholds()).activeStaleDays).toBe(5);
    const fresh = fakeBackend([{ status: 200, body: null }]);
    expect((await supabaseProjects(fresh.backend).loadStaleThresholds()).activeStaleDays).toBe(7);
  });

  it('saves stale thresholds as one upsert on the user', async () => {
    const { backend, calls } = fakeBackend([{ status: 204, body: null }]);
    const t = { activeStaleDays: 5, activeColdDays: 21, readyStaleDays: 14, readyColdDays: 30, pausedColdDays: 30, ideaStaleDays: 30 };
    await supabaseProjects(backend).saveStaleThresholds(t);
    expect(calls).toEqual([`POST /rest/v1/user_settings?on_conflict=user_id {"stale_thresholds":${JSON.stringify(t)}}`]);
  });

  it('surfaces a rejected cap', async () => {
    const { backend } = fakeBackend([{ status: 400, body: { code: '23514', message: 'check constraint violated' } }]);
    await expect(supabaseProjects(backend).saveWipCap(11)).rejects.toThrow('check constraint');
  });
});
