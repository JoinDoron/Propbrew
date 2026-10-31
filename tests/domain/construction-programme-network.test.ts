import { describe, expect, it } from 'vitest';
import { criticalPath, programmeLookAhead, programmeNetwork } from '@/domain/construction';
import type { Task } from '@/domain/construction/types';

const calendar = { workingDays: [1, 2, 3, 4, 5, 6], holidays: ['2027-01-06'] };
const task = (id: string, start: string, finish: string, dependsOn: string[] = [], extra: Partial<Task> = {}): Task => ({
  tenantId: 'company-a' as Task['tenantId'], id, projectId: 'project-a', phaseId: 'phase-a', name: id, owner: 'Site team',
  plannedStartISO: start, plannedFinishISO: finish, percentComplete: 0, status: 'not_started',
  priority: 'medium', dependsOn, budget: { minor: 0, currency: 'NGN' }, ...extra,
});

describe('working-day programme network', () => {
  it('skips the project holiday and Sunday through the whole dependency network', () => {
    const rows = [task('a', '2027-01-04', '2027-01-09'), task('b', '2027-01-11', '2027-01-13', ['a'])];
    const result = programmeNetwork(rows, calendar);
    expect(result.ef.get('a')).toBe(5);
    expect(result.es.get('b')).toBe(5);
    expect(result.projectFinishISO).toBe('2027-01-13');
    expect(result.critical).toEqual(new Set(['a', 'b']));
  });

  it('preserves a planned date gap and lets explicit lag override it', () => {
    const a = task('a', '2027-01-04', '2027-01-09');
    const b = task('b', '2027-01-15', '2027-01-16', ['a']);
    expect(programmeNetwork([a, b], calendar).startISO.get('b')).toBe('2027-01-15');
    const shifted = programmeNetwork([a, { ...b, dependencyLags: { a: 2 } }], calendar);
    expect(shifted.startISO.get('b')).toBe('2027-01-15'); // planned date is a hard start constraint
    expect(shifted.projectFinishISO).toBe('2027-01-16');
    const lateA = { ...a, programmeDelay: { workingDays: 4, reasonCodeId: 'rain', recordedBy: 'Manager', recordedAtISO: '2027-01-04' } };
    const forecast = programmeNetwork([lateA, { ...b, dependencyLags: { a: 2 } }], calendar, '2027-01-04');
    expect(forecast.startISO.get('b')).toBe('2027-01-18');
    expect(forecast.projectFinishISO).toBe('2027-01-19');
  });

  it('marks overdue and blocked work in rolling look-aheads and excludes completed tasks', () => {
    const rows = [task('a', '2027-01-04', '2027-01-09'), task('b', '2027-01-11', '2027-01-13', ['a']), task('c', '2027-01-12', '2027-01-12', [], { status: 'done', percentComplete: 100 })];
    const network = programmeNetwork(rows, calendar, '2027-01-11');
    const lookAhead = programmeLookAhead(rows, network, '2027-01-11', 2);
    expect(lookAhead.map((row) => row.id)).toEqual(['a', 'b']);
    expect(lookAhead.find((row) => row.id === 'a')?.state).toBe('overdue');
    expect(lookAhead.find((row) => row.id === 'b')?.state).toBe('blocked');
  });

  it('rejects invalid dependency cycles and negative lag', () => {
    expect(() => criticalPath([{ id: 'a', durationDays: 2, dependsOn: ['b'] }, { id: 'b', durationDays: 3, dependsOn: ['a'] }])).toThrow('cycle');
    expect(() => criticalPath([{ id: 'a', durationDays: 2, dependsOn: [], dependencyLagDays: { b: -1 } }])).toThrow('lag');
  });
});
