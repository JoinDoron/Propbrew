import type { Metadata } from 'next';
import Link from 'next/link';
import {
  HardHat, Wrench, Users, BedDouble, TrendingUp, Building2, ArrowRight, Check,
  Gauge, GitBranch, Radar, Coins, ScrollText, WifiOff, ShieldCheck, Boxes,
  Banknote, Calendar, ClipboardList, Sparkles,
} from 'lucide-react';
import { brand } from '@/config/brand';
import { Hero } from '@/components/marketing/hero';

/**
 * The public landing page (PRD SC-11), replacing the old redirect stub at `/`.
 *
 * Every factual claim here is true of the codebase as built. Where a
 * conventional SaaS landing page would carry customer logos, testimonials or
 * uptime figures, this one carries architecture instead — Reeve has no
 * customers yet, and inventing social proof would be worse than having none.
 */
export const metadata: Metadata = {
  title: `${brand.name} — ${brand.tagline}`,
  description:
    'Reeve is one operating system for the entire property lifecycle: construction delivery, facilities, estates, short-let and investor reporting on a single system of record.',
};

/* --- small building blocks ------------------------------------------------- */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-3">{children}</div>;
}

function Section({ id, children, tinted = false }: { id?: string; children: React.ReactNode; tinted?: boolean }) {
  return (
    <section id={id} className={`py-16 md:py-24 ${tinted ? 'bg-surface border-y border-border' : ''}`}>
      <div className="max-w-[1180px] mx-auto px-5">{children}</div>
    </section>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[28px] md:text-[38px] font-normal tracking-[-0.03em] leading-[1.1] max-w-[760px]">{children}</h2>;
}

/* --- content --------------------------------------------------------------- */

const LIFECYCLE = [
  { icon: <HardHat size={18} />, phase: 'Develop', title: 'Deliver the build', body: 'Earned value, critical path, procurement and site reporting — so a slip on site shows up as money before it shows up as a surprise.', href: '/construction' },
  { icon: <Wrench size={18} />, phase: 'Operate', title: 'Run the building', body: 'Work orders, planned maintenance, assets, energy, safety and access, with the vendors and SLAs that keep them moving.', href: '/control-center' },
  { icon: <Users size={18} />, phase: 'Occupy', title: 'Serve the people', body: 'Residents, billing and collections, community, governance and a self-service portal that cuts the WhatsApp queue.', href: '/collections' },
  { icon: <TrendingUp size={18} />, phase: 'Invest', title: 'Report to capital', body: 'Portfolio performance and an investor view fed from approved site reports — the delivery arm and the cap table on one spine.', href: '/portfolio' },
];

const TIERS = [
  { size: 'One estate', name: 'Single site', body: 'A facility manager running one estate gets the whole operations stack — work orders, PPM, inspections, residents and collections — without a separate tool for each.', points: ['Work orders & planned maintenance', 'Resident portal & collections', 'Vendors, SLAs and safety'] },
  { size: 'Multi-estate', name: 'Portfolio operator', body: 'Managing several estates adds a portfolio lens, cross-site reporting and short-let, with capability-scoped access so each manager sees only their own scope.', points: ['Portfolio & cross-site reporting', 'Short-let PMS with channels', 'Role-scoped access per estate'], featured: true },
  { size: 'Developer', name: 'Develop & invest', body: 'A developer gets construction delivery joined to the investor portal — the same project appears as a build programme to the PM and as a return to the investor.', points: ['Earned value, CPM and risk radar', 'Investor projects, returns, updates', 'Board, governance and audit'] },
];

const MODULE_GROUPS = [
  { icon: <HardHat size={16} />, title: 'Construction delivery', items: ['Earned value: CPI, SPI, EAC, VAC, TCPI', 'Critical path with float and slip propagation', 'Procurement: requests → RFQ → PO → delivery', 'BOQ import, timesheets, stock and FX exposure'] },
  { icon: <Wrench size={16} />, title: 'Facilities', items: ['Work orders with vendor assignment and SLAs', 'Planned maintenance and inspections', 'Asset register with energy and sustainability', 'Safety permits, access control and visitors'] },
  { icon: <Users size={16} />, title: 'Estate & community', items: ['Residents, tenancy and announcements', 'Billing, collections and arrears', 'Governance, board and committee motions', 'Amenity bookings, parcels and security SOS'] },
  { icon: <BedDouble size={16} />, title: 'Short-let', items: ['Calendar, bookings and a public booking page', 'Dynamic pricing and channel management', 'Guests, reviews and WhatsApp messaging', 'Turnover inspections, expenses and analytics'] },
  { icon: <TrendingUp size={16} />, title: 'Investor & portfolio', items: ['Investor projects, returns and updates', 'Portfolio performance across estates', 'Build Watch — a client mirror of delivery', 'Reports drawn from approved site records'] },
  { icon: <ShieldCheck size={16} />, title: 'Platform & governance', items: ['Capability-based RBAC across every role', 'Immutable audit log of sensitive actions', 'Multi-tenant with per-tenant branding', 'Vendor and resident portals, admin console'] },
];

const ENGINES = [
  { icon: <Gauge size={16} />, title: 'Earned value', body: 'PV, EV and AC roll into CPI, SPI, EAC and VAC using the standard PMI formulas — not an estimate, a calculation you can check by hand.' },
  { icon: <GitBranch size={16} />, title: 'Critical path', body: 'A real CPM forward and backward pass finds the zero-float chain and propagates a slip to everything downstream of it.' },
  { icon: <Radar size={16} />, title: 'Risk radar', body: 'Nine detectors scan the whole portfolio and return signals carrying evidence, confidence and the naira at risk — each links to the record it came from.' },
  { icon: <Coins size={16} />, title: 'FX revaluation', body: 'Foreign commitments post to the books in naira at the booking rate, then revalue on the outstanding balance as the rate moves.' },
  { icon: <Boxes size={16} />, title: 'Material leakage', body: 'Received minus issued minus on-hand exposes the gap between what was paid for and what is actually on site.' },
  { icon: <Banknote size={16} />, title: 'Bid scoring', body: 'Quotes are ranked on a weighted score across price, lead time, compliance and warranty, so an award decision leaves a defensible trail.' },
  { icon: <Calendar size={16} />, title: 'Dynamic pricing', body: 'Short-let rates respond to occupancy, lead time and season through explicit rules you can read, rather than an opaque model.' },
  { icon: <Sparkles size={16} />, title: 'Grounded copilot', body: 'Ask in plain language. Answers are grounded strictly on your records, cite the rows they used, and say "no record found" instead of inventing one.' },
];

const PILLARS = [
  { icon: <ScrollText size={18} />, title: 'Every number traces to a record', body: 'Advisory output carries its evidence and links back to the row it came from. The copilot refuses to answer past its data rather than filling the gap, and view-only stakeholders never see commercials.' },
  { icon: <WifiOff size={18} />, title: 'Works when the signal does not', body: 'Field capture writes to the device before it acknowledges you — reports, photos and clock-ins survive a reload and send themselves when signal returns. Replays are idempotent, so nothing double-posts.' },
  { icon: <ShieldCheck size={18} />, title: 'Permission is enforced server-side', body: 'A capability matrix governs every role. Each read is scope-filtered and each mutation re-checks server-side, so a view-only executive simply has no path to a write.' },
  { icon: <ClipboardList size={18} />, title: 'Sensitive actions are on the record', body: 'Approvals, overrides, cost postings and stock adjustments append to an immutable audit log with before and after values, coded reasons and contiguous sequence numbers.' },
];

const FAQ = [
  { q: 'Is this a live product I can use today?', a: 'Reeve is in active development and the demo runs on a seeded dataset held in memory, which resets when the server restarts. The application logic — earned value, scheduling, RBAC, the audit trail — is real and covered by an automated test suite. Persistence to a production database is the next milestone.' },
  { q: 'Do I have to adopt all of it at once?', a: 'No. The modules share one spine but stand alone. Most operators start with facilities and estate, then add construction or short-let when there is a project or a portfolio that needs it.' },
  { q: 'Is the intelligence built on a language model?', a: 'Mostly no, deliberately. The commercial maths — earned value, critical path, leakage, pricing, FX — is deterministic and testable, so it gives the same answer every time. A language model is used only to phrase answers in the copilot, and it is grounded strictly on your records.' },
  { q: 'Does it work offline?', a: 'The field-capture surface does. It writes to the device first, holds photos in IndexedDB, and drains its queue when connectivity returns, resolving conflicts server-side. That matters on a site with no reliable signal.' },
  { q: 'How does it handle multiple currencies?', a: 'The books stay in naira. A foreign-denominated commitment posts in naira at the rate on the day, and its outstanding balance is revalued as the rate moves, so budgets stay stable while exposure stays visible.' },
  { q: 'Who is it built for?', a: `Reeve is built for ${brand.client} and for operators like them — Nigerian developers and estate managers who are running construction, facilities and residents at the same time, in naira, often with patchy connectivity.` },
];

/* --- page ------------------------------------------------------------------ */

export default function LandingPage() {
  return (
    <>
      <Hero />

      {/* How it works */}
      <Section id="platform" tinted>
        <Eyebrow>How it works</Eyebrow>
        <H2 >Develop, operate, occupy, invest — without switching systems</H2>
        <p className="mt-4 text-[15.5px] text-text-2 leading-relaxed max-w-[680px]">
          Most operators run a different tool for each phase, then spend the month reconciling them.
          Reeve keeps the whole lifecycle on one record, so a delay on site is already a cost variance
          and an investor update is already true.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5 mt-10">
          {LIFECYCLE.map((s) => (
            <Link key={s.phase} href={s.href} className="group rounded-2xl border border-border bg-app p-5 hover:border-border-2 transition-colors">
              <span className="w-10 h-10 rounded-xl grid place-items-center" style={{ background: 'var(--primary-weak)', color: 'var(--primary)' }}>{s.icon}</span>
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-3 mt-4">{s.phase}</div>
              <div className="text-[16px] font-semibold tracking-[-0.02em] mt-1">{s.title}</div>
              <p className="text-[13.5px] text-text-2 leading-relaxed mt-2">{s.body}</p>
              <span className="inline-flex items-center gap-1 text-[13px] font-medium mt-3.5" style={{ color: 'var(--primary)' }}>
                Open <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </Section>

      {/* Tiers */}
      <Section>
        <Eyebrow>From one building to a portfolio</Eyebrow>
        <H2>Start where you are. The system does not need replacing when you grow.</H2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5 mt-10">
          {TIERS.map((t) => (
            <div
              key={t.name}
              className="rounded-2xl border bg-surface p-6 flex flex-col"
              style={t.featured
                ? { borderColor: 'color-mix(in srgb, var(--primary) 45%, transparent)', boxShadow: 'var(--shadow)' }
                : { borderColor: 'var(--border)' }}
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: t.featured ? 'var(--primary)' : 'var(--text-3)' }}>{t.size}</div>
              <div className="text-[21px] font-normal tracking-[-0.025em] mt-2">{t.name}</div>
              <p className="text-[13.5px] text-text-2 leading-relaxed mt-3">{t.body}</p>
              <ul className="flex flex-col gap-2 mt-5">
                {t.points.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-[13.5px]">
                    <Check size={15} className="mt-0.5 flex-none" style={{ color: 'var(--primary)' }} />
                    <span className="text-text-2">{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      {/* Modules */}
      <Section id="modules" tinted>
        <Eyebrow>Everything under one roof</Eyebrow>
        <H2>Every module you need to run property, on one system of record</H2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 mt-10">
          {MODULE_GROUPS.map((g) => (
            <div key={g.title} className="rounded-2xl border border-border bg-app p-5">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-lg grid place-items-center flex-none" style={{ background: 'var(--primary-weak)', color: 'var(--primary)' }}>{g.icon}</span>
                <div className="text-[15px] font-semibold tracking-[-0.02em]">{g.title}</div>
              </div>
              <ul className="flex flex-col gap-2 mt-4">
                {g.items.map((i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px]">
                    <span className="w-1 h-1 rounded-full mt-[7px] flex-none" style={{ background: 'var(--text-3)' }} />
                    <span className="text-text-2 leading-relaxed">{i}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      {/* Intelligence */}
      <Section id="intelligence">
        <Eyebrow>Intelligence</Eyebrow>
        <H2>Answers you can check, not predictions you have to trust</H2>
        <p className="mt-4 text-[15.5px] text-text-2 leading-relaxed max-w-[700px]">
          The commercial maths is deterministic. It runs the same way every time, shows the evidence
          behind each figure, and can be verified by hand — which is what makes it safe to make a
          decision on.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5 mt-10">
          {ENGINES.map((e) => (
            <div key={e.title} className="rounded-2xl border border-border bg-surface p-5">
              <span className="w-9 h-9 rounded-xl grid place-items-center" style={{ background: 'var(--primary-weak)', color: 'var(--primary)' }}>{e.icon}</span>
              <div className="text-[14.5px] font-semibold tracking-[-0.02em] mt-3.5">{e.title}</div>
              <p className="text-[13px] text-text-2 leading-relaxed mt-1.5">{e.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Why — architecture in place of borrowed social proof */}
      <Section id="why" tinted>
        <Eyebrow>Why Reeve</Eyebrow>
        <H2>No customer logos yet. Here is what there is instead.</H2>
        <p className="mt-4 text-[15.5px] text-text-2 leading-relaxed max-w-[720px]">
          Reeve is new, so it has no testimonials to show you and will not borrow any. What it can
          show is how it is built — and for software that is going to hold your money and your
          records, that is the more useful thing to judge it on.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mt-10">
          {PILLARS.map((p) => (
            <div key={p.title} className="rounded-2xl border border-border bg-app p-6">
              <span className="w-11 h-11 rounded-xl grid place-items-center" style={{ background: 'var(--primary-weak)', color: 'var(--primary)' }}>{p.icon}</span>
              <div className="text-[17px] font-semibold tracking-[-0.02em] mt-4">{p.title}</div>
              <p className="text-[14px] text-text-2 leading-relaxed mt-2">{p.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Built for here */}
      <Section>
        <div className="rounded-3xl overflow-hidden p-8 md:p-12 text-white" style={{ background: 'linear-gradient(135deg,#0f1424 0%,#1b2340 55%,#26305a 100%)' }}>
          <div className="max-w-[720px]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">Built for here</div>
            <h2 className="text-[26px] md:text-[34px] font-normal tracking-[-0.03em] leading-[1.12] mt-3">
              Designed for how property actually runs in Nigeria
            </h2>
            <p className="text-[15px] text-white/75 leading-relaxed mt-4">
              Naira-native accounting in integer minor units so money never drifts. FX revaluation for
              the imported half of every build. Offline-first capture for sites without signal. WhatsApp
              as a first-class channel, because that is where residents and guests already are.
            </p>
            <div className="flex gap-2.5 flex-wrap mt-7">
              {['Naira-native', 'FX exposure', 'Offline-first', 'WhatsApp', 'Multi-tenant', 'Role-scoped'].map((t) => (
                <span key={t} className="h-8 px-3.5 rounded-full inline-flex items-center text-[12.5px] font-medium" style={{ background: 'rgba(255,255,255,.12)' }}>{t}</span>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* FAQ */}
      <Section id="faq" tinted>
        <Eyebrow>Questions</Eyebrow>
        <H2>Straight answers before you commit anything</H2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 mt-10">
          {FAQ.map((f) => (
            <details key={f.q} className="group border-b border-border py-4">
              <summary className="flex items-start justify-between gap-4 cursor-pointer list-none">
                <span className="text-[15px] font-medium tracking-[-0.01em]">{f.q}</span>
                <span className="w-6 h-6 rounded-full grid place-items-center flex-none mt-0.5 text-text-3 transition-transform group-open:rotate-45" style={{ background: 'var(--surface-2)' }}>+</span>
              </summary>
              <p className="text-[13.5px] text-text-2 leading-relaxed mt-3 pr-10">{f.a}</p>
            </details>
          ))}
        </div>
      </Section>

      {/* Close */}
      <Section>
        <div className="text-center max-w-[640px] mx-auto">
          <span className="w-14 h-14 rounded-2xl grid place-items-center mx-auto text-on-primary" style={{ background: 'var(--primary)' }}>
            <Building2 size={26} />
          </span>
          <h2 className="text-[30px] md:text-[40px] font-normal tracking-[-0.035em] leading-[1.06] mt-6">
            See it running on real data
          </h2>
          <p className="text-[15.5px] text-text-2 leading-relaxed mt-4">
            The demo opens on a seeded portfolio — two live builds, an estate in collections and a
            short-let book — with every module switched on. Nothing to install, nothing to sign up for.
          </p>
          <div className="mt-7 flex items-center justify-center gap-3 flex-wrap">
            <Link href="/dashboard" className="h-12 px-6 rounded-full inline-flex items-center gap-2 text-[15px] font-medium text-on-primary transition-transform hover:-translate-y-px" style={{ background: 'var(--primary)' }}>
              Open the live demo <ArrowRight size={16} />
            </Link>
            <Link href="/login" className="h-12 px-6 rounded-full inline-flex items-center gap-2 text-[15px] font-medium border border-border-2 bg-surface hover:bg-surface-2 transition-colors">
              Sign in as another role
            </Link>
          </div>
        </div>
      </Section>
    </>
  );
}
