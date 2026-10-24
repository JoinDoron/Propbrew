'use client';

import { useId, useRef, useState } from 'react';
import Link from 'next/link';
import { CloudOff, CloudUpload, Cloud, TriangleAlert, RefreshCw, WifiOff } from 'lucide-react';
import { toneVar } from '@/lib/status-tones';
import { queueStats, syncPosture, OP_LABEL, STATUS_TONE } from '@/domain/sync';
import { useOutbox, useOnline, useOutboxSync, useLegacyOutboxNotice, setForcedOffline, isForcedOffline } from '@/lib/offline/outbox';
import type { WorkspaceId } from '@/config/workspaces';

/**
 * The always-visible answer to "where is my data?". Mounted in the shell header
 * so a field user can see, from any screen, exactly how much work is still only
 * on this device. It also hosts the single drain loop for the app.
 */
export function SyncIndicator({ workspace, owner }: { workspace?: WorkspaceId; owner?: string }) {
  useOutboxSync(owner); // the app's one outbox drain loop
  const ops = useOutbox(owner);
  const legacy = useLegacyOutboxNotice();
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const popoverId = useId();
  const trigger = useRef<HTMLButtonElement>(null);

  const stats = queueStats(ops);
  const posture = legacy && stats.total === 0 ? { label: 'Recovery needed', tone: 'warn' as const, detail: 'An older device outbox is preserved separately and has not been sent.' } : syncPosture(stats, online);
  const unsent = ops.filter((o) => o.status !== 'synced');
  const badge = stats.pending + stats.conflicts;

  // Nothing to say and everything is normal — stay out of the way.
  if (online && badge === 0 && stats.sending === 0 && !legacy) {
    return <ForceToggle />;
  }

  const Icon = !online ? CloudOff : stats.conflicts > 0 ? TriangleAlert : stats.sending > 0 ? CloudUpload : Cloud;

  return (
    <div className="relative" onKeyDown={(event) => {
      if (event.key === 'Escape' && open) { setOpen(false); trigger.current?.focus(); }
    }}>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={posture.detail}
        aria-label={`Sync status: ${posture.label}. ${posture.detail}`}
        aria-expanded={open}
        aria-controls={popoverId}
        className="pb-icon-action relative border transition-colors"
        style={{ borderColor: `color-mix(in srgb, ${toneVar(posture.tone)} 40%, transparent)`, background: `color-mix(in srgb, ${toneVar(posture.tone)} 10%, transparent)`, color: toneVar(posture.tone) }}
      >
        <Icon size={17} aria-hidden="true" className={stats.sending > 0 ? 'animate-pulse' : undefined} />
        {badge > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-lg text-[10px] font-medium flex items-center justify-center border-2 border-surface text-[color:var(--on-primary)]" style={{ background: toneVar(posture.tone) }}>{badge}</span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[70]" onClick={() => setOpen(false)} />
          <div id={popoverId} role="region" aria-label="Offline capture and sync details" className="absolute right-0 top-[48px] z-[71] w-[min(340px,calc(100vw-24px))] max-[640px]:fixed max-[640px]:right-3 max-[640px]:top-[76px] bg-surface border border-border rounded-2xl shadow-float overflow-hidden animate-[tms-slideup_.16s_ease]">
            <div className="px-4 py-3 border-b border-border">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-medium" style={{ color: toneVar(posture.tone) }}>{posture.label}</span>
                {!online && <span className="text-[12px] px-2 min-h-6 inline-flex items-center rounded-md gap-1 bg-surface-2 text-text-3"><WifiOff size={12} aria-hidden="true" /> no signal</span>}
              </div>
              <p className="text-[12px] text-text-3 mt-1">{posture.detail}</p>
              {legacy && <p className="text-[12px] text-text-3 mt-1">An older device outbox is preserved separately. Its owner cannot be verified, so it will not be sent under this account. Contact your administrator to recover it.</p>}
              {stats.attachments > 0 && <p className="text-[12px] text-text-3 mt-1">{stats.attachments} photo{stats.attachments === 1 ? '' : 's'} held with them.</p>}
            </div>

            <div className="max-h-[260px] overflow-y-auto divide-y divide-border">
              {unsent.slice(0, 8).map((o) => (
                <div key={o.id} className="px-4 py-2.5">
                  <div className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full mt-1.5 flex-none" style={{ background: toneVar(STATUS_TONE[o.status]) }} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-medium break-words">{o.label}</div>
                      <div className="text-[12px] text-text-3 mt-1">{OP_LABEL[o.kind]} · captured {new Date(o.capturedISO).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}{o.attempts > 0 ? ` · ${o.attempts} attempt${o.attempts === 1 ? '' : 's'}` : ''}</div>
                      {o.error && <div className="text-[12px] mt-1 break-words" style={{ color: toneVar(STATUS_TONE[o.status]) }}>{o.error}</div>}
                    </div>
                  </div>
                </div>
              ))}
              {unsent.length === 0 && <div className="px-4 py-6 text-center text-[12px] text-text-3">Nothing waiting.</div>}
              {unsent.length > 8 && <div className="px-4 py-2 text-[12px] text-text-3">+{unsent.length - 8} more</div>}
            </div>

            <div className="px-4 py-2.5 border-t border-border flex flex-wrap items-center gap-2">
              {workspace === 'construction' ? <Link href="/construction/field" onClick={() => setOpen(false)} className="pb-action text-primary">Open field capture →</Link> : null}
              <span className="ml-auto text-[12px] text-text-3 inline-flex items-center gap-1"><RefreshCw size={12} aria-hidden="true" className={stats.sending ? 'animate-spin' : ''} /> auto-retry on</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Dev affordance: pull the plug on a wired machine to prove the offline path. */
function ForceToggle() {
  const [forced, setForced] = useState(() => (typeof window === 'undefined' ? false : isForcedOffline()));
  if (!forced) return null;
  return (
    <button
      type="button"
      onClick={() => { setForcedOffline(false); setForced(false); }}
      aria-label="Restore online mode"
      aria-pressed={forced}
      className="pb-action border"
      style={{ borderColor: 'color-mix(in srgb, var(--tone-warn) 40%, transparent)', color: toneVar('warn') }}
    >
      <WifiOff size={13} aria-hidden="true" /> offline
    </button>
  );
}
