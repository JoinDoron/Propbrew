'use client';

/**
 * Design-system reference page.
 *
 * This is scaffolding, not product: it renders every primitive so the tokens
 * and components can be reviewed in both themes. Replace it once the PRD
 * defines the real dashboard.
 */

import { useState } from 'react';
import { Banknote, CircleAlert, Clock, Package, Truck } from 'lucide-react';
import {
  Avatar,
  Button,
  Card,
  CardHeader,
  FilterChip,
  KpiCard,
  Mono,
  STATUS_COLORS,
  StatusPill,
  Table,
  TableRow,
  Tabs,
  Td,
  Th,
  type LoadStatus,
} from '@/components/ui';

const LOADS = [
  { ref: 'LD-24817', status: 'In Transit', origin: 'Dallas, TX', dest: 'Atlanta, GA', customer: 'Nexer Foods Corp', driver: 'Marcus Bell', rate: 2850 },
  { ref: 'LD-24816', status: 'Booked', origin: 'Los Angeles, CA', dest: 'Phoenix, AZ', customer: 'Sunridge Retail', driver: 'Ironline Carriers', rate: 1450 },
  { ref: 'LD-24815', status: 'Delivered', origin: 'Chicago, IL', dest: 'Detroit, MI', customer: 'Halden Manufacturing', driver: 'Priya Nair', rate: 1180 },
  { ref: 'LD-24814', status: 'Posted', origin: 'Newark, NJ', dest: 'Boston, MA', customer: 'Atlantic Provisions', driver: 'Unassigned', rate: 980 },
  { ref: 'LD-24813', status: 'Draft', origin: 'Houston, TX', dest: 'New Orleans, LA', customer: 'Gulfstream Energy', driver: 'Devon Clarke', rate: 1620 },
] as const;

const STATUSES = ['All', 'Posted', 'Booked', 'In Transit', 'Delivered', 'Closed'] as const;

export default function Home() {
  const [filter, setFilter] = useState<string>('All');
  const [tab, setTab] = useState<'components' | 'tokens'>('components');

  const rows = LOADS.filter((l) => filter === 'All' || l.status === filter);

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-3.5">
      <div className="grid grid-cols-1 min-[560px]:grid-cols-2 min-[1120px]:grid-cols-4 gap-3.5">
        <KpiCard label="Active loads" value="8" delta="8%" positive icon={<Truck size={18} />} />
        <KpiCard label="In transit now" value="3" delta="1.2%" positive icon={<Clock size={18} />} iconBg="rgba(245,159,11,.15)" iconColor="#f59e0b" />
        <KpiCard label="Booked revenue" value="$14.5k" delta="12%" positive icon={<Banknote size={18} />} iconBg="rgba(16,185,129,.12)" iconColor="#10b981" />
        <KpiCard label="Needs carrier" value="2" delta="2.4%" positive={false} icon={<CircleAlert size={18} />} iconBg="rgba(239,68,68,.12)" iconColor="#ef4444" />
      </div>

      <Card padded={false}>
        <div className="px-4 sm:px-[18px] pt-2">
          <Tabs
            tabs={[
              { id: 'components', label: 'Components' },
              { id: 'tokens', label: 'Tokens' },
            ]}
            active={tab}
            onChange={setTab}
          />
        </div>

        {tab === 'components' ? (
          <div className="p-4 sm:p-[18px] flex flex-col gap-5">
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => (
                <FilterChip
                  key={s}
                  label={s}
                  count={s === 'All' ? LOADS.length : LOADS.filter((l) => l.status === s).length}
                  active={filter === s}
                  onClick={() => setFilter(s)}
                />
              ))}
            </div>

            <Table>
              <thead>
                <tr>
                  <Th>Load</Th>
                  <Th>Status</Th>
                  <Th>Lane</Th>
                  <Th className="max-[720px]:hidden">Customer</Th>
                  <Th className="max-[560px]:hidden">Assigned</Th>
                  <Th className="text-right">Rate</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <TableRow key={l.ref} onClick={() => {}}>
                    <Td><Mono className="font-semibold text-[13px]">{l.ref}</Mono></Td>
                    <Td><StatusPill status={l.status as LoadStatus} /></Td>
                    <Td>
                      <div className="text-[13px] font-medium whitespace-nowrap">{l.origin}</div>
                      <div className="text-[12px] text-text-3 whitespace-nowrap">→ {l.dest}</div>
                    </Td>
                    <Td className="max-[720px]:hidden text-[13px] text-text-2">{l.customer}</Td>
                    <Td className="max-[560px]:hidden">
                      <div className="flex items-center gap-2">
                        <Avatar name={l.driver} size={26} />
                        <span className="text-[13px] whitespace-nowrap">{l.driver}</span>
                      </div>
                    </Td>
                    <Td className="text-right"><Mono className="font-semibold">${l.rate.toLocaleString()}</Mono></Td>
                  </TableRow>
                ))}
              </tbody>
            </Table>

            <div className="flex flex-wrap items-center gap-2.5">
              <Button variant="primary" icon={<Package size={16} />}>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="secondary" disabled>Disabled</Button>
            </div>
          </div>
        ) : (
          <div className="p-4 sm:p-[18px] flex flex-col gap-6">
            <section>
              <CardHeader title="Surfaces & lines" subtitle="Swap with the theme toggle in the header" />
              <div className="flex flex-wrap gap-2.5">
                {['--app', '--surface', '--surface-2', '--surface-3', '--border', '--border-2'].map((t) => (
                  <div key={t} className="w-[132px] rounded-xl border border-border overflow-hidden">
                    <div className="h-12" style={{ background: `var(${t})` }} />
                    <div className="px-2.5 py-2 bg-surface">
                      <Mono className="text-[11px] text-text-2">{t}</Mono>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <CardHeader title="Status scale" subtitle="Load lifecycle colours" />
              <div className="flex flex-wrap gap-2">
                {Object.keys(STATUS_COLORS).map((s) => (
                  <StatusPill key={s} status={s as LoadStatus} />
                ))}
              </div>
            </section>

            <section>
              <CardHeader title="Typography" subtitle="Inter Tight · JetBrains Mono" />
              <div className="flex flex-col gap-1.5">
                <p className="text-[26px] font-bold tracking-[-0.02em]">Display · 26/700</p>
                <p className="text-[18px] font-semibold tracking-[-0.02em]">Heading · 18/600</p>
                <p className="text-sm">Body · 14/400 — the default UI size.</p>
                <p className="text-[13px] text-text-2">Secondary · 13/400</p>
                <p className="text-[11px] text-text-3 uppercase tracking-[0.06em] font-semibold">Label · 11/600</p>
                <Mono className="text-[13px]">Mono · LD-24817 · $2,850 · 1FUJA6CV81LJ12345</Mono>
              </div>
            </section>
          </div>
        )}
      </Card>
    </div>
  );
}
