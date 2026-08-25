'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, HardHat, Wrench, Users, BedDouble, TrendingUp } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';

/**
 * Hero + the "what are you here for?" lens picker. Selecting a lens swaps a
 * live, theme-aware mock of the corresponding Reeve surface — rendered in DOM
 * rather than as a screenshot so it stays crisp and themes correctly. Figures
 * shown are the app's demo dataset.
 */

type Row = { label: string; sub: string; value: string; tone: Tone };
type Lens = {
  id: string; chip: string; icon: React.ReactNode;
  screen: string; ring: number; ringLabel: string; ringCaption: string;
  kpis: { label: string; value: string }[];
  listTitle: string; rows: Row[];
};

const LENSES: Lens[] = [
  {
    id: 'construction', chip: 'Building it', icon: <HardHat size={14} />,
    screen: 'Construction · Command Center', ring: 46, ringLabel: 'At risk', ringCaption: '2 active projects · ₦420.4m at risk',
    kpis: [{ label: 'Active projects', value: '2' }, { label: 'Crew on site', value: '4/7' }, { label: 'Open PO value', value: '₦843.6m' }, { label: 'Critical signals', value: '6' }],
    listTitle: 'Delivery radar',
    rows: [
      { label: 'Y16 reinforcement bar', sub: 'PO-3012 · SteelForce · 0/40 tonne', value: 'late', tone: 'danger' },
      { label: 'Cement 42.5R', sub: 'PO-3008 · Dangote · 800/1200 bag', value: 'late', tone: 'danger' },
      { label: 'Passenger lifts (3 no.)', sub: 'PO-3021 · KONE Gulf FZE · USD', value: '10-30', tone: 'info' },
    ],
  },
  {
    id: 'facilities', chip: 'Running it', icon: <Wrench size={14} />,
    screen: 'Facility · Control Center', ring: 78, ringLabel: 'Healthy', ringCaption: 'PPM compliance across the portfolio',
    kpis: [{ label: 'Open work orders', value: '18' }, { label: 'Overdue', value: '3' }, { label: 'PPM due (7d)', value: '11' }, { label: 'Assets tracked', value: '240' }],
    listTitle: 'Needs attention',
    rows: [
      { label: 'Generator 2 — service overdue', sub: 'Lekki Gardens · plant room', value: 'overdue', tone: 'danger' },
      { label: 'Lift A quarterly inspection', sub: 'Victoria Court · due Friday', value: 'due', tone: 'warn' },
      { label: 'Borehole pump vibration', sub: 'Reported by technician', value: 'triage', tone: 'progress' },
    ],
  },
  {
    id: 'estate', chip: 'Living in it', icon: <Users size={14} />,
    screen: 'Estate · Collections', ring: 92, ringLabel: 'On track', ringCaption: 'Service-charge collection rate',
    kpis: [{ label: 'Collected', value: '₦58.4m' }, { label: 'In arrears', value: '₦4.9m' }, { label: 'Residents', value: '312' }, { label: 'Open requests', value: '7' }],
    listTitle: 'Collections',
    rows: [
      { label: 'Q3 service charge', sub: '284 of 312 units settled', value: '91%', tone: 'success' },
      { label: 'Arrears > 60 days', sub: '9 units · reminder scheduled', value: '₦2.1m', tone: 'warn' },
      { label: 'Payment plans active', sub: 'Agreed with 5 residents', value: '5', tone: 'info' },
    ],
  },
  {
    id: 'shortlet', chip: 'Letting it', icon: <BedDouble size={14} />,
    screen: 'Short-Let · Dashboard', ring: 71, ringLabel: 'Occupancy', ringCaption: 'Next 30 nights across 12 apartments',
    kpis: [{ label: 'Occupancy', value: '71%' }, { label: 'ADR', value: '₦96k' }, { label: 'RevPAR', value: '₦68k' }, { label: 'Arrivals today', value: '3' }],
    listTitle: 'Today',
    rows: [
      { label: 'Same-day turnover · Marina 4B', sub: 'Check-out 11:00 → check-in 15:00', value: 'tight', tone: 'warn' },
      { label: 'Balance due · A. Okafor', sub: 'RES-2291 · ₦120,000 outstanding', value: 'unpaid', tone: 'danger' },
      { label: 'New enquiry · Ikoyi Loft', sub: '4 nights · via booking page', value: 'new', tone: 'info' },
    ],
  },
  {
    id: 'investor', chip: 'Funding it', icon: <TrendingUp size={14} />,
    screen: 'Investor · My Projects', ring: 64, ringLabel: 'Build progress', ringCaption: 'Weighted across subscribed projects',
    kpis: [{ label: 'Committed', value: '₦180m' }, { label: 'Projects', value: '2' }, { label: 'Units held', value: '6' }, { label: 'Next milestone', value: 'Dec' }],
    listTitle: 'Portfolio',
    rows: [
      { label: 'Marina Heights', sub: 'Superstructure · 36% complete', value: 'building', tone: 'progress' },
      { label: 'Cedar Court', sub: 'Finishing · handover Dec 2026', value: '88%', tone: 'success' },
      { label: 'Q3 investor update', sub: 'Published from approved reports', value: 'new', tone: 'info' },
    ],
  },
];

