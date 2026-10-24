import { estateTargetOptions } from '@/server/reads/estate-target-options';
import { requireCapability } from '@/server/guard';
import { can } from '@/lib/authz';
import { repos } from '@/server/data';
import { PageHeader } from '@/components/ui/page-header';
import { ScopeBanner } from '@/components/domain';
import { AnnouncementsWorkspace } from '@/components/announcements/announcements-workspace';
import { withDurableRead } from '@/server/data/durable-records';

/** EM-04 / AI-E-04 — announcements. An AI composer drafts from a topic (with a
 *  Nigerian-Pidgin translation), estimates audience reach across channels, and
 *  shows delivery/read analytics. AI-E-04 is enforced server-side: an AI-drafted
 *  send is blocked until a manager approves it. Scoped (§8.2); managers publish,
 *  others read. */
export default async function AnnouncementsPage() {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('announcements', 'read', 'estate');
  const canMutate = can(actor, 'announcements', 'transition').allowed;
  const rows = [...repos.announcements.list(actor).items];

  return (
    <div className="pb-page">
      <PageHeader title="Announcements" subtitle="Resident notices, assisted draft previews and recorded engagement."
        scope={<ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />}
      />
      <AnnouncementsWorkspace estates={can(actor, 'announcements', 'transition').allowed ? estateTargetOptions(actor, 'announcements', 'transition') : []} rows={rows} canMutate={canMutate} />
    </div>
  );
  });
}
