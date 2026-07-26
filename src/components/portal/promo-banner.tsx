'use client';

/** Rotating promo/ad banner (PRD §5.3), clearly labelled "Ad". Auto-rotates;
 *  tappable to the advertiser destination. */

import { useEffect, useState } from 'react';

type Promo = { title: string; body: string; cta: string; from: string; to: string };

const PROMOS: Promo[] = [
  { title: 'Get 5% off your next top-up', body: 'Fund your wallet with a bank transfer this week.', cta: 'Learn more', from: '#2563eb', to: '#7c3aed' },
  { title: 'Estate generator upgrade', body: 'Reliable power, 24/7. Community update from management.', cta: 'Read update', from: '#0e9f6e', to: '#0891b2' },
  { title: 'Refer a neighbour', body: 'Earn ₦2,000 wallet credit for every referral who joins.', cta: 'Invite', from: '#e0533d', to: '#db2777' },
];

export function PromoBanner() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % PROMOS.length), 5000);
    return () => clearInterval(t);
  }, []);
  const p = PROMOS[i];

  return (
    <button
      className="w-full text-left rounded-2xl p-4 text-white relative overflow-hidden transition-[background] duration-500"
      style={{ backgroundImage: `linear-gradient(120deg, ${p.from}, ${p.to})` }}
    >
      <span className="absolute top-2.5 right-2.5 text-[9.5px] font-bold uppercase tracking-wide bg-black/25 rounded px-1.5 py-0.5">Ad</span>
      <div className="text-[14px] font-semibold pr-8">{p.title}</div>
      <div className="text-[12.5px] text-white/85 mt-0.5">{p.body}</div>
      <div className="inline-flex items-center gap-1 text-[12px] font-semibold mt-2 underline underline-offset-2">{p.cta} →</div>
      <div className="flex gap-1 mt-3">
        {PROMOS.map((_, n) => (
          <span key={n} className={`h-1 rounded-full transition-all ${n === i ? 'w-4 bg-white' : 'w-1.5 bg-white/40'}`} />
        ))}
      </div>
    </button>
  );
}
