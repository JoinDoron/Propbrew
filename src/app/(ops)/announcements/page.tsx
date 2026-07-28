import { requireCapability } from '@/server/guard';
import { effectiveLevel } from '@/lib/authz';
import { repos } from '@/server/data';
import { CardHeader } from '@/components/ui';
import { ScopeBanner } from '@/components/domain';
import { AnnouncementsWorkspace } from '@/components/announcements/announcements-workspace';

/** EM-04 / AI-E-04 — announcements. An AI composer drafts from a topic (with a
 *  Nigerian-Pidgin translation), estimates audience reach across channels, and
 *  shows delivery/read analytics. AI-E-04 is enforced server-side: an AI-drafted
 *  send is blocked until a manager approves it. Scoped (§8.2); managers publish,
 *  others read. */
export default async function AnnouncementsPage() {
  const { actor } = await requireCapability('announcements');
  const canMutate = ['F', 'M'].includes(effectiveLevel(actor, 'announcements'));
  const rows = [...repos.announcements.list(actor).items];

  return (
    <div className="max-w-[1100px] mx-auto flex flex-col gap-3.5">
      <ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />
      <CardHeader title="Announcements" subtitle="AI composer with Pidgin translation, audience estimate and read analytics — manager approval before any AI send" />
      <AnnouncementsWorkspace rows={rows} canMutate={canMutate} />
    </div>
  );
}
