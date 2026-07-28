'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, Droplet, Zap, Shield, Receipt, CalendarDays, Megaphone, Pin, Check, CheckCheck, Sparkles } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';

export type AnnRow = { id: string; title: string; body: string; audience: string; sentAt: string; aiDrafted: boolean; scope: string };

const STORAGE_KEY = 'vesta_read_announcements';

type Cat = { icon: React.ReactNode; tone: Tone; label: string };
function categorize(title: string, body: string): Cat & { important: boolean } {
  const t = `${title} ${body}`.toLowerCase();
  if (/water|borehole|pump|supply/.test(t)) return { icon: <Droplet size={15} />, tone: 'info', label: 'Water', important: true };
  if (/power|light|electric|generator|outage|grid/.test(t)) return { icon: <Zap size={15} />, tone: 'warn', label: 'Power', important: true };
  if (/security|safety|gate|intruder|emergency|patrol/.test(t)) return { icon: <Shield size={15} />, tone: 'danger', label: 'Security', important: true };
  if (/charge|invoice|payment|due|levy|arrears|bill/.test(t)) return { icon: <Receipt size={15} />, tone: 'progress', label: 'Billing', important: true };
  if (/event|meeting|agm|party|festiv|amenity|pool|gym|club|reopen/.test(t)) return { icon: <CalendarDays size={15} />, tone: 'success', label: 'Community', important: false };
  return { icon: <Megaphone size={15} />, tone: 'neutral', label: 'Notice', important: false };
}

export function AnnouncementsWorkspace({ rows }: { rows: AnnRow[] }) {
  const [read, setRead] = useState<Set<string>>(new Set());
  const [acked, setAcked] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    // Hydrate read-state from this device after mount (localStorage is client-only).
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setRead(new Set(JSON.parse(raw)));
    } catch { /* ignore */ }
  }, []);
  const persist = (next: Set<string>) => { setRead(next); try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...next])); } catch { /* ignore */ } };
  const markRead = (id: string) => { if (read.has(id)) return; persist(new Set(read).add(id)); };
  const markAll = () => persist(new Set(rows.map((r) => r.id)));

  const enriched = useMemo(() => rows.map((r) => ({ ...r, cat: categorize(r.title, r.body) })), [rows]);
  const unreadCount = enriched.filter((r) => !read.has(r.id)).length;

  const filtered = useMemo(() => {
    let v = enriched;
    if (tab === 'unread') v = v.filter((r) => !read.has(r.id));
    if (q.trim()) { const s = q.toLowerCase(); v = v.filter((r) => `${r.title} ${r.body}`.toLowerCase().includes(s)); }
    // pinned (important + unread) first, then by date
    return [...v].sort((a, b) => {
      const pa = a.cat.important && !read.has(a.id) ? 1 : 0;
      const pb = b.cat.important && !read.has(b.id) ? 1 : 0;
      return pb - pa || (a.sentAt < b.sentAt ? 1 : -1);
    });
  }, [enriched, tab, q, read]);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-2">
        <div className="flex gap-1.5">
          <button onClick={() => setTab('all')} className={`h-8 px-3 rounded-full text-[12.5px] font-medium border ${tab === 'all' ? 'border-primary bg-primary-weak text-primary' : 'border-border-2 bg-surface text-text-2'}`}>All</button>
          <button onClick={() => setTab('unread')} className={`h-8 px-3 rounded-full text-[12.5px] font-medium border inline-flex items-center gap-1.5 ${tab === 'unread' ? 'border-primary bg-primary-weak text-primary' : 'border-border-2 bg-surface text-text-2'}`}>Unread {unreadCount > 0 && <span className="min-w-[16px] h-4 px-1 rounded-full bg-primary text-white text-[10px] grid place-items-center">{unreadCount}</span>}</button>
        </div>
        {unreadCount > 0 && <button onClick={markAll} className="ml-auto text-[12px] text-primary hover:underline inline-flex items-center gap-1"><CheckCheck size={14} /> Mark all read</button>}
      </div>

      <div className="flex items-center gap-2 h-9 px-3 rounded-xl border border-border-2 bg-surface">
        <Search size={15} className="text-text-3" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search announcements…" className="flex-1 bg-transparent outline-none text-[13px]" aria-label="Search announcements" />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-14 border border-dashed border-border rounded-2xl">
          <Megaphone size={26} className="mx-auto text-text-3 mb-2" />
          <p className="text-[13.5px] font-medium">{tab === 'unread' ? 'You’re all caught up' : 'No announcements'}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((r) => {
            const isRead = read.has(r.id);
            const isOpen = open === r.id;
            const pinned = r.cat.important && !isRead;
            return (
              <div key={r.id} onClick={() => { markRead(r.id); setOpen(isOpen ? null : r.id); }} className={`rounded-2xl border shadow-card p-4 cursor-pointer transition-colors ${isRead ? 'bg-surface border-border' : 'bg-primary/[0.03] border-primary/25'}`}>
                <div className="flex items-start gap-3">
                  <span className="w-9 h-9 rounded-xl grid place-items-center flex-none" style={{ background: `color-mix(in srgb, ${toneVar(r.cat.tone)} 14%, transparent)`, color: toneVar(r.cat.tone) }}>{r.cat.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {pinned && <span className="inline-flex items-center gap-0.5 text-[9.5px] font-bold uppercase text-warning"><Pin size={9} /> Pinned</span>}
                      <span className="text-[10px] font-semibold" style={{ color: toneVar(r.cat.tone) }}>{r.cat.label}</span>
                      {r.aiDrafted && <span className="inline-flex items-center gap-0.5 text-[9.5px] text-text-3"><Sparkles size={9} /> AI</span>}
                      <span className="text-[11px] text-text-3 ml-auto">{new Date(r.sentAt).toLocaleDateString('en-NG', { month: 'short', day: 'numeric' })}</span>
                      {!isRead && <span className="w-2 h-2 rounded-full bg-primary flex-none" />}
                    </div>
                    <h3 className="text-[14px] font-semibold mt-0.5">{r.title}</h3>
                    <p className={`text-[12.5px] text-text-2 mt-1 ${isOpen ? '' : 'line-clamp-2'}`}>{r.body}</p>
                    {isOpen && r.cat.important && (
                      <div className="mt-2.5 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {acked.has(r.id) ? (
                          <span className="text-[12px] text-positive inline-flex items-center gap-1"><Check size={14} /> Acknowledged</span>
                        ) : (
                          <button onClick={() => setAcked((s) => new Set(s).add(r.id))} className="h-8 px-3 rounded-lg bg-primary text-white text-[12px] font-medium inline-flex items-center gap-1.5"><Check size={13} /> Acknowledge</button>
                        )}
                        <span className="text-[11px] text-text-3">Let management know you’ve seen this</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
