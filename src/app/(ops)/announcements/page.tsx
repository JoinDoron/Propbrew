import { requireCapability } from '@/server/guard';
import { effectiveLevel } from '@/lib/authz';
import { repos } from '@/server/data';
import { Button, Card, StatusPill } from '@/components/ui';
import { ReadOnlyChip, ScopeBanner } from '@/components/domain';
import { Megaphone, Sparkles } from 'lucide-react';

/** EM-04 — announcements. Delivery/read stats are visible to managers; AI-drafted
 *  sends carry a badge and (per EM-04) always need manager approval before send. */
export default async function AnnouncementsPage() {
  const { actor } = await requireCapability('announcements');
  const canMutate = ['F', 'M'].includes(effectiveLevel(actor, 'announcements'));
  const rows = repos.announcements.list(actor).items;

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-3.5">
      <ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />
      <div className="flex items-center justify-between">
        <div />
        {canMutate ? <Button variant="primary" icon={<Megaphone size={16} />}>New announcement</Button> : <ReadOnlyChip />}
      </div>

      <div className="grid grid-cols-1 min-[720px]:grid-cols-2 gap-3.5">
        {rows.map((a) => {
          const rate = a.delivered ? Math.round((a.read / a.delivered) * 100) : 0;
          return (
            <Card key={a.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusPill status={a.scope} tone="info" />
                  {a.aiDrafted && (
                    <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-primary bg-primary-weak px-1.5 h-[22px] rounded-md">
                      <Sparkles size={11} /> AI-drafted
                    </span>
                  )}
                </div>
                <span className="text-[11.5px] text-text-3">{a.sentAt ? 'Sent' : 'Draft'}</span>
              </div>
              <h3 className="text-[14.5px] font-semibold mt-2.5 tracking-[-0.01em]">{a.title}</h3>
              <p className="text-[13px] text-text-2 mt-1 line-clamp-2">{a.body}</p>
              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border text-[12px] text-text-3">
                <span>Audience · {a.audience}</span>
                {a.sentAt && <span className="ml-auto">{a.read}/{a.delivered} read · {rate}%</span>}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
