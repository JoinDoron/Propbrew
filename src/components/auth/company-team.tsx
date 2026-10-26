'use client';

import { useActionState, useId, useState } from 'react';
import { Copy, LockKeyhole, MailPlus, ShieldCheck, Trash2, Users } from 'lucide-react';
import { Avatar, Card, CardHeader, StatusPill } from '@/components/ui';
import { PageHeader } from '@/components/ui/page-header';
import { PortalDialog } from '@/components/portal/portal-dialog';
import type { WorkspaceId } from '@/config/workspaces';
import type { CompanyActionState, CompanyFormAction } from './company-chooser';
import shared from '@/components/ui/workspace-layout.module.css';
import styles from './auth.module.css';

export type CompanyMember = {
  id: string; userId: string; name: string; email: string;
  companyRole: 'owner' | 'admin' | 'member';
  modules: Partial<Record<WorkspaceId, 'manage' | 'view'>>;
  facilityRole?: 'manager' | 'technician' | 'vendor' | null;
  vendorOrgId?: string | null;
  isCurrentUser: boolean;
};
const MODULES: { id: WorkspaceId; label: string; detail: string }[] = [
  { id: 'estate', label: 'Estate', detail: 'Properties, residents and community operations' },
  { id: 'facility', label: 'Facility', detail: 'Assets, maintenance and site operations' },
  { id: 'shortlet', label: 'Shortlet', detail: 'Guests, bookings and stay operations' },
  { id: 'construction', label: 'Construction', detail: 'Projects, procurement and delivery' },
];

export type VendorOption = { id: string; name: string };

export function CompanyTeam({ companyName, members, vendors = [], canManage, createCompanyInvite, updateCompanyMember, removeCompanyMember }: { companyName: string; members: CompanyMember[]; vendors?: VendorOption[]; canManage: boolean; createCompanyInvite: CompanyFormAction; updateCompanyMember: CompanyFormAction; removeCompanyMember: CompanyFormAction }) {
  const [invite, setInvite] = useState(false);
  return <div className={`pb-page ${shared.layout}`}><PageHeader title="Team & access" subtitle={`The people and workspace permissions in ${companyName}.`} actions={canManage ? <button type="button" className={styles.primary} onClick={() => setInvite(true)}><MailPlus size={17} aria-hidden="true" />Invite teammate</button> : undefined} />
    <Card><CardHeader title="Company members" subtitle={`${members.length} member${members.length === 1 ? '' : 's'} · access applies within this company`} action={<Users size={20} className="text-primary" aria-hidden="true" />} /><p className={shared.body}>{canManage ? 'Choose the workspaces each teammate can view or manage. Company administrators can also manage the team.' : 'You can review your company team. An owner or administrator manages membership and workspace access.'}</p></Card>
    <div className={styles.memberList}>{members.map((member) => <MemberCard key={member.id} member={member} vendors={vendors} companyName={companyName} canManage={canManage} update={updateCompanyMember} remove={removeCompanyMember} />)}{members.length === 0 && <Card><div className={styles.companyEmpty}><span className={styles.companyIcon}><Users size={24} aria-hidden="true" /></span><h2>No company members to show</h2><p>{canManage ? 'Invite a teammate to give them access to the workspaces they need.' : 'Ask your company administrator to review your membership.'}</p></div></Card>}</div>
    <div className={shared.notice}><ShieldCheck size={18} aria-hidden="true" /><p>Company access stays with the company.<span>Workspace permissions also apply to AI assistance and the records it can use.</span></p></div>
    {invite && <InviteCompanyMember companyName={companyName} vendors={vendors} action={createCompanyInvite} onClose={() => setInvite(false)} />}
  </div>;
}

