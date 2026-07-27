'use client';

import { useTransition, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Avatar } from '@/components/ui';
import { signInAs } from '@/server/actions/auth';

export type Account = { key: string; name: string; roleSummary: string; tenantLabel: string };

/** Demo sign-in: choose one of the identity presets. Replaced by the real
 *  credential exchange in production; the account list is the dev stand-in. */
export function SignInList({ accounts }: { accounts: Account[] }) {
  const [pending, start] = useTransition();
  const [active, setActive] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1.5">
      {accounts.map((a) => (
        <button
          key={a.key}
          disabled={pending}
          onClick={() => { setActive(a.key); start(() => signInAs(a.key)); }}
          className="flex items-center gap-3 w-full text-left p-2.5 rounded-xl border border-border bg-surface hover:bg-surface-2 hover:border-border-2 transition disabled:opacity-60"
        >
          <Avatar name={a.name} size={38} />
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-semibold truncate">{a.name}</div>
            <div className="text-[11.5px] text-text-3 truncate">{a.roleSummary} · {a.tenantLabel}</div>
          </div>
          {active === a.key && pending ? (
            <span className="text-[11px] text-text-3">Signing in…</span>
          ) : (
            <ChevronRight size={16} className="text-text-3 flex-none" />
          )}
        </button>
      ))}
    </div>
  );
}
