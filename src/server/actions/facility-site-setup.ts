'use server';

import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { assertCan } from '@/lib/authz';
import type { Site } from '@/domain/entities';
import { withDurableMutation } from '@/server/data/durable-records';
import { currentRecordContext } from '@/server/data/record-context';
import { getActor } from '@/server/session';
import { nativeAuthEnabled } from '@/server/auth/mode';
import { operatingNowISO } from '@/server/operating-clock';

export type FacilitySiteResult = { ok: true; id: string; message: string } | { ok: false; error: string };
const text = (max: number) => z.string().trim().min(2).max(max).refine((value) => !/[\u0000-\u001f\u007f]/.test(value));
const schema = z.strictObject({ expectedCompanyId: z.uuid(), idempotencyKey: z.uuid(), name: text(160), address: text(500) });
type SiteSetup = { tenantId: string; version: number; receipts: { tenantId: string; actorId: string; key: string; hash: string; siteId: string }[]; audit: { tenantId: string; siteId: string; actorId: string; action: string; at: string }[] };
const folded = (value: string) => value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('en-NG');

/** Facility-only company bootstrap. Creating a site never grants a scoped
 * manager access to another location or invents buildings/units. */
export async function createFacilitySite(input: unknown): Promise<FacilitySiteResult> {
  return withDurableMutation(async () => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { ok: false, error: 'Enter a facility site name and address, then submit the current company form.' };
    const actor = await getActor(), value = parsed.data, context = currentRecordContext();
    if (!nativeAuthEnabled() || !context || context.mode !== 'write' || !context.companyPrincipal || context.companyPrincipal.actor.userId !== actor.userId || context.companyPrincipal.company.id !== actor.tenantId || !actor.tenantId || actor.tenantId !== value.expectedCompanyId || context.domainTenantId !== actor.tenantId) return { ok: false, error: 'Your company changed. Reopen Spaces before creating a facility site.' };
    const scope = assertCan(actor, 'assets_ppm', 'create');
    if (scope.estateIds !== 'all' || !actor.allEstates) return { ok: false, error: 'Only a company-wide Facility manager can add a new site. Ask your company administrator.' };
    const tenantId = actor.tenantId, hash = createHash('sha256').update(JSON.stringify([value.name, value.address])).digest('hex');
    const raw = context.state.auxiliary.facilitySites as SiteSetup | undefined;
    if (raw && (raw.tenantId !== tenantId || !Number.isSafeInteger(raw.version) || raw.version < 1 || !Array.isArray(raw.receipts) || !Array.isArray(raw.audit) || raw.receipts.some((row) => row.tenantId !== tenantId) || raw.audit.some((row) => row.tenantId !== tenantId))) return { ok: false, error: 'This company site register needs administrator review.' };
    const sites = context.state.collections.sites as Site[], prior = raw?.receipts.find((row) => row.actorId === actor.userId && row.key === value.idempotencyKey);
    if (prior) {
      if (prior.hash !== hash || !sites.some((site) => site.tenantId === tenantId && String(site.id) === prior.siteId)) return { ok: false, error: 'This submission key was used for other details. Open a new site form.' };
      return { ok: true, id: prior.siteId, message: 'This facility site was already created.' };
    }
    const companySites = sites.filter((site) => site.tenantId === tenantId);
    if (companySites.length >= 1000) return { ok: false, error: 'This company has reached its 1,000-site limit. Contact support before adding more locations.' };
    if (companySites.some((site) => folded(site.name) === folded(value.name) && folded(site.address) === folded(value.address))) return { ok: false, error: 'A site with this name and address already exists. Use the existing location.' };
    const id = `facility-${randomUUID()}`, at = operatingNowISO();
    sites.push({ tenantId, id, kind: 'facility', name: value.name, address: value.address, buildingCount: 0, unitCount: 0 } as Site);
    const data = raw ?? { tenantId, version: 1, receipts: [], audit: [] };
    data.receipts.push({ tenantId, actorId: actor.userId, key: value.idempotencyKey, hash, siteId: id });
    data.audit.push({ tenantId, siteId: id, actorId: actor.userId, action: 'facility.site_created', at });
    if (raw) data.version++;
    context.state.auxiliary.facilitySites = data;
    for (const path of ['/spaces', '/facility', '/control-center', '/assets', '/ppm', '/inventory', '/inspections', '/portfolio']) revalidatePath(path);
    return { ok: true, id, message: 'Facility site created. You can now add assets, maintenance plans, stock and compliance obligations here.' };
  }, 'facility');
}
