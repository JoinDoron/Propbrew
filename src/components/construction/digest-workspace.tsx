'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sparkles, FileText, TriangleAlert, Check, Link2, ShieldCheck } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { publishDigest } from '@/server/actions/construction';

export type DigestView = {
  projectId: string; projectName: string; code: string; weekOfISO: string;
  sections: { title: string; text: string; confidence: number; sources: { label: string; href: string }[] }[];
  coverageGaps: string[];
  deltas: { label: string; value: string; tone: Tone }[];
};

export function DigestWorkspace({ views, canMutate }: { views: DigestView[]; canMutate: boolean }) {
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const [pending, start] = useTransition();
  const [confirmed, setConfirmed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const v = views[idx];
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };
  if (!v) return <div className="text-[13px] text-text-3">No projects to report on.</div>;

  const publish = () => start(async () => { const r = await publishDigest(v.projectId); if (r.ok) { router.refresh(); flash(`Digest published for ${r.ref}`); } else flash(r.error); });

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-2 flex-wrap">
        {views.map((x, i) => (
          <button key={x.projectId} onClick={() => { setIdx(i); setConfirmed(false); }} className="text-[12px] px-3 h-9 rounded-xl border font-medium" style={i === idx ? { borderColor: 'transparent', background: `color-mix(in srgb, ${toneVar('progress')} 15%, transparent)`, color: toneVar('progress') } : { borderColor: 'var(--border-2)', background: 'var(--surface)' }}>{x.projectName}</button>
        ))}
      </div>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-card" style={{ background: 'linear-gradient(135deg,#0d0a1f 0%,#1d1440 55%,#2c1e5c 100%)' }}>
        <div className="relative flex items-center gap-2 flex-wrap">
          <span className="w-12 h-12 rounded-2xl grid place-items-center flex-none" style={{ background: 'rgba(255,255,255,.1)' }}><Sparkles size={22} /></span>
          <div className="min-w-0">
            <div className="text-[11px] text-white/70">WEEKLY DIGEST · {v.code} · week of {v.weekOfISO}</div>
            <div className="text-[20px] font-bold tracking-[-0.02em] leading-tight mt-0.5">{v.projectName}</div>
            <div className="text-[12.5px] text-white/75 mt-0.5">Compiled from approved records only · every claim links to its source</div>
          </div>
        </div>
      </div>

      {/* Week deltas */}
      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        {v.deltas.map((d) => (
          <div key={d.label} className="bg-surface border border-border rounded-2xl shadow-card p-3.5">
            <div className="text-[11px] text-text-3 font-medium">{d.label}</div>
            <div className="text-[17px] font-bold tracking-[-0.02em] leading-none mt-1.5" style={{ color: toneVar(d.tone) }}>{d.value}</div>
          </div>
        ))}
      </div>

      {/* Missing-field guard */}
      {v.coverageGaps.length > 0 && (
        <div className="rounded-xl border px-4 py-3" style={{ borderColor: 'color-mix(in srgb, var(--tone-warn) 35%, transparent)', background: 'color-mix(in srgb, var(--tone-warn) 6%, transparent)' }}>
          <div className="text-[12.5px] font-semibold mb-1 flex items-center gap-1.5" style={{ color: toneVar('warn') }}><TriangleAlert size={14} /> Confirm before publishing</div>
          <p className="text-[11.5px] text-text-2">There is no approved site report for <span className="font-medium">{v.coverageGaps.join(', ')}</span>. The digest reports this as a gap rather than filling it in.</p>
          {canMutate && !confirmed && <button onClick={() => setConfirmed(true)} className="mt-2 text-[11.5px] px-2.5 h-8 rounded-lg border border-border-2 bg-surface inline-flex items-center gap-1 font-medium"><Check size={12} /> I&apos;ve reviewed the gaps</button>}
          {confirmed && <div className="mt-2 text-[11.5px] inline-flex items-center gap-1" style={{ color: toneVar('success') }}><Check size={12} /> Gaps acknowledged</div>}
        </div>
      )}

      {/* Sections */}
      <div className="flex flex-col gap-2.5">
        {v.sections.map((s) => (
          <section key={s.title} className="bg-surface border border-border rounded-2xl shadow-card p-4">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <FileText size={14} className="text-text-3" />
              <span className="text-[13px] font-semibold">{s.title}</span>
              <span className="ml-auto text-[10px] font-semibold px-2 h-5 inline-flex items-center rounded-full" style={{ background: `color-mix(in srgb, ${toneVar(s.confidence >= 0.85 ? 'success' : s.confidence >= 0.6 ? 'warn' : 'muted')} 14%, transparent)`, color: toneVar(s.confidence >= 0.85 ? 'success' : s.confidence >= 0.6 ? 'warn' : 'muted') }}>{Math.round(s.confidence * 100)}% confidence</span>
            </div>
            <p className="text-[13px] text-text-2 leading-relaxed">{s.text}</p>
            {s.sources.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {s.sources.map((src, i) => (
                  <Link key={i} href={src.href} className="text-[10.5px] px-2 h-6 inline-flex items-center gap-1 rounded-full border border-border-2 text-text-3 hover:text-primary"><Link2 size={10} /> {src.label}</Link>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>

      {/* Publish */}
      <div className="bg-surface border border-border rounded-2xl shadow-card p-4 flex items-center gap-3 flex-wrap">
        <ShieldCheck size={16} style={{ color: toneVar('success') }} />
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-semibold">Human sign-off required</div>
          <div className="text-[11px] text-text-3">Nothing is sent until you publish. The digest never auto-transacts and never writes prose it cannot source.</div>
        </div>
        {canMutate && <button disabled={pending || (v.coverageGaps.length > 0 && !confirmed)} onClick={publish} className="text-[12px] px-4 h-9 rounded-xl bg-primary text-white font-medium disabled:opacity-40 flex-none">{pending ? 'Publishing…' : 'Publish digest'}</button>}
      </div>

      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}
