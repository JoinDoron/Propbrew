import { PageHeader } from '@/components/ui/page-header';
import { requireCapability } from '@/server/guard';
import { REQUIREMENTS, AI_REQUIREMENTS, OPEN_QUESTIONS, PHASE_MAP } from '@/domain';
import { Card, CardHeader, StatusPill } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import { withDurableRead } from '@/server/data/durable-records';

/**
 * PRD traceability spine (§14 wants every metric reportable from the product;
 * §6.2 makes the Must set the MVP cut). One row per requirement, grouped by
 * delivery phase, with its MoSCoW priority and blocking open questions — the
 * cheapest defence during a five-business-day client review window.
 */
export default async function RequirementsPage() {
  return withDurableRead(async () => {
  await requireCapability('tenant_config');

  const all = [
    ...REQUIREMENTS.map((r) => ({ id: r.id, title: r.title, priority: r.priority, phase: r.phase, blockedBy: r.blockedBy, module: r.module })),
    ...AI_REQUIREMENTS.map((r) => ({ id: r.id, title: r.title, priority: r.priority, phase: r.phase, blockedBy: r.blockedBy, module: r.id.slice(0, 4) })),
  ];

  const priorityTone = (p: string) => (p === 'Must' ? 'danger' : p === 'Should' ? 'info' : 'muted');

  return (
    <div className="pb-page">
      <PageHeader title="Delivery & decisions" subtitle="Requirements, delivery phases and outstanding product decisions." />
      <PageTabs label="Delivery requirements sections" items={[
        {
          id: 'register', label: 'Requirements', content: <div className="flex flex-col gap-6 min-w-0"><Card padded={false}>
            <div className="p-6 pb-0">
              <CardHeader title="Requirements" subtitle={`${all.length} across four families — every screen traces back here`} />
            </div>
            <div className="pb-table-scroll" role="region" aria-label="Delivery requirements register" tabIndex={0}>
              <table className="pb-data-table">
                <thead>
                  <tr>
                    {['ID', 'Requirement', 'Module', 'Priority', 'Phase', 'Blocked by'].map((h) => (
                      <th scope="col" key={h} className="text-left text-[12px] font-semibold tracking-[0.06em] uppercase text-text-3 px-4 py-2.5 border-b border-border whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {all.map((r) => (
                    <tr key={r.id} className="hover:bg-surface-2 transition-colors">
                      <td className="px-4 py-2.5 border-b border-border"><span className="font-mono text-[14px] font-semibold">{r.id}</span></td>
                      <td className="px-4 py-2.5 border-b border-border text-[14px]">{r.title}</td>
                      <td className="px-4 py-2.5 border-b border-border text-[12px] text-text-3 whitespace-nowrap">{r.module}</td>
                      <td className="px-4 py-2.5 border-b border-border"><StatusPill status={r.priority} tone={priorityTone(r.priority)} /></td>
                      <td className="px-4 py-2.5 border-b border-border text-[14px]">{r.phase}</td>
                      <td className="px-4 py-2.5 border-b border-border">
                        {r.blockedBy.length ? (
                          <span className="text-[12px] font-mono text-warning">{r.blockedBy.join(', ')}</span>
                        ) : (
                          <span className="text-text-3">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card></div>
        },
        {
          id: 'phases', label: 'Delivery phases', content: <div className="flex flex-col gap-6 min-w-0"><div className="grid grid-cols-1 min-[560px]:grid-cols-3 gap-6">
            {([1, 2, 3] as const).map((phase) => {
              const items = all.filter((r) => r.phase === phase);
              const must = items.filter((r) => r.priority === 'Must').length;
              return (
                <div key={phase} className="pb-stat">
                  <div className="pb-stat-label">Phase {phase} · {PHASE_MAP[phase].label}</div>
                  <div className="pb-stat-value">{items.length}</div>
                  <div className="pb-stat-note">{PHASE_MAP[phase].weeks} · {must} Must</div>
                </div>
              );
            })}
          </div></div>
        },
        {
          id: 'decisions', label: 'Open decisions', content: <div className="flex flex-col gap-6 min-w-0"><Card padded={false}>
            <div className="p-6 pb-0">
              <CardHeader title="Open questions" subtitle={`${OPEN_QUESTIONS.length} decisions that block or shape the build (§17)`} />
            </div>
            <div className="p-6 pt-2 flex flex-col gap-2.5">
              {OPEN_QUESTIONS.map((q) => (
                <div key={q.id} className="flex gap-3 items-start border-b border-border pb-2.5 last:border-0">
                  <span className="font-mono text-[12px] font-bold text-primary flex-none mt-0.5">{q.id}</span>
                  <div className="min-w-0">
                    <div className="text-[14px] font-medium">{q.question}</div>
                    <div className="text-[12px] text-text-3 mt-0.5">
                      {q.owner} · by {q.neededBy}
                      {q.blocks.length > 0 && <> · blocks <span className="font-mono">{q.blocks.join(', ')}</span></>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card></div>
        }
      ]} />




    </div>
  );
  });
}
