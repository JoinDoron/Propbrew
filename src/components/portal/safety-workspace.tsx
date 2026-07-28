'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LifeBuoy, QrCode, X, Phone, Plus, ShieldCheck, Copy, Check, ChevronRight } from 'lucide-react';
import { DomainStatus } from '@/components/domain';
import { toneVar } from '@/lib/status-tones';
import type { SosStatus } from '@/domain/enums';
import { raiseSos } from '@/server/actions/transitions';

export type SosRow = { id: string; ref: string; status: SosStatus; ackSeconds: number | null; responder: string | null; channel: string };
type Pass = { code: string; visitor: string; hours: number };
type Contact = { name: string; phone: string; kind: 'security' | 'manager' | 'emergency' | 'custom' };

const DEFAULT_CONTACTS: Contact[] = [
  { name: 'Estate Security Desk', phone: '0800 100 2000', kind: 'security' },
  { name: 'Estate Manager', phone: '0803 555 0142', kind: 'manager' },
  { name: 'Lagos Emergency (112)', phone: '112', kind: 'emergency' },
];

const TIPS = [
  'Pre-register visitors for faster, safer gate entry.',
  'Keep your emergency contacts up to date in the app.',
  'Test your smoke alarm monthly — it takes 10 seconds.',
  'Never share your visitor pass code publicly.',
];

function hash(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; return Math.abs(h); }

