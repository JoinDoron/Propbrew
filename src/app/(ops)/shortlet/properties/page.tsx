import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { NOW_MS } from '@/domain/ppm';
import { occupancyRate, suggestNightlyRate } from '@/domain/shortlet';
import { toneVar } from '@/lib/status-tones';
import { Building2, Wifi, KeyRound, Sparkles, TrendingUp, Landmark } from 'lucide-react';

const money = (m: number) => `₦${(m / 100).toLocaleString('en-NG')}`;

/** FR-MP (Short-Let PMS) — properties → apartments, with access details and an
 *  advisory smart-rate suggestion per unit (occupancy + weekend + season).
 *  Rate suggestions are advisory only — the PRD excludes dynamic pricing. */
export default async function ShortletPropertiesPage() {
  const { actor } = await requireCapability('bookings_amenities');
  const props = repos.shortletProperties.list(actor).items;
  const apts = repos.shortletApartments.list(actor).items;
  const bookings = repos.shortletBookings.list(actor).items;

  const now = new Date(NOW_MS);
  const mStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const mEnd = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  // next Saturday for a weekend-premium example
  const nextSat = new Date(NOW_MS + ((6 - now.getUTCDay() + 7) % 7 || 7) * 24 * 3600 * 1000).toISOString().slice(0, 10);

  return (
    <div className="max-w-[900px] mx-auto flex flex-col gap-4">
      {props.map((p) => (
        <div key={p.id} className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-primary-weak text-primary grid place-items-center flex-none"><Building2 size={18} /></span>
            <div className="flex-1"><div className="text-[14.5px] font-semibold">{p.name}</div><div className="text-[11.5px] text-text-3">{p.area}, {p.city} · {apts.filter((a) => a.propertyId === p.id).length} apartments</div></div>
            <div className="text-right text-[11px] text-text-3 inline-flex items-center gap-1"><Landmark size={12} /> {p.bankName} · {p.accountNumber}</div>
          </div>
          <div className="divide-y divide-border">
            {apts.filter((a) => a.propertyId === p.id).map((a) => {
              const occ = occupancyRate(bookings, a.id, mStart, mEnd);
              const rec = suggestNightlyRate(a, nextSat, occ);
              const up = rec.deltaPct > 0;
              return (
                <div key={a.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-semibold">{a.name} <span className="text-text-3 font-normal">· {a.type}</span></div>
                      <div className="text-[11.5px] text-text-3 flex items-center gap-2 flex-wrap mt-0.5">
                        <span className="inline-flex items-center gap-1"><Wifi size={11} /> {a.wifiSsid}</span>
                        <span className="inline-flex items-center gap-1 truncate max-w-[220px]"><KeyRound size={11} /> {a.accessInstructions}</span>
                      </div>
                    </div>
                    <div className="text-right flex-none">
                      <div className="text-[14px] font-bold font-mono">{money(a.nightlyRate.minor)}<span className="text-[10px] text-text-3 font-normal">/night</span></div>
                      <div className="text-[10.5px] text-text-3">{occ}% occupied this month</div>
                    </div>
                  </div>
                  <div className="mt-2.5 rounded-xl p-2.5 flex items-center gap-2" style={{ background: `color-mix(in srgb, ${toneVar(up ? 'success' : 'info')} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${toneVar(up ? 'success' : 'info')} 25%, transparent)` }}>
                    <Sparkles size={13} style={{ color: toneVar(up ? 'success' : 'info') }} className="flex-none" />
                    <div className="text-[11.5px] flex-1">
                      <span className="font-semibold">Suggested for {nextSat.slice(5)}: {money(rec.suggestedMinor)}</span>
                      {rec.deltaPct !== 0 && <span className={up ? 'text-positive' : 'text-text-3'}> ({up ? '+' : ''}{rec.deltaPct}%)</span>}
                      <span className="text-text-3"> · {rec.reasons[0]}</span>
                    </div>
                    <TrendingUp size={13} className="text-text-3 flex-none" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-[11px] text-text-3 flex items-center gap-1.5"><Sparkles size={12} /> Rate suggestions are advisory — you set the price. (The PRD excludes automated dynamic pricing.)</p>
    </div>
  );
}
