'use client';

import { useState } from 'react';
import { CalendarClock, Check, Clock, HardHat, FileText, Download, ChevronDown } from 'lucide-react';
import type { InvestorProject } from '@/domain/entities';
import { constructionProgress, handoverCountdown } from '@/domain/investor-portal';
import { NOW_MS } from '@/domain/ppm';
import { toneVar } from '@/lib/status-tones';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function monthLabel(iso: string): string { const [y, m] = iso.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; }
function isoAddMonths(iso: string, n: number): string { const [y, m] = iso.split('-').map(Number); const t = y * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-01`; }

const DOCS = [
  { name: 'Allocation letter', kind: 'Ownership' },
  { name: 'Sale & Purchase Agreement', kind: 'Contract' },
  { name: 'Payment receipts', kind: 'Finance' },
  { name: 'Latest construction report', kind: 'Progress' },
];

export function InvestorUpdatesWorkspace({ projects }: { projects: InvestorProject[] }) {
  const [openId, setOpenId] = useState<string | null>(projects[0]?.id ?? null);
  return (
    <div className="flex flex-col gap-3">
      {projects.map((p) => (
        <ProjectUpdates key={p.id} project={p} open={openId === p.id} onToggle={() => setOpenId(openId === p.id ? null : p.id)} />
      ))}
    </div>
  );
}

function ProjectUpdates({ project: p, open, onToggle }: { project: InvestorProject; open: boolean; onToggle: () => void }) {
  const cp = constructionProgress(p);
  const hc = handoverCountdown(p.handoverDate, NOW_MS);
  const handoverISO = p.handoverDate.slice(0, 7) + '-01';

  // A construction feed: reached milestones, newest first, dated back from handover.
  const feed = cp.milestones
    .filter((m) => m.state !== 'upcoming')
    .map((m) => ({ label: m.label, done: m.state === 'done', when: monthLabel(isoAddMonths(handoverISO, -Math.round(((100 - m.threshold) / 100) * 24))) }))
    .reverse();

  function download(name: string) {
    const text = `VESTA — ${name.toUpperCase()}\n\nProject: ${p.name}\nLocation: ${p.location}\nStatus: ${p.status}\nConstruction: ${cp.pct}%\nHandover: ${monthLabel(handoverISO)}\n\n(Demo document.)`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a'); a.href = url; a.download = `${p.name.split(' (')[0]}-${name}.txt`.replace(/\s+/g, '-'); a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors text-left">
        <span className="w-10 h-10 rounded-xl bg-primary-weak text-primary grid place-items-center flex-none"><HardHat size={18} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold truncate">{p.name.split(' (')[0]}</div>
          <div className="text-[11.5px] text-text-3 flex items-center gap-1"><CalendarClock size={11} /> {cp.pct}% built · handover in {hc.label}</div>
        </div>
        <ChevronDown size={17} className={`text-text-3 flex-none transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 animate-fade">
          {/* progress */}
          <div className="h-2 rounded-full bg-surface-3 overflow-hidden mb-3"><div className="h-full rounded-full bg-primary" style={{ width: `${cp.pct}%` }} /></div>

          {/* feed */}
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-text-3 mb-2">Construction updates</div>
          <div className="flex flex-col gap-0">
            {feed.map((u, i) => (
              <div key={u.label} className="flex gap-2.5">
                <div className="flex flex-col items-center">
                  <span className={`w-5 h-5 rounded-full grid place-items-center flex-none ${u.done ? 'bg-success text-white' : 'bg-primary text-white'}`}>{u.done ? <Check size={11} /> : <Clock size={11} />}</span>
                  {i < feed.length - 1 && <span className="w-0.5 flex-1 my-0.5" style={{ background: 'var(--surface-3)' }} />}
                </div>
                <div className="pb-3 min-w-0">
                  <div className="text-[13px] font-medium">{u.done ? `${u.label} completed` : `${u.label} underway`}</div>
                  <div className="text-[11px] text-text-3">{u.when}</div>
                </div>
              </div>
            ))}
          </div>

          {/* documents */}
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-text-3 mb-2 mt-1">Documents</div>
          <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {DOCS.map((d) => (
              <button key={d.name} onClick={() => download(d.name)} className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-surface-2 transition-colors text-left">
                <span className="w-7 h-7 rounded-lg grid place-items-center flex-none" style={{ background: `color-mix(in srgb, ${toneVar('info')} 12%, transparent)`, color: toneVar('info') }}><FileText size={14} /></span>
                <div className="min-w-0 flex-1"><div className="text-[12.5px] font-medium truncate">{d.name}</div><div className="text-[10.5px] text-text-3">{d.kind}</div></div>
                <Download size={15} className="text-text-3 flex-none" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
