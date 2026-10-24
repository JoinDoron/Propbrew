'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Crown, Shield, UserPlus, Users } from 'lucide-react';
import { Avatar, Button, Card, CardHeader, EmptyState, StatusPill } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import { humanizeStatus, type Tone } from '@/lib/status-tones';
import { inviteMember, setMemberRole, removeMember } from '@/server/actions/shortlet';
import { ShortletConfirm, ShortletDialog, ShortletFeedback, ShortletReview } from './reference-ui';
import styles from './shortlet-specialists-polish.module.css';

export type MemberRow = { id: string; name: string; phone: string; role: string; status: string; lastActive: string };
export type RoleDef = { key: string; label: string; blurb: string };
const PERMISSION_TONE: Record<string, Tone> = { manage: 'success', view: 'info', none: 'muted' };
const STATUS_TONE: Record<string, Tone> = { active: 'success', invited: 'warn' };

export function TeamWorkspace({ members, roles, modules, matrix, canCreate = false, canUpdate = false }: { members: MemberRow[]; roles: RoleDef[]; modules: string[]; matrix: Record<string, Record<string, string>>; canCreate?: boolean; canUpdate?: boolean }) {
  const router = useRouter();
  const [inviting, setInviting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  return <div className={styles.stack}>
    <Card><CardHeader title="Your Shortlet team" subtitle="Workspace team records · invitations, responsibilities and reference permissions" action={<Button variant="primary" icon={<UserPlus size={16} />} onClick={() => setInviting(true)} disabled={!canCreate}>Invite</Button>} /><p className={styles.text}>Manage Shortlet team records. The matrix below is a reference; editing these records does not provision accounts or change application authentication grants.</p></Card>
    <PageTabs label="Team management sections" items={[
      { id: "members", label: "Team members", content: <div className={styles.stack}>{members.length ? <div className={styles.grid}>{members.map((member) => <Card key={member.id} padded={false} className={styles.panel}><div className={styles.header}><CardHeader title={member.name} subtitle={roles.find((role) => role.key === member.role)?.label ?? humanizeStatus(member.role)} action={<Avatar name={member.name} size={40} />} /></div><div className={styles.body}><div className={styles.stack}><div className={styles.toolbar}><StatusPill status={humanizeStatus(member.status)} tone={STATUS_TONE[member.status] ?? 'neutral'} />{member.role === 'owner' ? <StatusPill status="Owner record" tone="info" /> : null}</div><dl className={styles.facts}><div><dt>Phone (WhatsApp)</dt><dd>{member.phone || 'Not recorded'}</dd></div><div><dt>Last activity record</dt><dd>{member.lastActive || 'Not recorded'}</dd></div><div><dt>Recorded role</dt><dd>{roles.find((role) => role.key === member.role)?.label ?? humanizeStatus(member.role)}</dd></div><div><dt>Account provisioning</dt><dd>Not verified in this view</dd></div></dl>{member.role !== 'owner' ? <RoleControl member={member} roles={roles} canUpdate={canUpdate} onDone={() => { router.refresh(); setMessage('Team role record updated. Application authentication roles are unchanged.'); }} /> : <p className={styles.metadata}>The owner role cannot be changed or removed here.</p>}</div></div><div className={styles.footer}>{member.role === 'owner' ? <div className={styles.identity}><Crown size={16} aria-hidden="true" /><span>Owner record · protected from role changes and removal</span></div> : <div className={styles.actions}><ShortletConfirm disabled={!canUpdate} title="Review team removal" label={'Remove ' + member.name} description={'Remove ' + member.name + ' from the Shortlet team record. This does not revoke a real authenticated account or session.'} action={() => removeMember(member.id)} onDone={() => { router.refresh(); setMessage('Team record removed. Authentication accounts and sessions are unchanged.'); }} danger /></div>}</div></Card>)}</div> : <Card><EmptyState icon={<Users size={26} />} title="No team records" description="Team members appear after an authorised operator records their details. No invitation message is sent automatically." /></Card>}</div> },
      { id: "permissions", label: "Role permissions", content: <div className={styles.stack}><Card padded={false} className={styles.panel}><div className={styles.header}><CardHeader title="Role permissions" subtitle="Product reference by module · not the signed-in actor’s authentication grants" action={<Shield size={18} className="text-primary" />} /></div>{roles.length && modules.length ? <div className={styles.scroll} role="region" tabIndex={0} aria-label="Shortlet role permission reference table"><table className={'pb-data-table ' + styles.table}><thead><tr><th scope="col">Module</th>{roles.map((role) => <th key={role.key} scope="col" className={styles.center}>{role.label}</th>)}</tr></thead><tbody>{modules.map((module) => <tr key={module}><th scope="row">{module}</th>{roles.map((role) => {
        const level = matrix[role.key]?.[module] ?? 'none';
        return <td key={role.key} className={styles.center}><StatusPill status={level} tone={PERMISSION_TONE[level] ?? 'neutral'} /></td>;
      })}</tr>)}</tbody></table></div> : <div className={styles.empty}><EmptyState icon={<Shield size={26} />} title="No permission reference supplied" description="Role and module definitions are needed to display the permission matrix. No application grant is changed here." /></div>}<p className={styles.footer}>Actual routes and actions continue to require the signed-in actor’s application capabilities. This reference does not grant access, provision an account or send a WhatsApp invitation.</p></Card>{roles.length ? <Card><CardHeader title="Role responsibilities" subtitle="Understand the intended operating responsibilities before changing a team record" /><div className={styles.grid}>{roles.map((role) => <div key={role.key} className={styles.notice}><h3 className={styles.title}>{role.label}</h3><p className={styles.text + ' mt-3'}>{role.blurb || 'No responsibility description supplied.'}</p></div>)}</div></Card> : null}</div> },
    ]} />
    {inviting ? <InviteDialog roles={roles} onClose={() => setInviting(false)} onDone={(name) => { setInviting(false); setMessage('Invitation record created for ' + name + '. No message was sent.'); }} /> : null}
    {message ? <ShortletFeedback message={message} onClose={() => setMessage(null)} /> : null}
  </div>;
}

function RoleControl({ member, roles, canUpdate, onDone }: { member: MemberRow; roles: RoleDef[]; canUpdate: boolean; onDone: () => void }) {
  const [selected, setSelected] = useState(member.role);
  const available = roles.filter((role) => role.key !== 'owner');
  return <div className={styles.roleControl}><label className={styles.field}>Proposed role<select aria-label={'Proposed role for ' + member.name} value={selected} disabled={!canUpdate || !available.length} onChange={(event) => setSelected(event.target.value)} className="pb-form-control">{available.map((role) => <option key={role.key} value={role.key}>{role.label}</option>)}</select></label><ShortletConfirm disabled={!canUpdate || selected === member.role || !available.some((role) => role.key === selected)} title="Review team role record" label="Apply role" description={'Change ' + member.name + ' from ' + member.role + ' to ' + selected + ' in the team record only. Authentication permissions remain unchanged.'} action={() => setMemberRole(member.id, selected as never)} onDone={onDone} /></div>;
}

function InviteDialog({ roles, onClose, onDone }: { roles: RoleDef[]; onClose: () => void; onDone: (name: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const inFlight = useRef(false);
  const available = roles.filter((role) => role.key !== 'owner');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState(available.find((item) => item.key === 'housekeeper')?.key ?? available[0]?.key ?? '');
  const [error, setError] = useState<string | null>(null);
  const definition = roles.find((item) => item.key === role);
  const valid = name.trim() !== '' && available.some((item) => item.key === role);
  function submit() {
    if (pending || inFlight.current || !valid) return;
    inFlight.current = true;
    setError(null);
    start(async () => {
      try {
        const result = await inviteMember({ name, phone, role: role as never });
        if (!result.ok) { setError(result.error); return; }
        router.refresh();
        onDone(name);
      } catch { setError('The invitation record could not be confirmed. Your entries are still here; refresh before trying again.'); }
      finally { inFlight.current = false; }
    });
  }
  return <ShortletDialog title="Invite team member" onClose={onClose} pending={pending} wide><form className={styles.form} onSubmit={(event) => event.preventDefault()}><p className={styles.text}>Record a team member and their operating role. No real account, authentication permission or WhatsApp invitation is created by this form.</p><label className={styles.field}>Full name<input required aria-label="Name" value={name} disabled={pending} onChange={(event) => setName(event.target.value)} autoFocus className="pb-form-control" placeholder="Full name" /></label><div className={styles.formGrid}><label className={styles.field}>Phone (WhatsApp)<input aria-label="Phone (WhatsApp)" type="tel" autoComplete="tel" value={phone} disabled={pending} onChange={(event) => setPhone(event.target.value)} className="pb-form-control" placeholder="+234…" /></label><label className={styles.field}>Role<select required aria-label="Role" value={role} disabled={pending || !available.length} onChange={(event) => setRole(event.target.value)} className="pb-form-control">{available.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label></div>{definition ? <div className={styles.notice}><p className={styles.title}>{definition.label}</p><p>{definition.blurb}</p></div> : <p className={styles.text}>No eligible team role is available. An owner cannot be invited through this form.</p>}{error ? <p role="alert" className="text-[14px] text-negative">{error}</p> : null}<ShortletReview pending={pending} disabled={!valid} onCancel={onClose} onSubmit={submit} label="Confirm record invite">Review the name, phone number and intended role above. This records a workspace change only; messages, bank transfers and gateway refunds are not sent by this form.</ShortletReview></form></ShortletDialog>;
}
