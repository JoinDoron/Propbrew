'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FileSpreadsheet, TriangleAlert, Check, Upload, Info, Scale } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { parseBoq, boqReconciliation, fmtM } from '@/domain/construction';
import { importBoq } from '@/server/actions/construction';

export type BoqProject = { id: string; name: string; code: string; approvedBudgetMinor: number; existingCodes: string[] };

const naira = (m: number) => `₦${fmtM(m)}`;
const SAMPLE = `Code\tDescription\tCategory\tAmount
MAR-EXT\tExternal works & landscaping\tExternal\t145,000,000
MAR-LFT\tPassenger lifts (3 no.)\tServices\t₦210,000,000
MAR-FIT\tJoinery & fit-out\tFinishes\t96,500,000`;

export function BoqWorkspace({ projects, canMutate }: { projects: BoqProject[]; canMutate: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [text, setText] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const project = projects.find((p) => p.id === projectId);
  const parsed = useMemo(() => parseBoq(text, project?.existingCodes ?? []), [text, project]);
  const errors = parsed.issues.filter((i) => i.severity === 'error');
  const warnings = parsed.issues.filter((i) => i.severity === 'warning');
  const recon = boqReconciliation(parsed.totalMinor, project?.approvedBudgetMinor ?? 0);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3600); };

  const commit = () => {
    setError(null);
    start(async () => {
      const r = await importBoq(projectId, parsed.rows.map(({ code, name, category, budgetMinor }) => ({ code, name, category, budgetMinor })));
      if (!r.ok) { setError(r.error); return; }
      setText(''); router.refresh(); flash(`BOQ imported · ${r.ref}`);
    });
  };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-card" style={{ background: 'linear-gradient(135deg,#0a1410 0%,#132a20 55%,#1c4030 100%)' }}>
        <div className="relative flex items-center gap-2 flex-wrap">
          <span className="w-12 h-12 rounded-2xl grid place-items-center flex-none" style={{ background: 'rgba(255,255,255,.1)' }}><FileSpreadsheet size={22} /></span>
          <div className="min-w-0">
            <div className="text-[11px] text-white/70">BILL OF QUANTITIES · IMPORT</div>
            <div className="text-[20px] font-bold tracking-[-0.02em] leading-tight mt-0.5">Paste the BOQ, check it, then commit</div>
            <div className="text-[12.5px] text-white/75 mt-0.5">Bad lines are reported and excluded — never guessed at, because a mangled import corrupts every cost report downstream.</div>
          </div>
        </div>
      </div>

      <section className="bg-surface border border-border rounded-2xl shadow-card p-4 flex flex-col gap-3">
        <div className="grid grid-cols-1 min-[560px]:grid-cols-2 gap-2.5">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[.04em] text-text-3 mb-1">Project</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full h-9 px-2.5 rounded-lg border border-border-2 bg-surface text-[13px] outline-none focus:border-primary">
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.existingCodes.length} existing codes</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={() => setText(SAMPLE)} className="text-[11.5px] px-2.5 h-9 rounded-lg border border-border-2">Paste a sample</button>
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-[.04em] text-text-3 mb-1">Paste rows · code, description, category, amount</label>
          <textarea
            value={text} onChange={(e) => setText(e.target.value)}
            placeholder={'MAR-EXT\tExternal works\tExternal\t145,000,000'}
            className="w-full h-40 p-3 rounded-xl border border-border-2 bg-surface text-[12.5px] font-mono outline-none focus:border-primary resize-y"
          />
          <p className="text-[10.5px] text-text-3 mt-1">Tab- or comma-separated. A header row is skipped. ₦ signs and thousands separators are handled.</p>
        </div>
      </section>

      {text.trim() && (
        <>
          {/* Validation */}
          <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
            <Kpi label="Lines accepted" value={String(parsed.rows.length)} tone={parsed.rows.length ? 'success' : 'muted'} />
            <Kpi label="Errors" value={String(errors.length)} tone={errors.length ? 'danger' : 'success'} />
            <Kpi label="Warnings" value={String(warnings.length)} tone={warnings.length ? 'warn' : 'success'} />
            <Kpi label="BOQ total" value={naira(parsed.totalMinor)} tone="info" />
          </div>

          {project && parsed.rows.length > 0 && (
            <div className="rounded-xl border px-4 py-3 flex items-start gap-2" style={{ borderColor: `color-mix(in srgb, ${toneVar(recon.band)} 35%, transparent)`, background: `color-mix(in srgb, ${toneVar(recon.band)} 6%, transparent)` }}>
              <Scale size={14} className="mt-0.5 flex-none" style={{ color: toneVar(recon.band) }} />
              <div className="text-[12px]">
                <span className="font-semibold" style={{ color: toneVar(recon.band) }}>{recon.label}</span>
                <span className="text-text-2"> — this paste totals {naira(parsed.totalMinor)} against an approved budget of {naira(project.approvedBudgetMinor)} ({recon.deltaMinor >= 0 ? '+' : ''}{recon.pct}%).</span>
              </div>
            </div>
          )}

          {parsed.issues.length > 0 && (
            <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border text-[12.5px] font-semibold">Validation</div>
              <div className="divide-y divide-border max-h-[220px] overflow-y-auto">
                {parsed.issues.map((iss, i) => (
                  <div key={i} className="px-4 py-2 flex items-start gap-2">
                    <span className="text-[9.5px] font-semibold px-1.5 h-4 inline-flex items-center rounded-full flex-none mt-0.5 uppercase" style={{ background: `color-mix(in srgb, ${toneVar(iss.severity === 'error' ? 'danger' : 'warn')} 14%, transparent)`, color: toneVar(iss.severity === 'error' ? 'danger' : 'warn') }}>{iss.severity}</span>
                    <span className="text-[11.5px] text-text-2">Line {iss.line}: {iss.message}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Preview */}
          {parsed.rows.length > 0 && (
            <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border text-[12.5px] font-semibold">Preview · what will be written</div>
              <div className="w-full overflow-x-auto">
                <table className="w-full border-collapse text-sm min-w-[520px]">
                  <thead><tr>{['Code', 'Description', 'Category', 'Budget', ''].map((h, i) => <th key={h || i} className={`text-[10px] font-semibold uppercase text-text-3 px-4 py-2.5 border-b border-border ${i === 3 ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
                  <tbody>
                    {parsed.rows.map((r) => {
                      const isUpdate = project?.existingCodes.includes(r.code);
                      return (
                        <tr key={r.code} className="hover:bg-surface-2">
                          <td className="px-4 py-2 border-b border-border text-[12px] font-mono font-medium">{r.code}</td>
                          <td className="px-4 py-2 border-b border-border text-[12px]">{r.name}</td>
                          <td className="px-4 py-2 border-b border-border text-[11.5px] text-text-3">{r.category}</td>
                          <td className="px-4 py-2 border-b border-border text-[12px] font-mono text-right">{naira(r.budgetMinor)}</td>
                          <td className="px-4 py-2 border-b border-border text-right"><span className="text-[9.5px] font-semibold px-1.5 h-4 inline-flex items-center rounded-full" style={{ background: `color-mix(in srgb, ${toneVar(isUpdate ? 'warn' : 'success')} 14%, transparent)`, color: toneVar(isUpdate ? 'warn' : 'success') }}>{isUpdate ? 'update' : 'new'}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 border-t border-border flex items-center gap-2 flex-wrap">
                <span className="text-[11px] text-text-3 inline-flex items-start gap-1.5"><Info size={12} className="mt-px flex-none" /> Updating an existing code changes its BUDGET only — committed and actual are transaction history and are never overwritten by a spreadsheet.</span>
                {canMutate && <button onClick={commit} disabled={pending || errors.length > 0 || parsed.rows.length === 0} className="ml-auto text-[12.5px] px-4 h-10 rounded-xl bg-primary text-white font-medium disabled:opacity-40 inline-flex items-center gap-1.5"><Upload size={14} /> {pending ? 'Importing…' : `Import ${parsed.rows.length} line${parsed.rows.length === 1 ? '' : 's'}`}</button>}
              </div>
              {errors.length > 0 && <div className="px-4 pb-3 text-[11.5px] flex items-start gap-1.5" style={{ color: toneVar('danger') }}><TriangleAlert size={12} className="mt-px flex-none" /> Fix the {errors.length} error{errors.length === 1 ? '' : 's'} above before importing — nothing is written while any line is invalid.</div>}
              {error && <div className="px-4 pb-3 text-[12px] text-negative">{error}</div>}
            </section>
          )}
        </>
      )}

      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade inline-flex items-center gap-1.5"><Check size={14} /> {toast}</div>}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><div className="text-[11px] text-text-3 font-medium">{label}</div><div className="text-[17px] font-bold tracking-[-0.02em] leading-none mt-1.5" style={{ color: toneVar(tone) }}>{value}</div></div>;
}
