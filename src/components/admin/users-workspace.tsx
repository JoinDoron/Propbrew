'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Search, UserPlus, Users, ShieldOff, ShieldCheck } from 'lucide-react';
import { Avatar } from '@/components/ui';
import { toneVar, type Tone } from '@/lib/status-tones';
import { setUserStatus } from '@/server/actions/admin-users';

export type UserRow = { id: string; name: string; email: string; tenantLabel: string; roles: { key: string; label: string }[]; status: string; lastActive: string };

const STATUS_TONE: Record<string, Tone> = { active: 'success', invited: 'info', suspended: 'danger' };

export function UsersWorkspace({ users }: { users: UserRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  const roles = useMemo(() => ['all', ...Array.from(new Set(users.flatMap((u) => u.roles.map((r) => r.label))))], [users]);
  const filtered = useMemo(() => users.filter((u) =>
    (role === 'all' || u.roles.some((r) => r.label === role)) &&
    (status === 'all' || u.status === status) &&
    (!q.trim() || `${u.name} ${u.email} ${u.tenantLabel}`.toLowerCase().includes(q.toLowerCase())),
  ), [users, role, status, q]);

  const counts = { active: users.filter((u) => u.status === 'active').length, invited: users.filter((u) => u.status === 'invited').length, suspended: users.filter((u) => u.status === 'suspended').length };
  const toggle = (u: UserRow) => start(async () => {
    const next = u.status === 'suspended' ? 'active' : 'suspended';
    const r = await setUserStatus(u.id, next);
    if (r.ok) { router.refresh(); flash(`${u.name} ${next === 'suspended' ? 'suspended' : 'reactivated'}.`); } else flash(r.error);
  });

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-3 gap-2.5">
        <Kpi label="Active" value={String(counts.active)} tone="success" icon={<Users size={16} />} />
        <Kpi label="Invited" value={String(counts.invited)} tone="info" icon={<UserPlus size={16} />} />
        <Kpi label="Suspended" value={String(counts.suspended)} tone={counts.suspended ? 'danger' : 'neutral'} icon={<ShieldOff size={16} />} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 h-9 px-3 rounded-xl border border-border-2 bg-surface flex-1 min-w-[160px]">
          <Search size={15} className="text-text-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search users…" className="flex-1 bg-transparent outline-none text-[13px]" aria-label="Search users" />
        </div>
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role" className="h-9 px-2 rounded-xl border border-border-2 bg-surface text-[12.5px] outline-none focus:border-primary">
          {roles.map((r) => <option key={r} value={r}>{r === 'all' ? 'All roles' : r}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" className="h-9 px-2 rounded-xl border border-border-2 bg-surface text-[12.5px] outline-none focus:border-primary">
          {['all', 'active', 'invited', 'suspended'].map((s) => <option key={s} value={s}>{s === 'all' ? 'All statuses' : s}</option>)}
        </select>
      </div>

      <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead><tr>{['User', 'Tenant', 'Roles', 'Status', 'Last active', ''].map((h, i) => <th key={h || i} className={`text-left text-[10.5px] font-semibold tracking-[0.06em] uppercase text-text-3 px-4 py-2.5 border-b border-border whitespace-nowrap ${i === 4 ? 'max-[720px]:hidden' : ''}`}>{h}</th>)}</tr></thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-2.5 border-b border-border"><div className="flex items-center gap-2.5"><Avatar name={u.name} size={30} /><div><div className="text-[13px] font-medium">{u.name}</div><div className="text-[11.5px] text-text-3">{u.email}</div></div></div></td>
                  <td className="px-4 py-2.5 border-b border-border text-[13px]">{u.tenantLabel}</td>
                  <td className="px-4 py-2.5 border-b border-border"><div className="flex flex-wrap gap-1">{u.roles.map((r) => <span key={r.key} className="text-[11px] px-1.5 py-0.5 rounded bg-surface-3 text-text-2">{r.label}</span>)}</div></td>
                  <td className="px-4 py-2.5 border-b border-border"><span className="text-[11px] font-semibold px-2 h-6 inline-flex items-center rounded-full capitalize" style={{ background: `color-mix(in srgb, ${toneVar(STATUS_TONE[u.status] ?? 'neutral')} 14%, transparent)`, color: toneVar(STATUS_TONE[u.status] ?? 'neutral') }}>{u.status}</span></td>
                  <td className="px-4 py-2.5 border-b border-border text-[12.5px] text-text-3 max-[720px]:hidden">{u.lastActive}</td>
                  <td className="px-4 py-2.5 border-b border-border text-right">
                    <button disabled={pending} onClick={() => toggle(u)} className={`text-[11.5px] px-2.5 h-7 rounded-lg font-medium disabled:opacity-50 inline-flex items-center gap-1 ${u.status === 'suspended' ? 'text-positive border border-[color:var(--tone-success)]/40' : 'text-negative border border-[color:var(--tone-danger)]/40'}`}>
                      {u.status === 'suspended' ? <><ShieldCheck size={12} /> Reactivate</> : <><ShieldOff size={12} /> Suspend</>}
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-[13px] text-text-3">No users match.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: Tone; icon: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5">
      <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span>
      <div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div>
      <div className="text-[19px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div>
    </div>
  );
}
