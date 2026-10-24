import { durableRecordsEnabled } from '@/server/data/record-context';
import { EstatePropertiesWorkspace } from '@/components/workspaces/estate-properties-workspace';
import { EstateCreateActions } from '@/components/workspaces/estate-create-actions';
import { buildEstateProperties } from '@/domain/estate/properties';
import { NOW } from '@/domain/ppm';
import type { Page } from '@/domain/primitives';
import { repos } from '@/server/data';
import { canRegisterEstateRecords } from '@/server/data/estate-creation-scope';
import { requireCapability } from '@/server/guard';
import { devIdentityEnabled } from '@/server/session';
import { requireOperatorSession } from '@/server/workspaces';
import { isReviewActor, reviewModeEnabled } from '@/server/review-auth';
import { withDurableRead } from '@/server/data/durable-records';
import { nativeEstateCreationReady } from '@/server/data/company-estate-access';

export const dynamic = 'force-dynamic';

function allRows<T>(read: (cursor?: string | null) => Page<T>): T[] {
  const rows: T[] = [];
  let cursor: string | null | undefined;
  do {
    const page = read(cursor);
    rows.push(...page.items);
    cursor = page.cursor;
  } while (cursor !== null);
  return rows;
}

/** Estate properties are independent of Facility spaces and expose no people or ledger data. */
export default async function EstatePropertiesPage() {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('assets_ppm', 'read', 'estate');
  const session = await requireOperatorSession();
  const sites = allRows((cursor) => repos.sites.list(actor, { cursor, limit: 200 }));
  const units = allRows((cursor) => repos.units.list(actor, { cursor, limit: 200 }));
  const properties = buildEstateProperties(sites, units);
  const review = session.key === 'private-review' && reviewModeEnabled() && isReviewActor(actor);
  const demo = review || session.key !== 'clerk' && devIdentityEnabled();
  const persistent = durableRecordsEnabled();
  const native = nativeEstateCreationReady(actor);
  const localDemo = review || demo && process.env.NODE_ENV !== 'production' && (!process.env.DATA_SOURCE || process.env.DATA_SOURCE === 'memory');
  const now = demo ? new Date(`${NOW}T09:00:00Z`) : new Date();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const datePart = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  const asOfDate = `${datePart('year')}-${datePart('month')}-${datePart('day')}`;

  return <EstatePropertiesWorkspace
    properties={properties}
    canEdit={native && canRegisterEstateRecords(actor)}
    demo={demo}
    persistent={persistent}
    actions={<EstateCreateActions canAddProperty={canRegisterEstateRecords(actor) && (!actor.companyAccess || native)} canAddTenant={false} units={[]} persistent={persistent} demo={localDemo} native={native} asOfDate={asOfDate} />}
  />;
  });
}
