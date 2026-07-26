import { requireCapability } from '@/server/guard';
import { AI_REQUIREMENTS } from '@/domain';
import { Card, CardHeader, KpiCard, StatusPill } from '@/components/ui';
import { Sparkles, Gauge, CircleDollarSign } from 'lucide-react';

/** AI-S-06 — AI architecture & guardrails console. Per-feature flags, benchmarks
 *  and per-tenant usage caps (§11.4: kill-switch per feature; usage billed to the
 *  client). The feature list is the live AI requirements registry. */
export default async function AiAdminPage() {
  await requireCapability('tenant_config');

  // Demo: Must/Should features enabled, Could features off (shadow).
  const features = AI_REQUIREMENTS.map((f) => ({
    ...f,
    enabled: f.priority !== 'Could',
    calls: f.priority === 'Should' ? 1240 : f.priority === 'Must' ? 3800 : 0,
  }));

  const enabled = features.filter((f) => f.enabled).length;
  const totalCalls = features.reduce((a, f) => a + f.calls, 0);

  return (
    <div className="max-w-[1100px] mx-auto flex flex-col gap-3.5">
      <div className="grid grid-cols-1 min-[560px]:grid-cols-3 gap-3.5">
        <KpiCard label="Features enabled" value={`${enabled} / ${features.length}`} icon={<Sparkles size={18} />} />
        <KpiCard label="Calls this month" value={totalCalls.toLocaleString()} delta="metered per tenant" positive icon={<Gauge size={18} />} iconBg="rgba(99,102,241,.15)" iconColor="#6366f1" />
        <KpiCard label="Est. usage cost" value="₦412k" delta="68% of cap" positive icon={<CircleDollarSign size={18} />} iconBg="rgba(245,159,11,.15)" iconColor="#f59e0b" />
      </div>

      <div className="rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-[12px] text-text-3">
        §11.4 release-blocking: tenant-scoped retrieval · provider abstraction with fallback · per-feature kill-switch ·
        prompt-injection defence · every suggestion review/approve/override. Usage billed to the client (§15).
      </div>

      <Card padded={false}>
        <div className="p-4 sm:p-[18px] pb-0">
          <CardHeader title="AI features" subtitle="Foundation-model + RAG capabilities and their guardrails" />
        </div>
        <div className="divide-y divide-border">
          {features.map((f) => (
            <div key={f.id} className="flex items-center gap-3 px-4 sm:px-[18px] py-3">
              <span className="font-mono text-[11px] text-text-3 w-16 flex-none">{f.id}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium">{f.title}</div>
                <div className="text-[11.5px] text-text-3 truncate">{f.benchmark}</div>
              </div>
              <StatusPill status={f.priority} tone={f.priority === 'Must' ? 'danger' : f.priority === 'Should' ? 'info' : 'muted'} />
              <span
                className={`inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-semibold ${f.enabled ? 'bg-[color:var(--tone-success)]/15 text-[color:var(--tone-success)]' : 'bg-surface-3 text-text-3'}`}
              >
                {f.enabled ? 'Enabled' : 'Shadow'}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
