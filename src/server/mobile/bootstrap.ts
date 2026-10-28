import 'server-only';

import type { Actor } from '@/lib/authz';
import { repos } from '@/server/data';

const UNPAID = new Set(['issued', 'partially_paid', 'overdue', 'in_arrears', 'escalated']);

const money = (minor: number, currency = 'NGN') => ({ minor, currency });

export function mobileTenantBootstrap(actor: Actor, displayName: string) {
  const resident = repos.residents.list(actor, { limit: 20 }).items.find((row) => row.userId === actor.userId);
  const activeUnitId = actor.unitIds[0] ?? resident?.unitId ?? '';
  const invoices = repos.invoices.list(actor, { limit: 200 }).items;
  const wallet = repos.wallets.list(actor, { limit: 20 }).items.find((row) => row.unitId === activeUnitId);
  const announcements = repos.announcements.list(actor, { limit: 100 }).items
    .filter((row) => row.sentAt)
    .sort((a, b) => String(b.sentAt).localeCompare(String(a.sentAt)));
  const requests = repos.workOrders.list(actor, { limit: 200 }).items
    .filter((row) => !row.unitId || row.unitId === activeUnitId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const bookings = [...repos.bookings.list(actor, { limit: 100 }).items]
    .sort((a, b) => String(a.slot).localeCompare(String(b.slot)));
  const sos = repos.sosEvents.list(actor, { limit: 50 }).items
    .filter((row) => !row.unitId || row.unitId === activeUnitId);
  const documents = repos.documents.list(actor, { limit: 100 }).items;

  const pendingByCurrency = new Map<string, number>();
  for (const invoice of invoices) {
    if (!UNPAID.has(invoice.status) || invoice.unitId !== activeUnitId || invoice.amount.currency !== invoice.paid.currency) continue;
    pendingByCurrency.set(invoice.amount.currency, (pendingByCurrency.get(invoice.amount.currency) ?? 0) + Math.max(0, invoice.amount.minor - invoice.paid.minor));
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    profile: {
      userId: actor.userId,
      displayName: resident?.name ?? displayName,
      firstName: (resident?.name ?? displayName ?? 'Resident').split(' ')[0],
      estateIds: actor.estateIds,
      unitIds: actor.unitIds,
      activeUnitId,
      roles: actor.roles,
    },
    summary: {
      wallet: wallet?.available ?? money(0),
      pending: [...pendingByCurrency].map(([currency, minor]) => money(minor, currency)),
      openRequests: requests.filter((row) => !['closed', 'cancelled', 'resolved', 'verified'].includes(row.status)).length,
      activeSos: sos.filter((row) => !['reviewed', 'resolved'].includes(row.status)).length,
    },
    invoices,
    announcements,
    requests,
    bookings,
    sos,
    documents,
    visitors: [],
    community: { posts: [], events: [], polls: [] },
    availability: {
      onlinePayments: 'partner_pending',
      virtualAccount: 'partner_pending',
      whatsapp: 'partner_pending',
      prepaidMeter: 'partner_pending',
      offlineGateValidation: 'gate_client_pending',
      nfcCredentials: 'hardware_pending',
    },
  };
}
