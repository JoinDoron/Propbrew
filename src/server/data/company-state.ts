import type { WorkspaceRecordState } from './record-context';

/** Preserve the current collection schema without copying demonstration data. */
export function createBlankCompanyState(template: Readonly<Record<string, unknown>>): WorkspaceRecordState {
  if (!template || typeof template !== 'object' || Array.isArray(template)) throw new Error('A company collection schema is required.');
  const collections: Record<string, unknown> = Object.create(null);
  for (const [name, value] of Object.entries(template)) {
    if (name === 'shortletPlanKey') collections[name] = 'lite';
    else if (name === 'shortletBookingPage') collections[name] = {
      enabled: false, slug: 'portfolio', cancellationPolicy: '', holdHours: 0, promoCodes: [],
    };
    else if (Array.isArray(value)) collections[name] = [];
    else throw new Error(`Company configuration ${name} needs an explicit blank default.`);
  }
  return { schemaVersion: 1, collections, history: {}, auxiliary: {}, sequences: {} };
}