function MemberCard({ member, vendors, companyName, canManage, update, remove }: { member: CompanyMember; vendors: VendorOption[]; companyName: string; canManage: boolean; update: CompanyFormAction; remove: CompanyFormAction }) {
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const protectedOwner = member.companyRole === 'owner';
  return <Card><div className={styles.memberHeader}><div className={styles.memberIdentity}><Avatar name={member.name || member.email} size={42} /><div><h2>{member.name || 'Company teammate'}{member.isCurrentUser && <span className={styles.you}>You</span>}</h2><p>{member.email}</p></div></div><StatusPill status={member.companyRole} tone={protectedOwner ? 'info' : 'muted'} /></div><div className={styles.memberModules}>{MODULES.map((module) => <div key={module.id}><span>{module.label}</span><strong>{member.modules[module.id] === 'manage' ? 'Manage' : member.modules[module.id] === 'view' ? 'View' : 'No access'}</strong></div>)}{member.modules.facility === 'manage' && <div><span>Facility duty</span><strong>{member.facilityRole === 'technician' ? 'Field technician' : member.facilityRole === 'vendor' ? vendors.find((vendor) => vendor.id === member.vendorOrgId)?.name ?? 'Vendor team' : 'Facility manager'}</strong></div>}</div>
    {protectedOwner || member.isCurrentUser ? <p className={styles.protected}><LockKeyhole size={14} aria-hidden="true" />{protectedOwner ? 'Owner access is protected.' : 'Another company administrator manages changes to your own access.'}</p> : canManage ? <div className={styles.memberActions}><button type="button" className={styles.secondary} onClick={() => setEditing((value) => !value)} aria-expanded={editing}>{editing ? 'Close access editor' : 'Edit access'}</button><button type="button" className={styles.danger} onClick={() => setRemoving(true)}><Trash2 size={15} aria-hidden="true" />Remove access</button></div> : null}
    {editing && !protectedOwner && canManage && <EditMemberAccess member={member} vendors={vendors} action={update} />}
    {removing && <RemoveCompanyMember member={member} companyName={companyName} action={remove} onClose={() => setRemoving(false)} />}
  </Card>;
}

function FacilityDutyFields({ role = 'manager', vendorOrgId, vendors }: { role?: CompanyMember['facilityRole']; vendorOrgId?: string | null; vendors: VendorOption[] }) {
  const prefix = useId();
  return <fieldset className={styles.grantFields}><legend>Facility field duty</legend><p className={styles.hint}>This narrows Facility manage access to the person&apos;s actual responsibility. Technicians and vendor users cannot simultaneously manage another workspace.</p><div className={styles.grantGrid}><div className={styles.field}><label htmlFor={`${prefix}-facility-role`}>Operational role</label><select id={`${prefix}-facility-role`} name="facilityRole" defaultValue={role ?? 'manager'}><option value="manager">Facility manager</option><option value="technician">Field technician</option><option value="vendor">Vendor team member</option></select></div><div className={styles.field}><label htmlFor={`${prefix}-vendor`}>Vendor organisation (vendor role only)</label><select id={`${prefix}-vendor`} name="vendorOrgId" defaultValue={vendorOrgId ?? ''}><option value="">Choose a vendor</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select><p className={styles.hint}>{vendors.length ? 'Vendor users only see work assigned to their organisation.' : 'Onboard the vendor in Facility → Vendors before inviting a vendor user.'}</p></div></div></fieldset>;
}

function ModuleAccessFields({ modules = {}, disabled = false }: { modules?: CompanyMember['modules']; disabled?: boolean }) {
  const prefix = useId();
  return <fieldset className={styles.grantFields} disabled={disabled}><legend>Workspace access</legend><p className={styles.hint}>View reads the workspace records. Manage includes the actions available to that workspace role.</p><div className={styles.grantGrid}>{MODULES.map((module) => <div className={styles.field} key={module.id}><label htmlFor={`${prefix}-${module.id}`}>{module.label}</label><select id={`${prefix}-${module.id}`} name={`module:${module.id}`} defaultValue={modules[module.id] ?? 'none'}><option value="none">No access</option><option value="view">View</option><option value="manage">Manage</option></select><p className={styles.hint}>{module.detail}</p></div>)}</div></fieldset>;
}

function EditMemberAccess({ member, vendors, action }: { member: CompanyMember; vendors: VendorOption[]; action: CompanyFormAction }) {
  const prefix = useId();
  const [state, submit, pending] = useActionState(async (_previous: CompanyActionState, form: FormData) => await action(form) ?? { message: 'Company access saved.' }, {});
  return <form action={submit} className={`${styles.form} ${styles.accessEditor}`} aria-busy={pending}><input type="hidden" name="memberId" value={member.id} />{state.error && <p role="alert" className={styles.error}>{state.error}</p>}{state.message && <p role="status" className={styles.success}>{state.message}</p>}<fieldset className={styles.fieldset} disabled={pending}><legend className="sr-only">Edit access for {member.name || member.email}</legend><div className={styles.field}>{member.isCurrentUser ? <><span className={styles.fieldLabel}>Company role</span><input type="hidden" name="companyRole" value={member.companyRole} /><p className={styles.hint}>Your company role: {member.companyRole}. Ask another owner or administrator to change it.</p></> : <><label htmlFor={`${prefix}-role`}>Company role</label><select id={`${prefix}-role`} name="companyRole" defaultValue={member.companyRole}><option value="member">Member</option><option value="admin">Administrator</option></select></>}</div><ModuleAccessFields modules={member.modules} /><FacilityDutyFields role={member.facilityRole} vendorOrgId={member.vendorOrgId} vendors={vendors} /><button type="submit" className={styles.primary} disabled={pending}>{pending ? 'Saving access…' : 'Save company access'}</button></fieldset></form>;
}

