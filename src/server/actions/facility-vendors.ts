'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assertCan, ForbiddenError, ROLE_LABELS, type Role } from '@/lib/authz';
import { nowISO } from '@/server/clock';
import { withDurableMutation } from '@/server/data/durable-records';
import { currentRecordContext, nextRecordSequence } from '@/server/data/record-context';
import { db } from '@/server/data/store';
import { operatingDateISO } from '@/server/operating-clock';
import { getActor } from '@/server/session';
import { isFacilityDate } from '@/server/facility-guards';

const inputSchema = z.strictObject({
  expectedCompanyId: z.string().min(1).max(200), name: z.string().trim().min(2).max(120),
  services: z.array(z.string().trim().min(2).max(80)).min(1).max(12),
  coverage: z.string().trim().min(2).max(160), insuranceExpiry: z.string(),
});
export type FacilityVendorInput = z.infer<typeof inputSchema>;
export type FacilityVendorResult = { ok: true; id: string; name: string } | { ok: false; error: string };

export async function createFacilityVendor(raw: FacilityVendorInput): Promise<FacilityVendorResult> {
  return withDurableMutation(async () => {
    const parsed = inputSchema.safeParse(raw);
    if (!parsed.success || !isFacilityDate(parsed.data.insuranceExpiry)) return { ok: false, error: 'Review the vendor name, services, coverage and insurance date.' };
    const actor = await getActor();
    if (!actor.tenantId || actor.tenantId !== parsed.data.expectedCompanyId) return { ok: false, error: 'Your company changed. Reopen Vendors before saving.' };
    try { assertCan(actor, 'work_orders', 'create'); }
    catch (error) { if (error instanceof ForbiddenError) return { ok: false, error: 'Only an authorised Facility manager can onboard vendors.' }; throw error; }
    const context = currentRecordContext();
    if (!context || context.domainTenantId !== actor.tenantId) return { ok: false, error: 'Reopen Vendors in the current company.' };
    const normalized = parsed.data.name.toLocaleLowerCase('en-NG');
    if (db.vendors.some((vendor) => vendor.tenantId === actor.tenantId && vendor.name.toLocaleLowerCase('en-NG') === normalized)) return { ok: false, error: 'A vendor with this name is already in the company directory.' };
    const days = Math.floor((Date.parse(parsed.data.insuranceExpiry) - Date.parse(operatingDateISO())) / 86400000);
    const compliance = days < 0 ? 'expired' : days <= 30 ? 'expiring' : 'valid';
    const id = `vendor-${nextRecordSequence('facility:vendor', 1000)}`;
    const vendor = { tenantId: actor.tenantId, id, name: parsed.data.name,
      services: [...new Set(parsed.data.services.map((service) => service.trim()))], coverage: parsed.data.coverage,
      compliance, insuranceExpiry: parsed.data.insuranceExpiry, jobsCompleted: 0, slaHitRate: 0, rating: 0,
    } as unknown as (typeof db.vendors)[number];
    db.vendors.unshift(vendor);
    const role = (actor.roles as Role[])[0];
    const audit = Array.isArray(context.state.auxiliary.facilityVendorAudit) ? context.state.auxiliary.facilityVendorAudit as Record<string, unknown>[] : [];
    context.state.auxiliary.facilityVendorAudit = [...audit, { id: crypto.randomUUID(), tenantId: actor.tenantId, vendorId: id, action: 'vendor.onboarded', at: nowISO(), actorId: actor.userId, actorName: context.companyPrincipal?.user.name ?? ROLE_LABELS[role] ?? actor.userId, compliance }];
    for (const path of ['/vendors', '/company/team', '/work-orders', '/field', '/facility']) revalidatePath(path);
    return { ok: true, id, name: vendor.name };
  }, 'facility');
}
