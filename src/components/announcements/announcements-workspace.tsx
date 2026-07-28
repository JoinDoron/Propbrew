'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Megaphone, Sparkles, Check, Send, CalendarClock, ShieldCheck, X, Languages, Users } from 'lucide-react';
import type { Announcement } from '@/domain/entities';
import type { AnnouncementScope } from '@/domain/enums';
import {
  CHANNELS, BLOCKS, composeDraft, estimateReach, targetSize, analytics, readRate, engagementTone,
  type Channel, type Composed,
} from '@/domain/announcements';
import { sendAnnouncement } from '@/server/actions/announcements';
import { toneVar, type Tone } from '@/lib/status-tones';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const SCOPES: AnnouncementScope[] = ['broadcast', 'estate', 'building'];
const AUDIENCES = ['All residents', 'Owners', 'Tenants', 'Committee'];

export function AnnouncementsWorkspace({ rows, canMutate }: { rows: readonly Announcement[]; canMutate: boolean }) {
  const [composing, setComposing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const a = analytics(rows);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 min-[900px]:grid-cols-4 gap-3">
        <Kpi label="Sent" value={String(a.sent)} note={`${a.drafts} in draft`} tone="info" icon={<Megaphone size={18} />} />
        <Kpi label="Delivered" value={a.totalDelivered.toLocaleString()} note="all channels" tone="progress" icon={<Send size={18} />} />
        <Kpi label="Avg read rate" value={`${a.avgReadRate}%`} note="across sent" tone={engagementTone(a.avgReadRate)} icon={<Users size={18} />} />
        <Kpi label="Reached" value={a.totalRead.toLocaleString()} note="opened / read" tone="success" icon={<Check size={18} />} />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-semibold">Recent announcements</h2>
        {canMutate && (
          <button onClick={() => setComposing(true)} className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-primary text-white text-[13px] font-medium shadow-sm hover:brightness-105">
            <Sparkles size={15} /> Compose
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 min-[720px]:grid-cols-2 gap-3.5">
        {rows.map((an) => {
          const rate = readRate(an);
          const sent = Boolean(an.sentAt);
          return (
            <div key={an.id} className="bg-surface border border-border rounded-2xl shadow-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full capitalize bg-surface-2 text-text-2">{an.scope}</span>
                  {an.aiDrafted && <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary bg-primary-weak px-1.5 h-[20px] rounded-md"><Sparkles size={10} /> AI-drafted</span>}
                </div>
                <span className={`text-[11px] font-medium ${sent ? 'text-text-3' : 'text-warning'}`}>{sent ? 'Sent' : 'Scheduled'}</span>
              </div>
              <h3 className="text-[14.5px] font-semibold mt-2.5 tracking-[-0.01em]">{an.title}</h3>
              <p className="text-[13px] text-text-2 mt-1 line-clamp-2">{an.body}</p>
              <div className="mt-3 pt-3 border-t border-border">
                <div className="flex items-center justify-between text-[11.5px] text-text-3 mb-1.5">
                  <span>Audience · {an.audience}</span>
                  {sent && <span className="font-mono">{an.read}/{an.delivered} · {rate}%</span>}
                </div>
                {sent && (
                  <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${rate}%`, background: toneVar(engagementTone(rate)) }} /></div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {composing && <Composer onClose={() => setComposing(false)} onSent={(msg) => { setComposing(false); setToast(msg); setTimeout(() => setToast(null), 4000); }} />}
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

type Phase = 'idle' | 'thinking' | 'streaming' | 'ready';

function Composer({ onClose, onSent }: { onClose: () => void; onSent: (msg: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [topic, setTopic] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [thoughts, setThoughts] = useState<string[]>([]);
  const [active, setActive] = useState('');
  const [composed, setComposed] = useState<Composed | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [streamed, setStreamed] = useState('');
  const [lang, setLang] = useState<'en' | 'pcm'>('en');
  const [aiDrafted, setAiDrafted] = useState(false);
  const [approved, setApproved] = useState(false);
  const [scope, setScope] = useState<AnnouncementScope>('estate');
  const [audience, setAudience] = useState('All residents');
  const [block, setBlock] = useState('Block C');
  const [channels, setChannels] = useState<Channel[]>(['in_app', 'push']);
  const [schedule, setSchedule] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runRef = useRef(0);

  const size = targetSize(scope, audience, block);
  const reach = estimateReach(size, channels);

  async function draft() {
    const text = topic.trim();
    if (!text) return;
    const run = ++runRef.current;
    const alive = () => runRef.current === run;
    setPhase('thinking'); setThoughts([]); setActive(''); setStreamed(''); setComposed(null);

    const c = composeDraft(text);
    for (const s of c.thoughts) {
      if (!alive()) return;
      setActive(s);
      await sleep(430 + Math.floor(Math.random() * 320));
      if (!alive()) return;
      setThoughts((p) => [...p, s]); setActive('');
    }
    setComposed(c); setAiDrafted(true); setApproved(false); setLang('en');
    setTitle(c.draft.title); setPhase('streaming');

    const tokens = c.draft.body.split(/(\s+)/);
    let acc = '';
    for (const tk of tokens) {
      if (!alive()) return;
      acc += tk; setStreamed(acc);
      if (tk.trim()) await sleep(/[.,;:—?!]$/.test(tk.trim()) ? 90 : 20 + Math.floor(Math.random() * 20));
    }
    if (!alive()) return;
    setBody(c.draft.body); setPhase('ready');
  }

  function switchLang(next: 'en' | 'pcm') {
    if (!composed) return;
    setLang(next);
    const d = next === 'en' ? composed.draft : composed.pidgin;
    setTitle(d.title); setBody(d.body);
  }

  function toggleChannel(c: Channel) {
    setChannels((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  function submit() {
    setError(null);
    start(async () => {
      const res = await sendAnnouncement({ title, body, scope, audience, block, channels, aiDrafted, approved, scheduleAt: schedule ? '2026-07-30T09:00:00Z' : null });
      if (!res.ok) { setError(res.error); return; }
      router.refresh();
      onSent(res.scheduled ? `Scheduled — ~${res.reach.toLocaleString()} residents will be reached.` : `Sent to ~${res.reach.toLocaleString()} residents.`);
    });
  }

  const needsApproval = aiDrafted && !approved;
  const bodyText = phase === 'streaming' ? streamed : body;

  return (
    <div className="fixed inset-0 z-[80] flex justify-end">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[540px] h-full bg-surface border-l border-border shadow-float overflow-y-auto animate-[tms-slidein_.22s_ease]">
        <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur border-b border-border px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2"><Sparkles size={16} className="text-primary" /><h2 className="text-[15px] font-semibold">Compose announcement</h2></div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button>
        </div>

        <div className="p-4 flex flex-col gap-4">
          {/* AI draft */}
          <div className="rounded-xl border border-primary/25 bg-primary/[0.04] p-3.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-primary mb-2"><Sparkles size={13} /> AI draft · say the topic, I’ll write it</div>
            <div className="flex gap-2">
              <input value={topic} onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && draft()} placeholder="e.g. water supply cut Saturday morning" className="flex-1 h-9 px-2.5 rounded-lg border border-border-2 bg-surface text-[13px] outline-none focus:border-primary" />
              <button onClick={draft} disabled={phase === 'thinking' || phase === 'streaming'} className="h-9 px-3 rounded-lg bg-primary text-white text-[12.5px] font-medium disabled:opacity-60 inline-flex items-center gap-1.5">{phase === 'thinking' || phase === 'streaming' ? <><Dots /> Writing</> : 'Draft'}</button>
            </div>
            {(phase === 'thinking' || thoughts.length > 0) && (
              <div className="mt-2.5 flex flex-col gap-1">
                {thoughts.map((t, i) => <div key={i} className="flex items-center gap-2 text-[11.5px] text-text-3 animate-fade"><Check size={11} className="text-success flex-none" />{t}</div>)}
                {active && <div className="flex items-center gap-2 text-[12px] text-text-2"><Dots /> {active}</div>}
              </div>
            )}
            {composed && phase === 'ready' && (
              <div className="flex items-center gap-1.5 mt-2.5">
                <Languages size={12} className="text-text-3" />
                {(['en', 'pcm'] as const).map((l) => (
                  <button key={l} onClick={() => switchLang(l)} className={`text-[11px] px-2 h-6 rounded-full border ${lang === l ? 'border-primary text-primary bg-primary-weak' : 'border-border-2 text-text-3'}`}>{l === 'en' ? 'English' : 'Pidgin'}</button>
                ))}
              </div>
            )}
          </div>

          {/* Title + body */}
          <Field label="Title">
            <input value={title} onChange={(e) => { setTitle(e.target.value); setAiDrafted(false); }} placeholder="Announcement title" className="w-full h-9 px-2.5 rounded-lg border border-border-2 bg-surface text-[13.5px] font-medium outline-none focus:border-primary" />
          </Field>
          <Field label="Message">
            <div className="relative">
              <textarea value={bodyText} onChange={(e) => { setBody(e.target.value); setAiDrafted(false); }} rows={5} placeholder="Write the message, or draft it with AI above" className="w-full px-2.5 py-2 rounded-lg border border-border-2 bg-surface text-[13px] leading-relaxed outline-none focus:border-primary resize-none" />
              {phase === 'streaming' && <span className="absolute bottom-3 right-3 inline-block w-[2px] h-[15px] bg-primary animate-pulse" />}
            </div>
          </Field>

          {/* Targeting */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Scope">
              <select value={scope} onChange={(e) => setScope(e.target.value as AnnouncementScope)} className="w-full h-9 px-2 rounded-lg border border-border-2 bg-surface text-[13px] outline-none focus:border-primary capitalize">
                {SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label={scope === 'building' ? 'Block' : 'Audience'}>
              {scope === 'building' ? (
                <select value={block} onChange={(e) => setBlock(e.target.value)} className="w-full h-9 px-2 rounded-lg border border-border-2 bg-surface text-[13px] outline-none focus:border-primary">{Object.keys(BLOCKS).map((b) => <option key={b}>{b}</option>)}</select>
              ) : (
                <select value={audience} onChange={(e) => setAudience(e.target.value)} className="w-full h-9 px-2 rounded-lg border border-border-2 bg-surface text-[13px] outline-none focus:border-primary">{AUDIENCES.map((x) => <option key={x}>{x}</option>)}</select>
              )}
            </Field>
          </div>

          {/* Channels + audience estimate */}
          <Field label="Delivery channels">
            <div className="flex flex-wrap gap-1.5">
              {CHANNELS.map((c) => {
                const on = channels.includes(c.key);
                return <button key={c.key} onClick={() => toggleChannel(c.key)} className={`text-[12px] px-2.5 h-8 rounded-lg border transition-colors ${on ? 'border-primary bg-primary-weak text-primary font-medium' : 'border-border-2 text-text-3'}`}>{c.label}</button>;
              })}
            </div>
          </Field>
          <div className="flex items-center gap-2 rounded-xl bg-surface-2 border border-border p-3">
            <Users size={16} className="text-primary" />
            <div className="text-[12.5px]"><span className="font-semibold">~{reach.toLocaleString()}</span> of {size.toLocaleString()} targeted will be reached</div>
            <span className="ml-auto text-[10.5px] text-text-3">estimate</span>
          </div>

          {/* Approval + schedule */}
          {aiDrafted && (
            <label className={`flex items-start gap-2.5 rounded-xl p-3 border cursor-pointer ${approved ? 'border-success/40 bg-success/[0.05]' : 'border-warning/40 bg-warning/[0.05]'}`}>
              <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} className="mt-0.5" />
              <div><div className="text-[12.5px] font-semibold flex items-center gap-1.5"><ShieldCheck size={13} /> Manager approval (AI-E-04)</div><div className="text-[11.5px] text-text-3 mt-0.5">This message was AI-drafted. It cannot be sent until a manager approves it.</div></div>
            </label>
          )}
          <label className="flex items-center gap-2.5 text-[12.5px]"><input type="checkbox" checked={schedule} onChange={(e) => setSchedule(e.target.checked)} /><CalendarClock size={14} className="text-text-3" /> Schedule for later instead of sending now</label>

          {error && <div className="text-[12.5px] text-negative bg-[color:var(--tone-danger)]/[0.08] rounded-lg px-3 py-2">{error}</div>}
        </div>

        <div className="sticky bottom-0 bg-surface/95 backdrop-blur border-t border-border px-4 py-3 flex items-center justify-end gap-2">
          <button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button>
          <button onClick={submit} disabled={pending || needsApproval || !title.trim() || !body.trim()} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50 inline-flex items-center gap-1.5">
            {schedule ? <CalendarClock size={15} /> : <Send size={15} />}{schedule ? 'Schedule' : 'Send now'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="text-[11px] font-semibold text-text-3 uppercase tracking-[0.04em] mb-1.5">{label}</div>{children}</div>;
}
function Dots() {
  return <span className="inline-flex items-end gap-0.5 h-3">{[0, 1, 2].map((i) => <span key={i} className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: `${i * 130}ms`, animationDuration: '900ms' }} />)}</span>;
}
function Kpi({ label, value, note, tone, icon }: { label: string; value: string; note: string; tone: Tone; icon: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-2xl shadow-card p-4">
      <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span>
      <div className="text-[13px] text-text-2 font-medium mt-3">{label}</div>
      <div className="text-[23px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div>
      <div className="text-[11px] mt-1" style={{ color: toneVar(tone) }}>{note}</div>
    </div>
  );
}