function InviteCompanyMember({ companyName, vendors, action, onClose }: { companyName: string; vendors: VendorOption[]; action: CompanyFormAction; onClose: () => void }) {
  const prefix = useId();
  const [state, submit, pending] = useActionState(async (_previous: CompanyActionState, form: FormData) => await action(form) ?? {}, {});
  const [copied, setCopied] = useState('');
  async function copy() {
    if (!state.inviteUrl) return;
    try { await navigator.clipboard.writeText(state.inviteUrl); setCopied('Invitation link copied.'); }
    catch { setCopied('Select the invitation link above and copy it.'); }
  }
  return <PortalDialog label={`Invite a teammate to ${companyName}`} onClose={onClose} canClose={!pending} dismissOnBackdrop={false} width={640}><div className={styles.teamDialog}><header><h2>Invite a teammate</h2><p>Choose access to {companyName}, then share a private invitation link.</p></header>{state.inviteUrl ? <div className={styles.form}><p role="status" className={styles.success}>Your invitation link is ready.</p><div className={styles.field}><label htmlFor={`${prefix}-link`}>Private invitation link</label><input id={`${prefix}-link`} readOnly value={state.inviteUrl} onFocus={(event) => event.target.select()} /><p className={styles.hint}>Share this link directly with the invited teammate. They must sign in with the invited email address to accept.</p></div><button type="button" className={styles.primary} onClick={copy}><Copy size={16} aria-hidden="true" />Copy invitation link</button><p role="status" className={styles.hint}>{copied}</p><button type="button" className={styles.secondary} onClick={onClose}>Done</button></div> : <form action={submit} className={styles.form} aria-busy={pending}>{state.error && <p role="alert" className={styles.error}>{state.error}</p>}<fieldset className={styles.fieldset} disabled={pending}><legend className="sr-only">Invitation details</legend><div className={styles.field}><label htmlFor={`${prefix}-email`}>Teammate email address</label><input id={`${prefix}-email`} name="email" type="email" required maxLength={254} autoComplete="off" placeholder="teammate@company.com" /></div><div className={styles.field}><label htmlFor={`${prefix}-role`}>Company role</label><select id={`${prefix}-role`} name="companyRole" defaultValue="member"><option value="member">Member</option><option value="admin">Administrator</option></select></div><ModuleAccessFields /><FacilityDutyFields vendors={vendors} /><p className={styles.hint}>Propbrew will create a private invitation link for you to copy and share.</p><div className={styles.memberActions}><button type="button" className={styles.secondary} onClick={onClose} disabled={pending}>Cancel</button><button type="submit" className={styles.primary} disabled={pending}>{pending ? 'Creating invitation…' : 'Create invitation link'}</button></div></fieldset></form>}</div></PortalDialog>;
}

function RemoveCompanyMember({ member, companyName, action, onClose }: { member: CompanyMember; companyName: string; action: CompanyFormAction; onClose: () => void }) {
  const [state, submit, pending] = useActionState(async (_previous: CompanyActionState, form: FormData) => await action(form) ?? { message: 'Company access removed.' }, {});
  return <PortalDialog label="Remove company access" onClose={onClose} canClose={!pending} dismissOnBackdrop={false} width={500}><div className={styles.teamDialog}><header><h2>Remove company access</h2><p>Remove {member.name || member.email}&apos;s access to {companyName} and its workspaces.</p></header><form action={submit} className={styles.form} aria-busy={pending}><input type="hidden" name="memberId" value={member.id} />{state.error && <p role="alert" className={styles.error}>{state.error}</p>}{state.message ? <><p role="status" className={styles.success}>{state.message}</p><button type="button" className={styles.secondary} onClick={onClose}>Done</button></> : <div className={styles.memberActions}><button type="button" className={styles.secondary} onClick={onClose} disabled={pending}>Cancel</button><button type="submit" className={styles.danger} disabled={pending}>{pending ? 'Removing access…' : 'Remove company access'}</button></div>}</form></div></PortalDialog>;
}
