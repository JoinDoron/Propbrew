import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { AnnouncementsWorkspace, type AnnRow } from '@/components/portal/announcements-workspace';

/** EM-04 (resident view, §7 V) — announcements to my audience. Read/unread is
 *  tracked per device; important notices (water/power/security/billing) pin to
 *  the top and can be acknowledged; search + unread filter + category icons make
 *  the feed scannable. */
export default async function ResidentAnnouncementsPage() {
  const { actor } = await requireCapability('announcements');
  const rows: AnnRow[] = repos.announcements.list(actor).items
    .filter((a) => a.sentAt)
    .map((a) => ({ id: a.id, title: a.title, body: a.body, audience: a.audience, sentAt: a.sentAt!, aiDrafted: a.aiDrafted, scope: a.scope }));

  return (
    <div className="max-w-[640px] mx-auto">
      <AnnouncementsWorkspace rows={rows} />
    </div>
  );
}