export function Hero() {
  const [active, setActive] = useState(0);
  const lens = LENSES[active];

  return (
    <section className="relative overflow-hidden">
      {/* soft brand wash behind the hero */}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(900px 420px at 50% -8%, var(--primary-weak), transparent 70%)' }} />

      <div className="relative max-w-[1180px] mx-auto px-5 pt-14 pb-16 md:pt-20 md:pb-24">
        <div className="max-w-[860px] mx-auto text-center">
          <span className="inline-flex items-center gap-2 h-7 px-3 rounded-full text-[11px] font-semibold tracking-[0.1em] uppercase" style={{ background: 'var(--primary-weak)', color: 'var(--primary)' }}>
            Real estate operating system
          </span>

          <h1 className="mt-5 text-[38px] sm:text-[52px] lg:text-[62px] font-normal tracking-[-0.035em] leading-[1.03]">
            One system of record for the
            <br className="hidden sm:block" />{' '}
            <span style={{ color: 'var(--primary)' }}>entire property lifecycle</span>
          </h1>

          <p className="mt-5 text-[16px] md:text-[17.5px] text-text-2 leading-relaxed max-w-[660px] mx-auto">
            Reeve runs the build, the building and the people in it — construction delivery,
            facilities, estates, short-let and investor reporting on one platform, so the money
            and the site never tell two different stories.
          </p>

          <div className="mt-7 flex items-center justify-center gap-3 flex-wrap">
            <Link href="/dashboard" className="h-12 px-6 rounded-full inline-flex items-center gap-2 text-[15px] font-medium text-on-primary transition-transform hover:-translate-y-px" style={{ background: 'var(--primary)' }}>
              Open the live demo <ArrowRight size={16} />
            </Link>
            <a href="#modules" className="h-12 px-6 rounded-full inline-flex items-center gap-2 text-[15px] font-medium border border-border-2 bg-surface hover:bg-surface-2 transition-colors">
              See every module
            </a>
          </div>
          <p className="mt-3 text-[12.5px] text-text-3">No sign-up — the demo opens on live seeded data.</p>
        </div>

        {/* Lens picker */}
        <div className="mt-12 md:mt-14">
          <p className="text-center text-[12.5px] text-text-3 mb-3">What brings you here?</p>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {LENSES.map((l, i) => {
              const on = i === active;
              return (
                <button
                  key={l.id}
                  onClick={() => setActive(i)}
                  aria-pressed={on}
                  className="h-10 px-4 rounded-full inline-flex items-center gap-2 text-[13.5px] font-medium border transition-all"
                  style={on
                    ? { borderColor: 'transparent', background: 'var(--primary)', color: 'var(--on-primary)' }
                    : { borderColor: 'var(--border-2)', background: 'var(--surface)', color: 'var(--text-2)' }}
                >
                  {l.icon} {l.chip}
                </button>
              );
            })}
          </div>
        </div>

        {/* Live app mock */}
        <div className="mt-8 md:mt-10 max-w-[1000px] mx-auto">
          <AppMock key={lens.id} lens={lens} />
        </div>
      </div>
    </section>
  );
}

