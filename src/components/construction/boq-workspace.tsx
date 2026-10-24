'use client';

import styles from './construction-commercial-polish.module.css';

import { useConstructionReview, ConstructionSummary, ConstructionPanel, ConstructionToast, ConstructionKpi as Kpi, constructionNaira as naira, ConstructionFrame, ConstructionPanelHeader, ConstructionEmpty } from './construction-ui';
import { Button, CardHeader, StatusPill } from '@/components/ui';

import { useId, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileSpreadsheet, TriangleAlert, Check, Upload, Info, Scale } from 'lucide-react';
import { toneVar } from '@/lib/status-tones';
import { parseBoq, boqReconciliation } from '@/domain/construction';
import { importBoq } from '@/server/actions/construction';
import { PageTabs } from '@/components/ui/page-tabs';

export type BoqProject = { id: string; name: string; code: string; approvedBudgetMinor: number; existingCodes: string[] };

const SAMPLE = `Code\tDescription\tCategory\tAmount
MAR-EXT\tExternal works & landscaping\tExternal\t145,000,000
MAR-LFT\tPassenger lifts (3 no.)\tServices\t₦210,000,000
MAR-FIT\tJoinery & fit-out\tFinishes\t96,500,000`;

export function BoqWorkspace({ projects, canMutate }: { projects: BoqProject[]; canMutate: boolean }) {
  const fieldId = useId();
  const router = useRouter();
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [text, setText] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const project = projects.find((p) => p.id === projectId);
  const parsed = useMemo(() => parseBoq(text, project?.existingCodes ?? []), [text, project]);
  const errors = parsed.issues.filter((i) => i.severity === 'error');
  const warnings = parsed.issues.filter((i) => i.severity === 'warning');
  const recon = boqReconciliation(parsed.totalMinor, project?.approvedBudgetMinor ?? 0);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3600); };
  const { act, confirmation, pending } = useConstructionReview(() => router.refresh(), flash);

  const commit = () => {
    if (!canMutate || pending || errors.length || !project || !parsed.rows.length) return;
    act(async () => {
      const result = await importBoq(projectId, parsed.rows.map(({ code, name, category, budgetMinor }) => ({ code, name, category, budgetMinor })));
      if (result.ok) setText('');
      return result;
    }, `Import ${parsed.rows.length} BOQ lines for ${project.name}`, `The validated total is ${naira(parsed.totalMinor)}. Existing code budgets will change; committed and actual transaction history is retained.`);
  };

  return (
    <ConstructionFrame><div className={styles.workspace}>
      <ConstructionSummary>
        <div className="relative flex items-center gap-2 flex-wrap">
          <span className="construction-summary-icon" ><FileSpreadsheet size={22} /></span>
          <div className="min-w-0">
            <div className="text-[14px] text-text-3">BILL OF QUANTITIES · IMPORT</div>
            <h2 className="text-[20px] font-medium tracking-[-0.02em] leading-tight mt-0.5">Paste the BOQ, check it, then commit</h2>
            <div className="text-[14px] text-text-3 mt-0.5">Bad lines are reported and excluded — never guessed at, because a mangled import corrupts every cost report downstream.</div>
          </div>
        </div>
      </ConstructionSummary>

      <PageTabs label="BOQ import sections" items={[
        {
          id: 'capture', label: 'Capture BOQ', content: <div className="pb-section">
            <ConstructionPanel>
              <div className={styles.header}><CardHeader title="Capture a bill of quantities" subtitle="Paste and validate locally before any reviewed import · all amounts in NGN" /></div><div className={`${styles.body} ${styles.stack}`}>
              <div className={styles.formGrid}>
                <div>
                  <label htmlFor={`${fieldId}-project`} className="pb-form-label">Project</label>
                  <select id={`${fieldId}-project`} aria-label="Project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className={styles.control} disabled={!projects.length}>
                    {!projects.length && <option value="">No projects in your scope</option>}
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.existingCodes.length} existing codes</option>)}
                  </select>
                </div>
                <div className="flex items-end">
                  <Button type="button" onClick={() => setText(SAMPLE)} >Paste a sample</Button>
                </div>
              </div>

              <div>
                  <label htmlFor={`${fieldId}-rows`} className="pb-form-label">Paste rows · code, description, category, amount</label>
                <textarea id={`${fieldId}-rows`} aria-label="Paste rows · code, description, category, amount"
                  value={text} onChange={(e) => setText(e.target.value)}
                  placeholder={'MAR-EXT\tExternal works\tExternal\t145,000,000'}
                  className="pb-form-control w-full h-40 p-3 rounded-xl border border-border-2 bg-surface text-[14px] font-mono outline-none focus:border-primary resize-y"
                />
                <p className={`${styles.metadata} mt-3`}>Tab- or comma-separated. A header row is skipped. ₦ signs and thousands separators are handled. Sample rows are illustrative; replace them with the approved project BOQ before importing.</p>
              </div>
              </div>
            </ConstructionPanel>
          </div>
        },
        {
          id: 'preview', label: 'Validation & preview', content: <div className="pb-section">
            {!text.trim() && <ConstructionEmpty title="No BOQ captured for validation" description="Capture a BOQ in the Capture BOQ tab to review its validation and exact NGN import preview here. Nothing has been imported." />}
            {text.trim() && (
              <>
                {/* Validation */}
                <div className="grid grid-cols-1 min-[520px]:grid-cols-2 min-[1100px]:grid-cols-4 gap-6">
                  <Kpi label="Lines accepted" value={String(parsed.rows.length)} tone={parsed.rows.length ? 'success' : 'muted'} />
                  <Kpi label="Errors" value={String(errors.length)} tone={errors.length ? 'danger' : 'success'} />
                  <Kpi label="Warnings" value={String(warnings.length)} tone={warnings.length ? 'warn' : 'success'} />
                  <Kpi label="BOQ total" value={naira(parsed.totalMinor)} tone="info" />
                </div>

                {project && parsed.rows.length > 0 && (
                  <div className="rounded-xl border px-6 py-4 flex items-start gap-2" style={{ borderColor: `color-mix(in srgb, ${toneVar(recon.band)} 35%, transparent)`, background: `color-mix(in srgb, ${toneVar(recon.band)} 6%, transparent)` }}>
                    <Scale size={14} className="mt-0.5 flex-none" style={{ color: toneVar(recon.band) }} />
                    <div className={styles.text}>
                      <span className="font-medium" style={{ color: toneVar(recon.band) }}>{recon.label}</span>
                      <span className="text-text-2"> — this paste totals {naira(parsed.totalMinor)} against an approved budget of {naira(project.approvedBudgetMinor)} ({recon.deltaMinor >= 0 ? '+' : ''}{recon.pct}%).</span>
                      <dl className={styles.facts}><div><dt>Project code</dt><dd>{project.code}</dd></div><div><dt>Validated total</dt><dd>{naira(parsed.totalMinor)}</dd></div><div><dt>Approved budget</dt><dd>{naira(project.approvedBudgetMinor)}</dd></div><div><dt>Difference</dt><dd>{recon.deltaMinor >= 0 ? '+' : '−'}{naira(Math.abs(recon.deltaMinor))}</dd></div></dl>
                    </div>
                  </div>
                )}

                {parsed.issues.length > 0 && (
                  <ConstructionPanel >
                    <ConstructionPanelHeader title="Validation"></ConstructionPanelHeader>
                    <div role="region" tabIndex={0} aria-label="BOQ validation issues" className={styles.scroll}><ul className={styles.list}>
                      {parsed.issues.map((iss, i) => (
                        <li key={i} className={styles.row}>
                          <StatusPill status={iss.severity} tone={iss.severity === 'error' ? 'danger' : 'warn'} />
                          <span className="text-[14px] text-text-2">Line {iss.line}: {iss.message}</span>
                        </li>
                      ))}
                    </ul></div>
                  </ConstructionPanel>
                )}

                {/* Preview */}
                {parsed.rows.length > 0 && (
                  <ConstructionPanel className="pb-table-frame">
                    <ConstructionPanelHeader title="Preview · what will be written"></ConstructionPanelHeader>
                    <div role="region" tabIndex={0} aria-label="Bill of quantities import preview · scroll horizontally" className={styles.scroll}>
                      <table aria-label="Bill of quantities import preview" className={`pb-data-table ${styles.table}`}>
                        <thead><tr>{['Code', 'Description', 'Category', 'Budget', 'Change'].map((h, i) => <th scope="col" key={h || i} className={`text-[12px] font-medium uppercase text-text-3 px-6 py-4 border-b border-border ${i === 3 ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
                        <tbody>
                          {parsed.rows.map((r) => {
                            const isUpdate = project?.existingCodes.includes(r.code);
                            return (
                              <tr key={r.code} className="hover:bg-surface-2">
                                <th scope="row" className="font-mono">{r.code}</th>
                                <td className="px-4 py-2 border-b border-border text-[12px]">{r.name}</td>
                                <td className="px-4 py-2 border-b border-border text-[14px] text-text-3">{r.category}</td>
                                <td className={styles.numeric}>{naira(r.budgetMinor)}</td>
                                <td className="px-4 py-2 border-b border-border text-right"><span className="text-[12px] font-semibold px-1.5 min-h-6 inline-flex items-center rounded-full" style={{ background: `color-mix(in srgb, ${toneVar(isUpdate ? 'warn' : 'success')} 14%, transparent)`, color: toneVar(isUpdate ? 'warn' : 'success') }}>{isUpdate ? 'update' : 'new'}</span></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="px-6 py-4 border-t border-border flex items-center gap-2 flex-wrap">
                      <span className="text-[14px] text-text-3 inline-flex items-start gap-1.5"><Info size={12} className="mt-px flex-none" /> Updating an existing code changes its BUDGET only — committed and actual are transaction history and are never overwritten by a spreadsheet.</span>
                      {canMutate && <Button variant="primary" type="button" onClick={commit} disabled={pending || errors.length > 0 || parsed.rows.length === 0} className="ml-auto"><Upload size={14} /> {pending ? 'Importing…' : `Import ${parsed.rows.length} line${parsed.rows.length === 1 ? '' : 's'}`}</Button>}
                    </div>
                    {errors.length > 0 && <div className="px-4 pb-3 text-[14px] flex items-start gap-1.5" style={{ color: toneVar('danger') }}><TriangleAlert size={12} className="mt-px flex-none" /> Fix the {errors.length} error{errors.length === 1 ? '' : 's'} above before importing — nothing is written while any line is invalid.</div>}
                  </ConstructionPanel>
                )}
              </>
            )}
          </div>
        }
      ]} />

      {confirmation}
      {toast && <ConstructionToast><Check size={14} /> {toast}</ConstructionToast>}
    </div></ConstructionFrame>
  );
}
