import { describe, expect, it } from 'vitest';
import { triageRequest, requestStepIndex, isRequestRateable, etaLabel, REQUEST_STEPS } from '@/domain/resident-portal';

describe('triageRequest', () => {
  it('routes by keyword and escalates on urgency', () => {
    expect(triageRequest('kitchen tap leaking under the sink').category.key).toBe('plumbing');
    expect(triageRequest('no power in the whole flat').category.key).toBe('electrical');
    const urgent = triageRequest('water leaking everywhere, urgent flood');
    expect(urgent.priority).toBe('emergency');
    expect(urgent.escalated).toBe(true);
  });
  it('falls back to a general routine request', () => {
    const t = triageRequest('something feels off in the hallway');
    expect(t.category.key).toBe('other');
    expect(t.priority).toBe('routine');
  });
});

describe('progress tracker', () => {
  it('maps statuses to the resident step, closed states rateable', () => {
    expect(requestStepIndex('new')).toBe(0);
    expect(requestStepIndex('in_progress')).toBe(3);
    expect(requestStepIndex('closed')).toBe(REQUEST_STEPS.length - 1);
    expect(requestStepIndex('cancelled')).toBe(-1);
    expect(isRequestRateable('resolved')).toBe(true);
    expect(isRequestRateable('new')).toBe(false);
  });
  it('formats an ETA in human terms', () => {
    expect(etaLabel(1)).toContain('hour');
    expect(etaLabel(48)).toContain('day');
  });
});
