import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { reviewStats, reviewsByApartment } from '@/domain/shortlet';
import { toneVar } from '@/lib/status-tones';
import { Star, MessageSquare, Sparkles } from 'lucide-react';

function Stars({ n, size = 13 }: { n: number; size?: number }) {
  return <span className="inline-flex gap-0.5">{[1, 2, 3, 4, 5].map((i) => <Star key={i} size={size} className={i <= Math.round(n) ? 'fill-warning text-warning' : 'text-border-2'} />)}</span>;
}

/** Guest feedback (flow idea) — reviews submitted after checkout (via the
 *  WhatsApp review request). Overall rating, distribution, per-apartment scores
 *  and the review feed; feeds guest CRM + the booking page. */
export default async function ShortletReviewsPage() {
  const { actor } = await requireCapability('bookings_amenities');
  const reviews = repos.shortletReviews.list(actor).items;
  const apts = new Map(repos.shortletApartments.list(actor).items.map((a) => [a.id, a.name]));
  const stats = reviewStats(reviews);
  const byApt = reviewsByApartment(reviews);
  const maxDist = Math.max(...stats.distribution, 1);
  const sorted = [...reviews].sort((a, b) => (a.atISO < b.atISO ? 1 : -1));

  return (
    <div className="max-w-[820px] mx-auto flex flex-col gap-3.5">
      {/* Overall */}
      <div className="grid grid-cols-1 min-[560px]:grid-cols-[220px_1fr] gap-3.5">
        <div className="bg-surface border border-border rounded-2xl shadow-card p-4 flex flex-col items-center justify-center text-center">
          <div className="text-[40px] font-bold tracking-[-0.03em] leading-none">{stats.avg || '—'}</div>
          <Stars n={stats.avg} size={16} />
          <div className="text-[11.5px] text-text-3 mt-1.5">{stats.count} review{stats.count === 1 ? '' : 's'}</div>
        </div>
        <div className="bg-surface border border-border rounded-2xl shadow-card p-4">
          <div className="text-[12.5px] font-semibold mb-2.5">Rating distribution</div>
          <div className="flex flex-col gap-1.5">
            {[5, 4, 3, 2, 1].map((star, i) => (
              <div key={star} className="flex items-center gap-2 text-[11.5px]">
                <span className="w-8 text-text-3 flex items-center gap-0.5">{star}<Star size={10} className="fill-warning text-warning" /></span>
                <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(stats.distribution[i] / maxDist) * 100}%`, background: toneVar('warn') }} /></div>
                <span className="w-6 text-right font-mono text-text-3">{stats.distribution[i]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Per apartment */}
      {byApt.size > 0 && (
        <div className="bg-surface border border-border rounded-2xl shadow-card p-4">
          <div className="text-[12.5px] font-semibold mb-2.5">By apartment</div>
          <div className="grid grid-cols-2 min-[560px]:grid-cols-3 gap-2">
            {[...byApt.entries()].sort((a, b) => b[1].avg - a[1].avg).map(([id, v]) => (
              <div key={id} className="rounded-xl border border-border p-2.5">
                <div className="text-[12px] font-medium truncate">{apts.get(id) ?? '—'}</div>
                <div className="flex items-center gap-1.5 mt-0.5"><span className="text-[14px] font-bold">{v.avg}</span><Stars n={v.avg} size={11} /></div>
                <div className="text-[10px] text-text-3">{v.count} review{v.count === 1 ? '' : 's'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Feed */}
      <div>
        <div className="flex items-center gap-2 mb-2"><MessageSquare size={14} className="text-text-3" /><span className="text-[13px] font-semibold">Guest reviews</span></div>
        {sorted.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-border rounded-2xl"><MessageSquare size={24} className="mx-auto text-text-3 mb-2" /><p className="text-[13px] font-medium">No feedback yet</p><p className="text-[12px] text-text-3 mt-0.5">Reviews appear after guests reply to the checkout WhatsApp message.</p></div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {sorted.map((r) => (
              <div key={r.id} className="bg-surface border border-border rounded-2xl shadow-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div><div className="text-[13.5px] font-semibold">{r.guestName}</div><div className="text-[11px] text-text-3">{apts.get(r.apartmentId) ?? ''} · {r.atISO}</div></div>
                  <Stars n={r.rating} />
                </div>
                <p className="text-[12.5px] text-text-2 mt-2">“{r.comment}”</p>
                {r.tags.length > 0 && <div className="flex flex-wrap gap-1.5 mt-2">{r.tags.map((t) => <span key={t} className="text-[10.5px] px-2 py-0.5 rounded-full bg-surface-2 text-text-3">{t}</span>)}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="text-[11px] text-text-3 flex items-center gap-1.5"><Sparkles size={12} className="text-primary" /> A 5-star guest becomes a repeat guest — reviews feed your guest CRM and public booking page.</p>
    </div>
  );
}
