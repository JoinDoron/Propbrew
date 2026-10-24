'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, UserPlus, Users, ShieldOff, ShieldCheck, X } from 'lucide-react';
import { Avatar, Button, Card, CardHeader, EmptyState, IconButton, KpiCard, StatusPill } from '@/components/ui';
import type { Tone } from '@/lib/status-tones';
import { setUserStatus } from '@/server/actions/admin-users';
import { PageTabs } from '@/components/ui/page-tabs';
import { WorkspaceDecisionDialog, type WorkspaceDecision } from '@/components/ui/workspace-decision';
import common from '@/components/ui/workspace-layout.module.css';
import styles from './admin-workspaces.module.css';

export type UserRow = { id: string; name: string; email: string; tenantLabel: string; roles: { key: string; label: string }[]; status: string; lastActive: string };
const STATUS_TONE: Record<string, Tone> = { active: 'success', invited: 'info', suspended: 'danger' };

export function UsersWorkspace({ users, canMutate = false }: { users: UserRow[]; canMutate?: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [decision, setDecision] = useState<WorkspaceDecision | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const roles = [...new Set(users.flatMap((u) => u.roles.map((r) => r.label)))];
  const filtered = users.filter((u) => (role === 'all' || u.roles.some((r) => r.label === role)) && (status === 'all' || u.status === status) && `${u.name} ${u.email} ${u.tenantLabel}`.toLowerCase().includes(query.trim().toLowerCase()));
  function review(user: UserRow) {
    if (!canMutate) return;
    const next = user.status === 'suspended' ? 'active' : 'suspended';
    setDecision({ title: next === 'active' ? 'Review account reactivation' : 'Review account suspension', record: `${user.name} · ${user.tenantLabel}`, description: `Record this account’s status as ${next}. This demonstration changes the application record only; it does not revoke or restore Clerk sessions, enforce sign-in access or change roles. Use the approved identity-provider procedure for actual access changes.`, confirmLabel: `Confirm recorded ${next} status`, action: () => setUserStatus(user.id, next), onSuccess: () => { setFeedback(`${user.name}: status recorded as ${next}. Identity-provider access has not been changed.`); router.refresh(); } });
  }
  return <div className={common.layout}>
    <PageTabs label="Platform user sections" items={[
      { id: 'users', label: 'User register', content: <Card padded={false} className={common.panel}>
        <div className={common.registerHeader}><CardHeader title="Users & roles" subtitle="Review identities, assigned roles and the account state recorded for each organisation." action={!canMutate ? <StatusPill status="Read-only" tone="muted" /> : undefined} />
          <div className={`${common.toolbar} pb-register-toolbar`}><label className={common.search}><Search size={16} /><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search users or organisations…" aria-label="Search users" /></label><div className={common.filters}>
            <select className={common.select} value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role"><option value="all">All roles</option>{roles.map((r) => <option key={r}>{r}</option>)}</select>
            <select className={common.select} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">{['all', 'active', 'invited', 'suspended'].map((s) => <option key={s} value={s}>{s === 'all' ? 'All statuses' : s}</option>)}</select>
          </div></div>
        </div>
        {filtered.length ? <div className="pb-table-scroll" role="region" aria-label="Platform user register" tabIndex={0}><table className={`pb-data-table ${common.table}`}><thead><tr>{['User', 'Organisation', 'Roles', 'Status', 'Last active', 'Account action'].map((h) => <th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{filtered.map((u) => <tr key={u.id}>
          <td><div className={common.person}><Avatar name={u.name} size={36} /><div><span className={common.title}>{u.name}</span><span className={common.metadata}>{u.email}</span></div></div></td><td>{u.tenantLabel}</td><td><div className={styles.level}>{u.roles.map((r) => <StatusPill key={r.key} status={r.label} tone="neutral" />)}</div></td><td><StatusPill status={u.status} tone={STATUS_TONE[u.status] ?? 'neutral'} /></td><td>{u.lastActive || 'Not recorded'}</td><td>{canMutate ? <Button type="button" onClick={() => review(u)} icon={u.status === 'suspended' ? <ShieldCheck size={16} /> : <ShieldOff size={16} />} aria-label={`Review ${u.status === 'suspended' ? 'reactivation' : 'suspension'} for ${u.name}`}>{u.status === 'suspended' ? 'Reactivate' : 'Suspend'}</Button> : <span className={common.metadata}>Read-only</span>}</td>
        </tr>)}</tbody></table></div> : <EmptyState title="No users match." description="Try another name, role or account status." />}
        <p className={common.registerFooter}>Showing {filtered.length} of {users.length} accounts. Changing a status does not change role assignments.</p>
      </Card> },
      { id: 'overview', label: 'Overview', content: <div className={common.layout}><div className={common.grid}><KpiCard label="Active" value={String(users.filter((u) => u.status === 'active').length)} icon={<Users size={18} />} /><KpiCard label="Invited" value={String(users.filter((u) => u.status === 'invited').length)} icon={<UserPlus size={18} />} /><KpiCard label="Suspended" value={String(users.filter((u) => u.status === 'suspended').length)} icon={<ShieldOff size={18} />} /></div><Card><CardHeader title="Access policy" subtitle="Assigned roles and record scope are checked independently." /><p className={common.body}>Review the organisation and existing roles before reactivating an account. This register does not grant new roles or provision an identity-provider account.</p></Card></div> },
    ]} />
    {feedback && <div role="status" className={common.feedback}><span>{feedback}</span><IconButton type="button" aria-label="Dismiss account update" onClick={() => setFeedback(null)}><X size={18} /></IconButton></div>}
    {decision && <WorkspaceDecisionDialog decision={decision} onClose={() => setDecision(null)} />}
  </div>;
}
