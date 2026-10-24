'use client';

import layout from '@/components/ui/workspace-layout.module.css';
import { Button, Card, CardHeader, EmptyState, StatusPill } from '@/components/ui';

import { PageTabs } from '@/components/ui/page-tabs';
import { useEffect, useMemo, useState } from 'react';
import { Search, Droplet, Zap, Shield, Receipt, CalendarDays, Megaphone, Pin, Check, CheckCheck, Sparkles } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';

export type AnnRow = { id: string; title: string; body: string; audience: string; sentAt: string; aiDrafted: boolean; scope: string };


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

export function AnnouncementsWorkspace({ rows, storageKey }: { rows: AnnRow[]; storageKey?: string }) {
  const [read, setRead] = useState<Set<string>>(new Set());
  const [acked, setAcked] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    // Hydrate read-state from this device after mount (localStorage is client-only).
    try {
      const raw = storageKey ? localStorage.getItem(storageKey) : null;
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRead(new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string' && rows.some((row) => row.id === value)) : []));
    } catch { /* ignore */ }
  }, [storageKey, rows]);
  const persist = (next: Set<string>) => { setRead(next); try { if (storageKey) localStorage.setItem(storageKey, JSON.stringify([...next])); } catch { /* Device storage may be unavailable; current-session state still works. */ } };
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

  const sectionContent = (<div className={layout.layout}>
    {filtered.length === 0 ? (
      <Card><EmptyState icon={<Megaphone size={26} />} title={tab === 'unread' ? 'You’re all caught up' : 'No announcements'} description="No notices match the selected view and search." /></Card>
    ) : (
      <div className="flex flex-col gap-6 min-w-0">
        {filtered.map((r) => {
          const isRead = read.has(r.id);
          const isOpen = open === r.id;
          const pinned = r.cat.important && !isRead;
          return (
            <Card key={r.id}>
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-xl grid place-items-center flex-none" style={{ background: `color-mix(in srgb, ${toneVar(r.cat.tone)} 14%, transparent)`, color: toneVar(r.cat.tone) }}>{r.cat.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {pinned && <span className="inline-flex items-center gap-1 text-[12px] font-medium text-warning"><Pin size={14} /> Priority category</span>}
                    <span className="text-[12px] font-semibold" style={{ color: toneVar(r.cat.tone) }}>{r.cat.label}</span>
                    {r.aiDrafted && <span className="inline-flex items-center gap-1 text-[12px] text-text-3"><Sparkles size={14} /> AI-assisted draft</span>}
                    <span className="text-[12px] text-text-3 ml-auto">{new Date(r.sentAt).toLocaleDateString('en-NG', { month: 'short', day: 'numeric' })}</span>
                    {!isRead && <span className="w-2 h-2 rounded-full bg-primary flex-none" />}
                  </div>
                  <h3 className="text-[16px] font-medium mt-1"><Button type="button" variant="ghost" aria-expanded={isOpen} aria-controls={`announcement-${r.id}`} className="-ml-3 text-left" onClick={() => { markRead(r.id); setOpen(isOpen ? null : r.id); }}>{r.title}</Button></h3>
                  <p id={`announcement-${r.id}`} className={`text-[14px] leading-relaxed text-text-2 mt-1 ${isOpen ? '' : 'line-clamp-2'}`}>{r.body}</p>
                  {isOpen && r.cat.important && (
                    <div className="mt-2.5 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {acked.has(r.id) ? (
                        <StatusPill status="Acknowledged in this session" tone="info" />
                      ) : (
                        <Button onClick={() => setAcked((s) => new Set(s).add(r.id))} icon={<Check size={16} />}>Acknowledge locally</Button>
                      )}
                      <span className="text-[12px] text-text-3">Local preview only. This does not notify management or confirm a delivery/read receipt.</span>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    )}
  </div>);

  return (
    <div className={layout.layout}>
      <Card><CardHeader title="Estate notices" subtitle="Read state is stored only on this device for this signed-in account. Local acknowledgements are not sent to management." /><div className={layout.toolbar}><span className={layout.body}>{unreadCount} unread announcement{unreadCount === 1 ? '' : 's'}</span>{unreadCount > 0 && <Button onClick={markAll} icon={<CheckCheck size={16} />}>Mark all read locally</Button>}</div></Card>


      <div className="pb-search">
        <Search size={15} className="text-text-3" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search announcements…" className="flex-1 bg-transparent outline-none text-[14px]" aria-label="Search announcements" />
      </div>

      <PageTabs label="Announcement views" activeTab={tab} onTabChange={(id) => setTab(id as typeof tab)} items={[
        { id: "all", label: "All announcements", content: tab === 'all' ? sectionContent : null },
        { id: "unread", label: "Unread", count: unreadCount, content: tab === 'unread' ? sectionContent : null }
      ]} />

    </div>
  );
}