function AppMock({ lens }: { lens: Lens }) {
  const R = 30, C = 2 * Math.PI * R;
  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden animate-[tms-pop_.32s_cubic-bezier(.4,0,.2,1)]" style={{ boxShadow: 'var(--shadow-lg)' }}>
      {/* window chrome */}
      <div className="h-10 px-4 flex items-center gap-2 border-b border-border bg-surface-2">
        <span className="flex gap-1.5">
          {['#ef4444', '#f59e0b', '#10b981'].map((c) => <span key={c} className="w-2.5 h-2.5 rounded-full" style={{ background: c, opacity: .65 }} />)}
        </span>
        <span className="mx-auto text-[11.5px] text-text-3 font-medium">{lens.screen}</span>
      </div>

      <div className="p-4 md:p-5">
        {/* banner with ring */}
        <div className="rounded-xl p-4 flex items-center gap-4 text-white" style={{ background: 'linear-gradient(135deg,#0f1424 0%,#1b2340 55%,#26305a 100%)' }}>
          <svg width="72" height="72" viewBox="0 0 72 72" className="flex-none">
            <circle cx="36" cy="36" r={R} fill="none" stroke="rgba(255,255,255,.16)" strokeWidth="7" />
            <circle
              cx="36" cy="36" r={R} fill="none" stroke={toneVar(lens.ring >= 75 ? 'success' : lens.ring >= 55 ? 'warn' : 'danger')}
              strokeWidth="7" strokeLinecap="round" strokeDasharray={C}
              strokeDashoffset={C * (1 - lens.ring / 100)} transform="rotate(-90 36 36)"
            />
            <text x="36" y="40" textAnchor="middle" className="fill-white" style={{ fontSize: 16, fontWeight: 700 }}>{lens.ring}</text>
          </svg>
          <div className="min-w-0">
            <div className="text-[10px] text-white/60 tracking-[0.08em] uppercase">{lens.screen.split('·')[0].trim()} · portfolio</div>
            <div className="text-[17px] md:text-[19px] font-semibold tracking-[-0.02em] mt-0.5">{lens.ringLabel}</div>
            <div className="text-[12px] text-white/70 mt-0.5 truncate">{lens.ringCaption}</div>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mt-3">
          {lens.kpis.map((k) => (
            <div key={k.label} className="rounded-xl border border-border bg-surface p-3">
              <div className="text-[11px] text-text-3 font-medium truncate">{k.label}</div>
              <div className="text-[17px] font-bold tracking-[-0.02em] mt-1">{k.value}</div>
            </div>
          ))}
        </div>

        {/* list */}
        <div className="mt-3 rounded-xl border border-border overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-border text-[12px] font-semibold bg-surface-2">{lens.listTitle}</div>
          <div className="divide-y divide-border">
            {lens.rows.map((r) => (
              <div key={r.label} className="px-3.5 py-2.5 flex items-center gap-3">
                <span className="w-7 h-7 rounded-lg flex-none grid place-items-center" style={{ background: `color-mix(in srgb, ${toneVar(r.tone)} 14%, transparent)`, color: toneVar(r.tone) }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: toneVar(r.tone) }} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-medium truncate">{r.label}</div>
                  <div className="text-[10.5px] text-text-3 truncate">{r.sub}</div>
                </div>
                <span className="text-[10px] font-semibold px-2 h-5 rounded-full inline-flex items-center flex-none" style={{ background: `color-mix(in srgb, ${toneVar(r.tone)} 14%, transparent)`, color: toneVar(r.tone) }}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
