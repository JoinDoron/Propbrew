'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, X, Shield, Check, Minus, Eye, Trash2, Crown } from 'lucide-react';
import { Avatar } from '@/components/ui';
import { toneVar, type Tone } from '@/lib/status-tones';
import { inviteMember, setMemberRole, removeMember } from '@/server/actions/shortlet';

export type MemberRow = { id: string; name: string; phone: string; role: string; status: string; lastActive: string };
export type RoleDef = { key: string; label: string; blurb: string };

const PERM_TONE: Record<string, Tone> = { manage: 'success', view: 'info', none: 'muted' };
const STATUS_TONE: Record<string, Tone> = { active: 'success', invited: 'warn' };

export function TeamWorkspace({ members, roles, modules, matrix }: { members: MemberRow[]; roles: RoleDef[]; modules: string[]; matrix: Record<string, Record<string, string>> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [inviting, setInviting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  const changeRole = (id: string, role: string, name: string) => start(async () => { const r = await setMemberRole(id, role as never); if (r.ok) { router.refresh(); flash(`${name} is now ${role}`); } else flash(r.error); });
  const remove = (id: string, name: string) => start(async () => { const r = await removeMember(id); if (r.ok) { router.refresh(); flash(`${name} removed`); } else flash(r.error); });

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <div className="text-[12px] text-text-3">Invite housekeepers, managers and accountants — each sees only what their role allows (FR-TM). Financials are restricted by default.</div>
        <button onClick={() => setInviting(true)} className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-primary text-white text-[13px] font-medium shadow-sm hover:brightness-105 flex-none ml-3"><UserPlus size={16} /> Invite</button>
      </div>

      {/* Members */}
      <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border text-[12.5px] font-semibold">Team members</div>
        <div className="divide-y divide-border">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={m.name} size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5"><span className="text-[13px] font-semibold truncate">{m.name}</span>{m.role === 'owner' && <Crown size={11} className="text-warning" />}<span className="text-[10px] font-semibold px-1.5 h-5 inline-flex items-center rounded-full capitalize" style={{ background: `color-mix(in srgb, ${toneVar(STATUS_TONE[m.status] ?? 'neutral')} 14%, transparent)`, color: toneVar(STATUS_TONE[m.status] ?? 'neutral') }}>{m.status}</span></div>
                <div className="text-[11.5px] text-text-3">{m.phone} · last active {m.lastActive}</div>
              </div>
              {m.role === 'owner' ? (
                <span className="text-[12px] font-medium text-text-3 flex-none">Owner</span>
              ) : (
                <>
                  <select value={m.role} disabled={pending} onChange={(e) => changeRole(m.id, e.target.value, m.name)} className="h-8 px-2 rounded-lg border border-border-2 bg-surface text-[12px] capitalize flex-none">
                    {roles.filter((r) => r.key !== 'owner').map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                  </select>
                  <button disabled={pending} onClick={() => remove(m.id, m.name)} className="w-8 h-8 rounded-lg grid place-items-center text-text-3 hover:text-negative flex-none" aria-label="Remove"><Trash2 size={15} /></button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Permission matrix */}
      <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><Shield size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Role permissions</span></div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm min-w-[560px]">
            <thead>
              <tr>
                <th className="text-left text-[10.5px] font-semibold uppercase text-text-3 px-4 py-2.5 border-b border-border">Module</th>
                {roles.map((r) => <th key={r.key} className="text-center text-[10.5px] font-semibold uppercase text-text-3 px-2 py-2.5 border-b border-border">{r.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {modules.map((mod) => (
                <tr key={mod} className="hover:bg-surface-2">
                  <td className="px-4 py-2 border-b border-border text-[12.5px] font-medium">{mod}</td>
                  {roles.map((r) => {
                    const lvl = matrix[r.key]?.[mod] ?? 'none';
                    return (
                      <td key={r.key} className="px-2 py-2 border-b border-border text-center">
                        <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-1.5 h-5 rounded capitalize" style={{ background: `color-mix(in srgb, ${toneVar(PERM_TONE[lvl])} 13%, transparent)`, color: toneVar(PERM_TONE[lvl]) }}>
                          {lvl === 'manage' ? <Check size={10} /> : lvl === 'view' ? <Eye size={10} /> : <Minus size={10} />}{lvl}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 text-[10.5px] text-text-3 border-t border-border">Housekeepers are limited to inspections + calendar; accountants to financials + analytics. RBAC is enforced server-side (NFR-05).</div>
      </div>

      {inviting && <InviteDialog roles={roles} onClose={() => setInviting(false)} onDone={(n) => { setInviting(false); flash(`Invite sent to ${n}`); }} />}
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function InviteDialog({ roles, onClose, onDone }: { roles: RoleDef[]; onClose: () => void; onDone: (name: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [role, setRole] = useState('housekeeper');
  const [error, setError] = useState<string | null>(null);
  const roleDef = roles.find((r) => r.key === role);
  function submit() { setError(null); start(async () => { const r = await inviteMember({ name, phone, role: role as never }); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(name); }); }
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[380px] bg-surface border border-border rounded-2xl shadow-float p-4 animate-[tms-slideup_.2s_ease]">
        <div className="flex items-center justify-between mb-3"><h3 className="text-[15px] font-semibold">Invite team member</h3><button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button></div>
        <label className="lbl3">Name</label><input value={name} onChange={(e) => setName(e.target.value)} autoFocus className="inp3 mb-2" placeholder="Full name" />
        <label className="lbl3">Phone (WhatsApp)</label><input value={phone} onChange={(e) => setPhone(e.target.value)} className="inp3 mb-2" placeholder="+234…" />
        <label className="lbl3">Role</label>
        <select value={role} onChange={(e) => setRole(e.target.value)} className="inp3 capitalize">{roles.filter((r) => r.key !== 'owner').map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select>
        {roleDef && <p className="text-[11px] text-text-3 mt-1.5">{roleDef.blurb}</p>}
        {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
        <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button><button onClick={submit} disabled={pending || !name.trim()} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50">{pending ? 'Sending…' : 'Send invite'}</button></div>
        <style>{`.lbl3{display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-3);margin-bottom:4px}.inp3{width:100%;height:36px;padding:0 10px;border-radius:8px;border:1px solid var(--border-2);background:var(--surface);font-size:13px;outline:none}.inp3:focus{border-color:var(--primary)}`}</style>
      </div>
    </div>
  );
}
