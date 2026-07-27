'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, MessageSquare, Send } from 'lucide-react';
import { IconButton, Avatar } from '@/components/ui';
import { Popover } from './popover';
import { readThread, sendMessage } from '@/server/actions/inbox';
import type { Thread } from '@/server/data/inbox';

export function MessagesMenu({ threads, unread }: { threads: Thread[]; unread: number }) {
  const router = useRouter();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [, start] = useTransition();

  const active = threads.find((t) => t.id === activeId) ?? null;
  const unreadFor = (t: Thread) => t.messages.slice(t.lastReadSeq).filter((m) => !m.mine).length;

  const open = (id: string) => {
    setActiveId(id);
    start(async () => { await readThread(id); router.refresh(); });
  };

  const send = () => {
    const text = draft.trim();
    if (!text || !active) return;
    setDraft('');
    start(async () => { await sendMessage(active.id, text); router.refresh(); });
  };

  return (
    <Popover
      width={380}
      trigger={({ toggle }) => (
        <IconButton title="Messages" aria-label={`Messages${unread ? `, ${unread} unread` : ''}`} onClick={() => { setActiveId(null); toggle(); }}>
          <MessageSquare size={17} />
          {unread > 0 && (
            <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-lg bg-[#ef4444] text-white text-[10px] font-bold flex items-center justify-center border-2 border-surface">
              {unread}
            </span>
          )}
        </IconButton>
      )}
    >
      {() =>
        !active ? (
          <div>
            <div className="flex items-center px-4 h-12 border-b border-border">
              <span className="text-[13.5px] font-semibold">Messages</span>
            </div>
            <div className="max-h-[380px] overflow-y-auto">
              {threads.length === 0 && <div className="p-6 text-center text-[13px] text-text-3">No conversations yet.</div>}
              {threads.map((t) => {
                const u = unreadFor(t);
                const last = t.messages[t.messages.length - 1];
                return (
                  <button key={t.id} onClick={() => open(t.id)} className="flex gap-3 w-full text-left px-4 py-3 border-b border-border last:border-0 hover:bg-surface-2 transition-colors">
                    <Avatar name={t.withName} size={34} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold truncate">{t.withName}</span>
                        {u > 0 && <span className="ml-auto min-w-[16px] h-4 px-1 rounded-lg bg-primary text-white text-[10px] font-bold flex items-center justify-center flex-none">{u}</span>}
                      </div>
                      <div className="text-[12px] text-text-3 truncate">{last ? `${last.mine ? 'You: ' : ''}${last.text}` : t.subject}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-[420px]">
            <div className="flex items-center gap-2 px-3 h-12 border-b border-border flex-none">
              <IconButton bordered={false} onClick={() => setActiveId(null)} title="Back" aria-label="Back" className="!w-8 !h-8">
                <ArrowLeft size={16} />
              </IconButton>
              <Avatar name={active.withName} size={28} />
              <div className="min-w-0">
                <div className="text-[13px] font-semibold truncate leading-tight">{active.withName}</div>
                <div className="text-[11px] text-text-3 truncate">{active.subject}</div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
              {active.messages.map((m, i) => (
                <div key={i} className={`max-w-[80%] px-3 py-2 rounded-2xl text-[12.5px] leading-snug ${m.mine ? 'self-end bg-primary text-white rounded-br-md' : 'self-start bg-surface-2 text-text rounded-bl-md'}`}>
                  {m.text}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 p-2.5 border-t border-border flex-none">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder="Message…"
                className="flex-1 h-9 px-3 rounded-lg border border-border bg-surface-2 text-[13px] outline-none focus:border-primary transition-colors"
              />
              <IconButton onClick={send} title="Send" aria-label="Send" className="!w-9 !h-9">
                <Send size={16} />
              </IconButton>
            </div>
          </div>
        )
      }
    </Popover>
  );
}
