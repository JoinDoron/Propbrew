import 'server-only';

import { db } from '@/server/data/store';
import { SEED } from '@/server/identities';
import { getRecordAuxiliary } from '@/server/data/record-context';
import type { PlanKey } from '@/domain/shortlet/plan';
import type { BookingPageConfig } from '@/domain/shortlet/operations';

type Settings = { planKey: PlanKey; bookingPage: BookingPageConfig };
// Retain the original demo account's mutable records, while keeping every
// other tenant's configuration in the current record context's auxiliary state.
const seeded: Settings = {
  get planKey() { return db.shortletPlanKey as PlanKey; },
  set planKey(value) { db.shortletPlanKey = value; },
  get bookingPage() { return db.shortletBookingPage; },
};

export function shortletSettings(tenantId: string | null): Settings {
  if (!tenantId?.trim()) throw new Error('A tenant is required for Shortlet settings.');
  if (tenantId === SEED.tenantA) return seeded;
  const settings = getRecordAuxiliary<Record<string, Settings>>('shortlet:settings', () => ({}));
  const key = `tenant:${tenantId}`;
  let current = Object.hasOwn(settings, key) ? settings[key] : undefined;
  if (!current) {
    current = { planKey: 'lite', bookingPage: { enabled: false, slug: 'portfolio', cancellationPolicy: '', holdHours: 0, promoCodes: [] } };
    settings[key] = current;
  }
  return current;
}
