import { requireCapability } from '@/server/guard';
import { effectiveLevel } from '@/lib/authz';
import { repos } from '@/server/data';
import { Button, Card, CardHeader } from '@/components/ui';
import { ReadOnlyChip, ScopeBanner } from '@/components/domain';
import { FileText, FolderOpen, Sparkles, Upload } from 'lucide-react';

/** EM-08 — document management (Should). Folder + audience control; every stored
 *  document is indexed for AI document intelligence (AI-S-03). */
export default async function DocumentsPage() {
  const { actor } = await requireCapability('announcements');
  const canMutate = ['F', 'M'].includes(effectiveLevel(actor, 'announcements'));
  const docs = repos.documents.list(actor).items;

  const folders = [...new Set(docs.map((d) => d.folder))];

  return (
    <div className="max-w-[1000px] mx-auto flex flex-col gap-3.5">
      <ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />
      <div className="flex items-center justify-between">
        <div className="text-[12px] text-text-3">{docs.length} documents · {docs.filter((d) => d.indexed).length} indexed for AI search</div>
        {canMutate ? <Button variant="primary" icon={<Upload size={16} />}>Upload</Button> : <ReadOnlyChip />}
      </div>

      {folders.map((folder) => (
        <Card key={folder} padded={false}>
          <div className="p-4 sm:p-[18px] pb-2 flex items-center gap-2">
            <FolderOpen size={16} className="text-text-3" />
            <CardHeader title={folder} />
          </div>
          <div className="divide-y divide-border">
            {docs.filter((d) => d.folder === folder).map((d) => (
              <div key={d.id} className="flex items-center gap-3 px-4 sm:px-[18px] py-2.5">
                <span className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center flex-none text-text-3">
                  <FileText size={15} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate">{d.name}</div>
                  <div className="text-[11.5px] text-text-3">Shared with {d.audience} · updated {d.updatedAt}</div>
                </div>
                {d.indexed && (
                  <span title="Indexed for AI document intelligence (AI-S-03)" className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-primary bg-primary-weak px-1.5 h-[20px] rounded">
                    <Sparkles size={10} /> AI
                  </span>
                )}
                <span className="text-[11.5px] text-text-3 font-mono w-16 text-right">{(d.sizeKb / 1024).toFixed(1)} MB</span>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
