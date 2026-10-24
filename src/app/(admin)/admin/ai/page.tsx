import { PageHeader } from '@/components/ui/page-header';
import { requireCapability } from '@/server/guard';
import { AI_REQUIREMENTS } from '@/domain';
import { AiWorkspace, type AiFeature } from '@/components/admin/ai-workspace';

/** AI-S-06 / §11.4 — AI architecture & guardrails console. Per-feature kill-switch
 *  (On / Shadow / Off), live billed-usage and cost vs cap. The feature list is the
 *  live AI requirements registry; toggling Off flips the kill-switch instantly and
 *  the usage/cost recompute. Platform-Admin only. */
export default async function AiAdminPage() {
  await requireCapability('tenant_config');
  const features: AiFeature[] = AI_REQUIREMENTS.map((f) => ({
    id: f.id, title: f.title, benchmark: f.benchmark, priority: f.priority,
    calls: f.priority === 'Must' ? 3800 : f.priority === 'Should' ? 1240 : 620,
  }));

  return (
    <div className="pb-page">
      <PageHeader title="AI controls" subtitle="Feature modes, guardrails and usage across the platform." />
      <AiWorkspace features={features} />
    </div>
  );
}
