import { describe, expect, it } from 'vitest';
import { composeDraft, estimateReach, targetSize, analytics, readRate } from '@/domain/announcements';
import * as seed from '@/server/data/seed/fixtures';

describe('composeDraft', () => {
  it('routes a topic to its template and yields a thought trace + pidgin', () => {
    const c = composeDraft('water pump maintenance saturday');
    expect(c.template).toBe('water');
    expect(c.thoughts.length).toBeGreaterThan(2);
    expect(c.pidgin.body).not.toBe(c.draft.body);
  });
  it('falls back to a generic notice using the operator’s own words', () => {
    const c = composeDraft('new recycling bins arriving');
    expect(c.template).toBe('general');
    expect(c.draft.title.toLowerCase()).toContain('new recycling');
  });
});

describe('reach model', () => {
  it('more channels never reduce reach and reach ≤ target size', () => {
    const size = targetSize('estate', 'All residents');
    const one = estimateReach(size, ['in_app']);
    const two = estimateReach(size, ['in_app', 'sms']);
    expect(two).toBeGreaterThanOrEqual(one);
    expect(two).toBeLessThanOrEqual(size);
    expect(estimateReach(size, [])).toBe(0);
  });
  it('a building target is smaller than the whole estate', () => {
    expect(targetSize('building', 'All residents', 'Block C')).toBeLessThan(targetSize('estate', 'All residents'));
  });
});

describe('analytics', () => {
  it('summarises sent vs draft and average read rate from the seed', () => {
    const a = analytics(seed.announcements.filter((x) => x.tenantId === seed.announcements[0].tenantId));
    expect(a.sent + a.drafts).toBe(seed.announcements.filter((x) => x.tenantId === seed.announcements[0].tenantId).length);
    const sent = seed.announcements.find((x) => x.sentAt)!;
    expect(readRate(sent)).toBeGreaterThan(0);
  });
});
