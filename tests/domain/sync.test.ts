import { describe, expect, it } from 'vitest';
import {
  backoffMs, dueOps, applyOutcome, queueStats, syncPosture, prunable, enqueue,
  type OutboxOp,
} from '@/domain/sync';

const NOW = Date.parse('2026-07-26T10:00:00Z');
const op = (over: Partial<OutboxOp> = {}): OutboxOp => ({
  id: 'op-1', kind: 'daily_report', label: 'Daily report', payload: {},
  capturedISO: '2026-07-26T08:00:00Z', attachments: 0, status: 'queued', attempts: 0, ...over,
});

describe('backoff + due selection', () => {
  it('backs off exponentially and caps', () => {
    expect(backoffMs(0)).toBe(0);
    expect(backoffMs(2)).toBe(15_000);
    expect(backoffMs(99)).toBe(300_000); // capped, never unbounded
  });
  it('sends queued and failed ops in capture order, respecting backoff', () => {
    const ops = [
      op({ id: 'b', capturedISO: '2026-07-26T09:00:00Z' }),
      op({ id: 'a', capturedISO: '2026-07-26T07:00:00Z' }),
      op({ id: 'sent', status: 'synced' }),
      op({ id: 'clash', status: 'conflict' }),
    ];
    expect(dueOps(ops, NOW).map((o) => o.id)).toEqual(['a', 'b']); // oldest first
    // a conflict is NEVER auto-retried — it needs a human
    expect(dueOps(ops, NOW).some((o) => o.id === 'clash')).toBe(false);
    // a failed op inside its backoff window waits
    const failed = [op({ id: 'f', status: 'failed', attempts: 2 })];
    expect(dueOps(failed, NOW, { f: NOW - 1_000 })).toHaveLength(0);
    expect(dueOps(failed, NOW, { f: NOW - 20_000 })).toHaveLength(1);
  });
});

describe('outcome folding', () => {
  it('treats a duplicate as success — that is the point of the idempotency key', () => {
    const done = applyOutcome(op(), { ok: true, id: 'op-1', duplicate: true }, '2026-07-26T10:00:00Z');
    expect(done.status).toBe('synced');
    expect(done.error).toBeUndefined();
  });
  it('holds a conflict for review with the server version, without incrementing past it', () => {
    const clash = applyOutcome(op(), { ok: false, id: 'op-1', conflict: true, error: 'already approved', serverState: 'approved · by Ngozi' }, '2026-07-26T10:00:00Z');
    expect(clash.status).toBe('conflict');
    expect(clash.serverState).toBe('approved · by Ngozi');
    // and it is not eligible for automatic retry
    expect(dueOps([clash], NOW)).toHaveLength(0);
  });
  it('marks a transient failure for retry', () => {
    const failed = applyOutcome(op(), { ok: false, id: 'op-1', conflict: false, error: 'No connection' }, '2026-07-26T10:00:00Z');
    expect(failed.status).toBe('failed');
    expect(failed.attempts).toBe(1);
  });
});

describe('queue stats + posture', () => {
  it('counts what would be lost and holds unsent attachments', () => {
    const ops = [op({ id: '1' }), op({ id: '2', status: 'failed', attachments: 3 }), op({ id: '3', status: 'synced', attachments: 9 })];
    const s = queueStats(ops);
    expect(s.pending).toBe(2);
    expect(s.attachments).toBe(3); // only unsent attachments are "at risk"
    expect(s.synced).toBe(1);
  });
  it('tells the truth about where the data is', () => {
    const pending = queueStats([op()]);
    expect(syncPosture(pending, false).label).toBe('Offline');
    expect(syncPosture(pending, false).detail).toContain('saved on this device');
    expect(syncPosture(queueStats([]), true).label).toBe('Synced');
    expect(syncPosture(queueStats([op({ status: 'conflict' })]), true).label).toBe('Needs review');
  });
});

describe('local housekeeping', () => {
  it('only prunes long-since-synced ops, never unsent work', () => {
    const ops = [
      op({ id: 'old', status: 'synced', syncedISO: '2026-07-24T10:00:00Z' }),
      op({ id: 'fresh', status: 'synced', syncedISO: '2026-07-26T09:00:00Z' }),
      op({ id: 'queued' }),
    ];
    expect(prunable(ops, NOW)).toEqual(['old']);
  });
  it('replaces an unsent op on re-capture but never clobbers a synced one', () => {
    const base = [op({ id: 'x', label: 'first' })];
    expect(enqueue(base, op({ id: 'x', label: 'edited' }))[0].label).toBe('edited');
    const sent = [op({ id: 'x', label: 'first', status: 'synced' })];
    expect(enqueue(sent, op({ id: 'x', label: 'edited' }))[0].label).toBe('first');
  });
});