export function SafetyWorkspace({ events }: { events: SosRow[] }) {
  const [showPass, setShowPass] = useState(false);
  const [confirmSos, setConfirmSos] = useState(false);
  const [passes, setPasses] = useState<Pass[]>([]);
  const [contacts, setContacts] = useState<Contact[]>(DEFAULT_CONTACTS);
  const [addingContact, setAddingContact] = useState(false);
  const [tip, setTip] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  useEffect(() => { const t = setInterval(() => setTip((n) => (n + 1) % TIPS.length), 5000); return () => clearInterval(t); }, []);
  const active = events.find((e) => !['reviewed', 'resolved'].includes(e.status));

  return (
    <div className="flex flex-col gap-4">
      {/* SOS */}
      <div className="rounded-2xl border border-[color:var(--tone-danger)]/40 bg-[color:var(--tone-danger)]/[0.05] p-4">
        <div className="flex items-center gap-3">
          <span className="w-12 h-12 rounded-2xl bg-[color:var(--tone-danger)] text-white grid place-items-center flex-none"><LifeBuoy size={24} /></span>
          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-semibold">Emergency SOS</h3>
            <p className="text-[12px] text-text-2">Alerts the security desk with your unit and location.</p>
          </div>
        </div>
        {active ? (
          <div className="mt-3 rounded-xl bg-surface border border-border p-3 flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[color:var(--tone-danger)] opacity-75" /><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[color:var(--tone-danger)]" /></span>
            <div className="text-[12.5px] flex-1"><b>{active.ref}</b> is live — {active.responder ? `${active.responder} responding` : 'security notified'}</div>
            <DomainStatus type="sos" status={active.status} />
          </div>
        ) : (
          <button onClick={() => setConfirmSos(true)} className="mt-3 w-full h-12 rounded-xl bg-[color:var(--tone-danger)] text-white text-[15px] font-bold hover:brightness-105 inline-flex items-center justify-center gap-2"><LifeBuoy size={19} /> Hold-free SOS · tap to alert</button>
        )}
      </div>

      {/* Quick tiles */}
      <div className="grid grid-cols-2 gap-2.5">
        <button onClick={() => setShowPass(true)} className="rounded-2xl border border-border bg-surface shadow-card p-3.5 text-left hover:border-primary/40 transition">
          <span className="w-9 h-9 rounded-xl bg-primary-weak text-primary grid place-items-center"><QrCode size={18} /></span>
          <div className="text-[13px] font-semibold mt-2.5">Visitor pass</div>
          <div className="text-[11px] text-text-3">Generate a gate code</div>
        </button>
        <a href={`tel:${contacts[0].phone.replace(/\s/g, '')}`} className="rounded-2xl border border-border bg-surface shadow-card p-3.5 text-left hover:border-primary/40 transition">
          <span className="w-9 h-9 rounded-xl bg-[color:var(--tone-warn)]/15 text-warning grid place-items-center"><Phone size={18} /></span>
          <div className="text-[13px] font-semibold mt-2.5">Call security</div>
          <div className="text-[11px] text-text-3">{contacts[0].phone}</div>
        </a>
      </div>

      {/* Active visitor passes */}
      {passes.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-[13px] font-semibold">Active passes</h2>
          {passes.map((p) => (
            <div key={p.code} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
              <div className="w-10 h-10 rounded-lg bg-surface-2 grid grid-cols-4 grid-rows-4 gap-px p-1 flex-none">{Array.from({ length: 16 }).map((_, i) => <span key={i} className="rounded-[0.5px]" style={{ background: (hash(p.code + i) & 1) ? 'var(--text)' : 'transparent' }} />)}</div>
              <div className="min-w-0 flex-1"><div className="text-[13px] font-semibold truncate">{p.visitor}</div><div className="text-[11px] text-text-3 font-mono">{p.code} · valid {p.hours}h</div></div>
              <button onClick={() => { navigator.clipboard?.writeText(p.code); flash('Pass code copied'); }} className="text-text-3 hover:text-primary" aria-label="Copy code"><Copy size={15} /></button>
            </div>
          ))}
        </div>
      )}

      {/* Emergency contacts */}
      <div className="rounded-2xl border border-border bg-surface shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><ShieldCheck size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Emergency contacts</span><button onClick={() => setAddingContact(true)} className="ml-auto text-[11.5px] text-primary hover:underline inline-flex items-center gap-0.5"><Plus size={12} /> Add</button></div>
        <div className="divide-y divide-border">
          {contacts.map((c) => (
            <a key={c.name + c.phone} href={`tel:${c.phone.replace(/\s/g, '')}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
              <span className="w-8 h-8 rounded-lg grid place-items-center flex-none" style={{ background: `color-mix(in srgb, ${toneVar(c.kind === 'emergency' ? 'danger' : c.kind === 'security' ? 'warn' : 'info')} 14%, transparent)`, color: toneVar(c.kind === 'emergency' ? 'danger' : c.kind === 'security' ? 'warn' : 'info') }}><Phone size={15} /></span>
              <div className="min-w-0 flex-1"><div className="text-[13px] font-medium truncate">{c.name}</div><div className="text-[11.5px] text-text-3 font-mono">{c.phone}</div></div>
              <ChevronRight size={15} className="text-text-3" />
            </a>
          ))}
        </div>
      </div>

      {/* Safety tip */}
      <div className="rounded-2xl bg-primary-weak/50 border border-primary/20 p-3.5 flex items-start gap-2.5">
        <ShieldCheck size={16} className="text-primary flex-none mt-0.5" />
        <div><div className="text-[11px] font-semibold text-primary uppercase tracking-wide">Safety tip</div><div className="text-[12.5px] text-text-2 mt-0.5 animate-fade" key={tip}>{TIPS[tip]}</div></div>
      </div>

      {/* SOS history */}
      {events.length > 0 && (
        <div>
          <h2 className="text-[13px] font-semibold mb-2">SOS history</h2>
          <div className="flex flex-col gap-1.5">
            {events.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border">
                <div className="min-w-0 flex-1"><div className="text-[12.5px] font-mono font-semibold">{s.ref}</div><div className="text-[11px] text-text-3">{s.ackSeconds === null ? 'acknowledgement pending' : `acknowledged in ${s.ackSeconds}s`}{s.responder ? ` · ${s.responder}` : ''}</div></div>
                <DomainStatus type="sos" status={s.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {showPass && <PassDialog onClose={() => setShowPass(false)} onIssue={(p) => { setPasses((x) => [p, ...x]); setShowPass(false); flash('Visitor pass issued'); }} />}
      {addingContact && <ContactDialog onClose={() => setAddingContact(false)} onAdd={(c) => { setContacts((x) => [...x, c]); setAddingContact(false); flash('Contact added'); }} />}
      {confirmSos && <SosCountdown onClose={() => setConfirmSos(false)} onSent={() => { setConfirmSos(false); flash('SOS sent — help is on the way.'); }} />}
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function SosCountdown({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const router = useRouter();
  const [n, setN] = useState(3);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (n <= 0) { start(async () => { const r = await raiseSos(); if (r.ok) { router.refresh(); onSent(); } else setError(r.error); }); return; }
    const t = setTimeout(() => setN((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [n]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.6)]" />
      <div className="relative bg-surface rounded-2xl shadow-float p-6 text-center w-[300px]">
        <div className="w-20 h-20 rounded-full bg-[color:var(--tone-danger)]/15 grid place-items-center mx-auto mb-3">
          <span className="text-[34px] font-bold text-negative">{pending || n <= 0 ? '…' : n}</span>
        </div>
        <div className="text-[14px] font-semibold">{pending || n <= 0 ? 'Alerting security…' : 'Sending SOS'}</div>
        <p className="text-[12px] text-text-3 mt-1">Cancel now if this was a mistake.</p>
        {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
        <button onClick={onClose} disabled={pending} className="mt-4 w-full h-10 rounded-xl border border-border-2 text-[13px] font-medium disabled:opacity-50">Cancel</button>
      </div>
    </div>
  );
}

function PassDialog({ onClose, onIssue }: { onClose: () => void; onIssue: (p: Pass) => void }) {
  const [visitor, setVisitor] = useState('');
  const [hours, setHours] = useState(24);
  const code = 'VP-' + Math.abs(hash(visitor + hours)).toString(36).slice(0, 6).toUpperCase();
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[360px] bg-surface border border-border rounded-2xl shadow-float p-4 animate-[tms-slideup_.2s_ease]">
        <div className="flex items-center justify-between mb-3"><h3 className="text-[15px] font-semibold">Issue visitor pass</h3><button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button></div>
        <input value={visitor} onChange={(e) => setVisitor(e.target.value)} placeholder="Visitor name" autoFocus className="w-full h-9 px-2.5 rounded-lg border border-border-2 bg-surface text-[13px] outline-none focus:border-primary mb-2" />
        <div className="flex gap-1.5 mb-3">{[6, 12, 24, 48].map((h) => <button key={h} onClick={() => setHours(h)} className={`flex-1 h-8 rounded-lg border text-[12px] ${hours === h ? 'border-primary bg-primary-weak text-primary font-medium' : 'border-border-2 text-text-2'}`}>{h}h</button>)}</div>
        {visitor && (
          <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-3 mb-3 animate-fade">
            <div className="w-16 h-16 rounded-lg bg-surface grid grid-cols-4 grid-rows-4 gap-0.5 p-1.5 flex-none">{Array.from({ length: 16 }).map((_, i) => <span key={i} className="rounded-[1px]" style={{ background: (hash(visitor + i) & 1) ? 'var(--text)' : 'transparent' }} />)}</div>
            <div><div className="font-mono text-[15px] font-bold">{code}</div><div className="text-[11px] text-text-3">valid {hours}h · verified at gate</div></div>
          </div>
        )}
        <div className="flex justify-end gap-2"><button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button><button onClick={() => onIssue({ code, visitor, hours })} disabled={!visitor} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50 inline-flex items-center gap-1.5"><Check size={15} /> Issue pass</button></div>
      </div>
    </div>
  );
}

function ContactDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (c: Contact) => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[340px] bg-surface border border-border rounded-2xl shadow-float p-4 animate-[tms-slideup_.2s_ease]">
        <div className="flex items-center justify-between mb-3"><h3 className="text-[15px] font-semibold">Add contact</h3><button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button></div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" autoFocus className="w-full h-9 px-2.5 rounded-lg border border-border-2 bg-surface text-[13px] outline-none focus:border-primary mb-2" />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" inputMode="tel" className="w-full h-9 px-2.5 rounded-lg border border-border-2 bg-surface text-[13px] outline-none focus:border-primary mb-3" />
        <div className="flex justify-end gap-2"><button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button><button onClick={() => onAdd({ name, phone, kind: 'custom' })} disabled={!name || !phone} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50">Add</button></div>
      </div>
    </div>
  );
}
