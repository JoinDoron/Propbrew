import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { Card } from '@/components/ui';
import { EmptyState } from '@/components/ui';

/** EM-04 (resident view) — announcements shared to my audience (§7 V). */
export default async function ResidentAnnouncementsPage() {
  const { actor } = await requireCapability('announcements');
  const rows = repos.announcements.list(actor).items.filter((a) => a.sentAt);
  return (
    <div className="max-w-[760px] mx-auto flex flex-col gap-3">
      {rows.length === 0 && <EmptyState title="No announcements" description="Updates from your estate will appear here." />}
      {rows.map((a) => (
        <Card key={a.id}>
          <div className="text-[11.5px] text-text-3">{a.audience} · {new Date(a.sentAt!).toLocaleDateString('en-NG',{month:'short',day:'numeric'})}</div>
          <h3 className="text-[15px] font-semibold mt-1">{a.title}</h3>
          <p className="text-[13px] text-text-2 mt-1.5">{a.body}</p>
        </Card>
      ))}
    </div>
  );
}
