import { describe, expect, it } from 'vitest';
import { DEFAULT_STALE_THRESHOLDS, needsDecision, parseStaleThresholds, readStaleThresholds, staleness } from '../src/domain/index.ts';
import { project } from './fixtures.ts';

const now = new Date('2026-10-31T09:00:00Z');

describe('staleness', () => {
  it('grades active projects by last progress only', () => {
    expect(staleness(project({ status: 'active', lastProgressAt: '2026-10-25T23:00:00Z' }), now)).toEqual({
      level: 'fresh',
      days: 6,
    });
    expect(staleness(project({ status: 'active', lastProgressAt: '2026-10-24T00:00:00Z' }), now)).toMatchObject({
      level: 'stale',
      days: 7,
      moves: ['resume', 'pause'],
    });
    expect(staleness(project({ status: 'active', lastProgressAt: '2026-10-10T00:00:00Z' }), now)).toMatchObject({
      level: 'cold',
      days: 21,
      moves: ['pause', 'archive'],
    });
  });

  it('does not let a review snooze an active project', () => {
    const p = project({ status: 'active', lastProgressAt: '2026-10-01T00:00:00Z', lastReviewedAt: '2026-10-30T00:00:00Z' });
    expect(staleness(p, now).level).toBe('cold');
  });

  it('lets a review reset the clock for ready and idea', () => {
    const ready = project({ status: 'ready', statusChangedAt: '2026-10-01T00:00:00Z' });
    expect(staleness(ready, now)).toMatchObject({ level: 'cold', moves: ['activate', 'demote'] });
    expect(staleness({ ...ready, lastReviewedAt: '2026-10-30T00:00:00Z' }, now).level).toBe('fresh');

    const idea = project({ status: 'idea', createdAt: '2026-09-01T00:00:00Z' });
    expect(staleness(idea, now)).toMatchObject({ level: 'stale', moves: ['promote', 'archive', 'review'] });
    expect(staleness({ ...idea, lastReviewedAt: '2026-10-20T00:00:00Z' }, now).level).toBe('fresh');
  });

  it('flags paused projects from their review date', () => {
    expect(staleness(project({ status: 'paused', reviewOn: '2026-11-01' }), now)).toEqual({ level: 'fresh', days: -1 });
    expect(staleness(project({ status: 'paused', reviewOn: '2026-10-31' }), now)).toMatchObject({
      level: 'stale',
      moves: ['resume', 'review'],
    });
    expect(staleness(project({ status: 'paused', reviewOn: '2026-10-01' }), now)).toMatchObject({
      level: 'cold',
      moves: ['resume', 'archive'],
    });
  });

  it('never flags finished projects', () => {
    expect(staleness(project({ status: 'shipped', lastProgressAt: '2020-01-01T00:00:00Z' }), now)).toEqual({ level: 'none' });
    expect(needsDecision(staleness(project({ status: 'archived' }), now))).toBe(false);
  });

  it('honours custom thresholds', () => {
    const p = project({ status: 'active', lastProgressAt: '2026-10-28T00:00:00Z' });
    const t = { activeStaleDays: 2, activeColdDays: 5, readyStaleDays: 14, readyColdDays: 30, pausedColdDays: 30, ideaStaleDays: 30 };
    expect(staleness(p, now, t).level).toBe('stale');
  });
});

describe('stale thresholds', () => {
  const now = new Date('2026-10-26T12:00:00Z');
  const input = (over: Partial<Record<keyof typeof DEFAULT_STALE_THRESHOLDS, string>> = {}) => ({
    activeStaleDays: '7',
    activeColdDays: '21',
    readyStaleDays: '14',
    readyColdDays: '30',
    pausedColdDays: '30',
    ideaStaleDays: '30',
    ...over,
  });

  it('grades with saved thresholds instead of the defaults', () => {
    const p = project({ status: 'active', lastProgressAt: '2026-10-22T00:00:00Z' });
    expect(staleness(p, now).level).toBe('fresh');
    expect(staleness(p, now, { ...DEFAULT_STALE_THRESHOLDS, activeStaleDays: 3 }).level).toBe('stale');
  });

  it('reads the saved jsonb over the defaults, per key', () => {
    expect(readStaleThresholds({})).toEqual(DEFAULT_STALE_THRESHOLDS);
    expect(readStaleThresholds(null)).toEqual(DEFAULT_STALE_THRESHOLDS);
    expect(readStaleThresholds({ ideaStaleDays: 45, readyStaleDays: 'x', pausedColdDays: 0 })).toEqual({
      ...DEFAULT_STALE_THRESHOLDS,
      ideaStaleDays: 45,
    });
  });

  it('drops a saved pair whose cold tier is not after stale', () => {
    expect(readStaleThresholds({ activeStaleDays: 30, activeColdDays: 10 })).toEqual(DEFAULT_STALE_THRESHOLDS);
  });

  it('parses form text and names the first wrong field', () => {
    expect(parseStaleThresholds(input({ activeStaleDays: ' 5 ' }))).toEqual({ ok: true, value: { ...DEFAULT_STALE_THRESHOLDS, activeStaleDays: 5 } });
    expect(parseStaleThresholds(input({ readyStaleDays: '2.5' }))).toMatchObject({ ok: false, key: 'readyStaleDays' });
    expect(parseStaleThresholds(input({ ideaStaleDays: '400' }))).toMatchObject({ ok: false, key: 'ideaStaleDays' });
    expect(parseStaleThresholds(input({ activeColdDays: '7' }))).toEqual({ ok: false, key: 'activeColdDays', message: 'Cold has to come after stale.' });
  });
});
