import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { guestProfiles } from '@/domain/shortlet';
import { Users, Star, Repeat } from 'lucide-react';
import { toneVar } from '@/lib/status-tones';

const money = (m: number) => `₦${(m / 100).toLocaleString('en-NG')}`;

/** Guest CRM (beyond the PRD) — recognise repeat & VIP guests, lifetime value.
 *  The reference product tracks agents but has no guest CRM; this closes the gap
 *  so operators can reward loyalty and target rebooking. */
export default async function ShortletGuestsPage() {
  const { actor } = await requireCapability('bookings_amenities');
  const guests = guestProfiles(repos.shortletBookings.list(actor).items);
  const repeatRate = guests.length ? Math.round((guests.filter((g) => g.repeat).length / guests.length) * 100) : 0;
  const vip = guests.filter((g) => g.vip).length;

  return (
    <div className="max-w-[820px] mx-auto flex flex-col gap-3.5">
      <div className="grid grid-cols-3 gap-2.5">
        <Kpi label="Guests" value={String(guests.length)} tone="info" icon={<Users size={16} />} />
        <Kpi label="Repeat rate" value={`${repeatRate}%`} tone={repeatRate >= 30 ? 'success' : 'warn'} icon={<Repeat size={16} />} />
        <Kpi label="VIP guests" value={String(vip)} tone="progress" icon={<Star size={16} />} />
      </div>

      <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border text-[12.5px] font-semibold">Guest directory · by lifetime value</div>
        <div className="divide-y divide-border">
          {guests.map((g) => (
            <div key={g.phone} className="flex items-center gap-3 px-4 py-3">
              <span className="w-9 h-9 rounded-full grid place-items-center flex-none text-[13px] font-bold" style={{ background: `color-mix(in srgb, ${toneVar(g.vip ? 'progress' : 'info')} 16%, transparent)`, color: toneVar(g.vip ? 'progress' : 'info') }}>{g.name.charAt(0)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5"><span className="text-[13.5px] font-semibold truncate">{g.name}</span>{g.vip && <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-white px-1.5 py-0.5 rounded" style={{ background: toneVar('progress') }}><Star size={9} className="fill-white" /> VIP</span>}{g.repeat && !g.vip && <span className="text-[9px] font-bold text-warning">REPEAT</span>}</div>
                <div className="text-[11.5px] text-text-3">{g.phone} · {g.stays} stay{g.stays === 1 ? '' : 's'} · last {g.lastStayISO.slice(0, 10)}</div>
              </div>
              <div className="text-right flex-none"><div className="text-[13.5px] font-mono font-semibold">{money(g.lifetimeValueMinor)}</div><div className="text-[10px] text-text-3">lifetime value</div></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: 'info' | 'success' | 'warn' | 'progress'; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[18px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div></div>;
}
