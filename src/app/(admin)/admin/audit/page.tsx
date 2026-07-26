import { requireCapability } from '@/server/guard';
import { getAllHistory } from '@/server/data/store';
import { ROLE_LABELS, type Role } from '@/lib/authz';
import { Card, CardHeader, Mono, Table, Td, Th, TableRow } from '@/components/ui';

/** SC-10 — audit log. An immutable record of who did what, when: actor, tenant,
 *  timestamp. Here it aggregates every §10 transition fired this session across
 *  all machines. Platform-Admin-only, 12-month retention (proposed). */
export default async function AuditPage() {
  await requireCapability('tenant_config');
  const entries = getAllHistory();

  const MACHINE_LABEL: Record<string, string> = {
    'work-order': 'Work order',
    'service-charge': 'Service charge',
    booking: 'Booking',
    'sos-event': 'SOS',
    'marketplace-order': 'Order',
  };

  return (
    <div className="max-w-[1100px] mx-auto flex flex-col gap-3.5">
      <div className="rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-[12px] text-text-3">
        Immutable · actor + tenant + timestamp on every entry (SC-10). {entries.length} events · 12-month retention (proposed).
        Financial actions, security events and AI overrides are all captured here.
      </div>
      <Card padded={false}>
        <div className="p-4 sm:p-[18px] pb-0">
          <CardHeader title="Audit log" subtitle="Every state transition, newest first" />
        </div>
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Record</Th>
              <Th>Event</Th>
              <Th>Change</Th>
              <Th>Actor</Th>
            </tr>
          </thead>
          <tbody>
            {entries.slice(0, 100).map((e, i) => (
              <TableRow key={`${e.recordId}-${e.seq}-${i}`}>
                <Td className="text-[12px] text-text-3 font-mono whitespace-nowrap">{fmt(e.at)}</Td>
                <Td>
                  <div className="text-[12.5px] font-medium">{MACHINE_LABEL[e.machine] ?? e.machine}</div>
                  <Mono className="text-[11px] text-text-3">{e.recordId}</Mono>
                </Td>
                <Td className="text-[12.5px]">{e.event}</Td>
                <Td className="text-[12px] text-text-3">
                  <Mono>{e.from ?? '∅'}</Mono> → <Mono className="text-text-2">{e.to}</Mono>
                </Td>
                <Td className="text-[12.5px]">
                  {e.actorName}
                  <span className="text-text-3"> · {ROLE_LABELS[e.actorRole as Role] ?? e.actorRole}</span>
                </Td>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('en-NG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
