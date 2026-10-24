'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LifeBuoy, QrCode, X, Plus, Phone } from 'lucide-react';
import { Button, Card, CardHeader, EmptyState, IconButton, StatusPill } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import { PortalDialog } from '@/components/portal/portal-dialog';
import { DomainStatus } from '@/components/domain';
import type { SosStatus } from '@/domain/enums';
import { raiseSos } from '@/server/actions/transitions';
import common from '@/components/ui/workspace-layout.module.css';
import styles from './portal-workspaces.module.css';

export type SosRow = { id: string; ref: string; status: SosStatus; ackSeconds: number | null; responder: string | null; channel: string };
type Pass = { code: string; visitor: string; hours: number };
type Contact = { name: string; phone: string };

export function normalizeContactPhone(value: string): string | null {
  const normalized = value.trim().replace(/[\s()-]/g, '');
  return /^\+?\d{3,15}$/.test(normalized) ? normalized : null;
}

export function SafetyWorkspace({ events, canRaise = false, targetUnitLabel = 'Primary linked unit · verify with your estate manager' }: { events: SosRow[]; canRaise?: boolean; targetUnitLabel?: string }) {
  const [showPass, setShowPass] = useState(false);
  const [confirmSos, setConfirmSos] = useState(false);
  const [passes, setPasses] = useState<Pass[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [addingContact, setAddingContact] = useState(false);
  const [activeTab, setActiveTab] = useState('visitors');
  const [feedback, setFeedback] = useState<string | null>(null);
  const active = events.find((e) => !['reviewed', 'resolved'].includes(e.status));
  return <div className={common.layout}>
    <Card><CardHeader title="Emergency SOS" subtitle="Recorded incident workflow · not a connected emergency dispatch service" action={<LifeBuoy size={24} className="text-negative" />} />
      <div className={common.stack}><p className={common.body}>The demonstration records an SOS request. It does not call emergency services, deliver a security notification, share verified live location or guarantee a responder.</p>
        {active ? <div className={styles.notice}><div className="flex-1 min-w-0"><span className={common.title}>{active.ref} · Recorded incident</span><span className={common.metadata}>{active.responder ? `Recorded responder: ${active.responder}` : 'No responder recorded'}</span></div><DomainStatus type="sos" status={active.status} /></div> : canRaise ? <Button type="button" onClick={() => setConfirmSos(true)} className="!bg-[color:var(--tone-danger)] !text-[color:var(--on-primary)] !border-[color:var(--tone-danger)]" icon={<LifeBuoy size={18} />}>Review SOS alert</Button> : <StatusPill status="Read-only incident access" tone="muted" />}
        <p className={common.metadata}>Use your established emergency procedure and verified local contacts. Do not rely on this demonstration for emergency assistance.</p>
      </div>
    </Card>
    <div className={styles.cardGrid}><Card><CardHeader title="Visitor pass preview" subtitle="Session-only · no gate credential is issued" /><Button type="button" icon={<QrCode size={16} />} onClick={() => setShowPass(true)}>Preview visitor pass</Button></Card><Card><CardHeader title="Your contact list" subtitle="Added contacts remain in this browser view only" /><Button type="button" icon={<Phone size={16} />} onClick={() => setActiveTab('contacts')}>Review contacts</Button></Card></div>
    <PageTabs label="Safety and access sections" activeTab={activeTab} onTabChange={setActiveTab} items={[
      { id: 'visitors', label: 'Visitor passes', content: <Card className={common.panel}><CardHeader title="Local visitor previews" subtitle="These previews cannot be scanned or verified at a gate." />{passes.length ? <ul className={common.list}>{passes.map((p) => <li key={p.code} className={common.listRow}><div className="flex-1 min-w-0"><span className={common.title}>{p.visitor}</span><span className={common.metadata}>{p.code} · Illustrative duration {p.hours} hours</span></div><StatusPill status="Not a valid pass" tone="warn" /></li>)}</ul> : <EmptyState title="No visitor previews." description="Preview the layout without issuing real access." />}<p className={common.footnote}>Never share a real access code publicly. Production pass issuance, expiry and gate verification are not connected here.</p></Card> },
      { id: 'contacts', label: 'Emergency contacts', content: <Card className={common.panel}><CardHeader title="Emergency contacts" subtitle="Verify each number independently before relying on it." action={<Button type="button" icon={<Plus size={16} />} onClick={() => setAddingContact(true)}>Add local contact</Button>} />{contacts.length ? <ul className={common.list}>{contacts.map((c, i) => <li key={`${c.name}-${i}`} className={common.listRow}><div className="flex-1 min-w-0"><span className={common.title}>{c.name}</span><span className={common.metadata}>{c.phone} · Added locally, not independently verified</span></div><a className="pb-action text-primary" href={`tel:${c.phone.replace(/[^+\d]/g, '')}`} aria-label={`Call ${c.name}`}>Call</a></li>)}</ul> : <EmptyState title="No verified estate contacts configured." description="Demo phone numbers are not presented as real security contacts. Obtain the current response contacts from your estate manager." />}</Card> },
      { id: 'history', label: 'SOS history', content: <Card className={common.panel}><CardHeader title="SOS history" subtitle="Recorded demo statuses and sample acknowledgement durations, not verified response SLAs." />{events.length ? <ul className={common.list}>{events.map((s) => <li key={s.id} className={common.listRow}><div className="flex-1 min-w-0"><span className={common.title}>{s.ref}</span><span className={common.metadata}>{s.ackSeconds === null ? 'Acknowledgement not recorded' : `Recorded sample acknowledgement: ${s.ackSeconds} seconds`}{s.responder ? ` · ${s.responder}` : ''} · {s.channel.replace(/_/g, ' ')}</span></div><DomainStatus type="sos" status={s.status} /></li>)}</ul> : <EmptyState title="No SOS history." />}</Card> },
    ]} />
    {showPass && <PassDialog onClose={() => setShowPass(false)} onIssue={(p) => { setPasses((x) => [p, ...x]); setShowPass(false); setFeedback('Visitor preview added for this session. No gate access was issued.'); }} />}
    {addingContact && <ContactDialog onClose={() => setAddingContact(false)} onAdd={(c) => { setContacts((x) => [...x, c]); setAddingContact(false); setFeedback('Contact added to this session only. Verify the number with the responsible response team.'); }} />}
    {confirmSos && canRaise && <SosConfirmation targetUnitLabel={targetUnitLabel} onClose={() => setConfirmSos(false)} onSent={() => { setConfirmSos(false); setFeedback('SOS request recorded. Notification delivery and responder attendance are not confirmed.'); }} />}
    {feedback && <div className={common.feedback} role="status"><span>{feedback}</span><IconButton type="button" aria-label="Dismiss safety update" onClick={() => setFeedback(null)}><X size={18} /></IconButton></div>}
  </div>;
}

function SosConfirmation({ onClose, onSent, targetUnitLabel }: { onClose: () => void; onSent: () => void; targetUnitLabel: string }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [error, setError] = useState<string | null>(null); const inFlight = useRef(false);
  function send() { if (inFlight.current) return; inFlight.current = true; setError(null); start(async () => { try { const result = await raiseSos(); if (!result.ok) { setError(result.error); return; } router.refresh(); onSent(); } catch { setError('The SOS record could not be created. Use your established emergency contact procedure.'); } finally { inFlight.current = false; } }); }
  return <PortalDialog label="Review SOS alert" width={540} onClose={onClose} canClose={!pending} dismissOnBackdrop={false}><div className={common.modal}><header className={common.dialogHeader}><h2 className={common.dialogTitle}>Review SOS alert</h2><IconButton type="button" aria-label="Close SOS review" disabled={pending} onClick={onClose}><X size={18} /></IconButton></header><form className={common.dialogBody} onSubmit={(e) => { e.preventDefault(); send(); }}><p className={common.title}>Record target: {targetUnitLabel}</p><p className={common.body}>The server records this alert against your primary linked unit, not the currently selected unit. No action occurs until you confirm. This demonstration does not call emergency services or verify security notification delivery.</p>{error && <p className={common.feedback} role="alert">{error}</p>}<div className={common.actions}><Button type="button" disabled={pending} onClick={onClose}>Cancel</Button><Button type="submit" disabled={pending} className="!bg-[color:var(--tone-danger)] !text-[color:var(--on-primary)] !border-[color:var(--tone-danger)]">{pending ? 'Recording…' : 'Confirm SOS record'}</Button></div></form></div></PortalDialog>;
}
function PassDialog({ onClose, onIssue }: { onClose: () => void; onIssue: (p: Pass) => void }) {
  const [visitor, setVisitor] = useState(''); const [hours, setHours] = useState(24);
  return <PortalDialog label="Preview visitor pass" width={540} onClose={onClose}><div className={common.modal}><header className={common.dialogHeader}><h2 className={common.dialogTitle}>Preview visitor pass</h2><IconButton type="button" aria-label="Close visitor preview" onClick={onClose}><X size={18} /></IconButton></header><form className={common.dialogBody} onSubmit={(e) => { e.preventDefault(); if (visitor.trim()) onIssue({ code: `DEMO-${visitor.trim().slice(0, 3).toUpperCase()}-${hours}`, visitor: visitor.trim(), hours }); }}>
    <p className={common.body}>Layout preview only. No QR token, access permission or gate-verifiable credential is created.</p><label className={common.field}><span className={common.label}>Visitor name</span><input className={common.control} required maxLength={100} value={visitor} onChange={(e) => setVisitor(e.target.value)} /></label><label className={common.field}><span className={common.label}>Illustrative duration</span><select className={common.control} value={hours} onChange={(e) => setHours(Number(e.target.value))}>{[6, 12, 24, 48].map((h) => <option key={h} value={h}>{h} hours</option>)}</select></label><div className={common.actions}><Button type="button" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary">Add local preview</Button></div>
  </form></div></PortalDialog>;
}
function ContactDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (c: Contact) => void }) {
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [error, setError] = useState<string | null>(null);
  return <PortalDialog label="Add local contact" width={540} onClose={onClose}><div className={common.modal}><header className={common.dialogHeader}><h2 className={common.dialogTitle}>Add local contact</h2><IconButton type="button" aria-label="Close local contact form" onClick={onClose}><X size={18} /></IconButton></header><form className={common.dialogBody} onSubmit={(e) => { e.preventDefault(); const number = normalizeContactPhone(phone); if (!number) { setError('Enter a phone number with 3 to 15 digits and an optional leading +.'); return; } if (name.trim()) onAdd({ name: name.trim(), phone: number }); }}>
    <p className={common.body}>Keep a contact in this browser view. It is not stored across reloads, shared with management or verified by Propbrew.</p><label className={common.field}><span className={common.label}>Contact name</span><input className={common.control} required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></label><label className={common.field}><span className={common.label}>Phone number</span><input type="tel" inputMode="tel" className={common.control} required maxLength={25} value={phone} onChange={(e) => { setPhone(e.target.value); setError(null); }} aria-invalid={error ? true : undefined} aria-describedby={error ? 'local-contact-error' : undefined} /></label>{error && <p id="local-contact-error" role="alert" className="text-sm text-negative">{error}</p>}<div className={common.actions}><Button type="button" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary">Add local contact</Button></div>
  </form></div></PortalDialog>;
}
