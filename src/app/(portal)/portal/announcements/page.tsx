import { PageHeader } from '@/components/ui/page-header';
import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { AnnouncementsWorkspace, type AnnRow } from '@/components/portal/announcements-workspace';
import { withDurableRead } from '@/server/data/durable-records';

/** EM-04 (resident view, §7 V) — announcements to my audience. Read/unread is
 *  tracked per device; important notices (water/power/security/billing) pin to
 *  the top and can be acknowledged; search + unread filter + category icons make
 *  the feed scannable. */
export default async function ResidentAnnouncementsPage() {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('announcements');
  const rows: AnnRow[] = repos.announcements.list(actor).items
    .filter((a) => a.sentAt)
    .map((a) => ({ id: a.id, title: a.title, body: a.body, audience: a.audience, sentAt: a.sentAt!, aiDrafted: a.aiDrafted, scope: a.scope }));

  return (
    <div className="pb-page">
      <PageHeader title="Announcements" subtitle="Updates and notices for your estate." />
      <div className="w-full min-w-0 flex flex-col gap-6">
      <AnnouncementsWorkspace key={JSON.stringify([actor.tenantId, actor.userId])} rows={rows} storageKey={`propbrew:notice-read:v1:${JSON.stringify([actor.tenantId, actor.userId])}`} />
      </div>
    </div>
  );
  });
}
