import 'server-only';

import { db } from '@/server/data/store';
import { SEED } from '@/server/identities';
import type { PlanKey } from '@/domain/shortlet/plan';
import type { BookingPageConfig } from '@/domain/shortlet/operations';

type Settings = { planKey: PlanKey; bookingPage: BookingPageConfig };
const settings = new Map<string, Settings>();
// Retain the original demo account's mutable records, while keeping every
// other tenant's configuration separate. Like the review store, this resets
// on restart and is not customer operational persistence.
const seeded: Settings = {
  get planKey() { return db.shortletPlanKey as PlanKey; },
  set planKey(value) { db.shortletPlanKey = value; },
  get bookingPage() { return db.shortletBookingPage; },
};

export function shortletSettings(tenantId: string | null): Settings {
  if (!tenantId?.trim()) throw new Error('A tenant is required for Shortlet settings.');
  if (tenantId === SEED.tenantA) return seeded;
  let current = settings.get(tenantId);
  if (!current) {
    current = { planKey: 'lite', bookingPage: { enabled: false, slug: 'portfolio', cancellationPolicy: '', holdHours: 0, promoCodes: [] } };
    settings.set(tenantId, current);
  }
  return current;
}
