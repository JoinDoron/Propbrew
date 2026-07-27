'use client';

import { useTransition } from 'react';
import { LogOut } from 'lucide-react';
import { Avatar } from '@/components/ui';
import { Popover } from './popover';
import { signOut } from '@/server/actions/auth';

export function ProfileMenu({ name, roleSummary, tenantLabel }: { name: string; roleSummary: string; tenantLabel: string }) {
  const [pending, start] = useTransition();

  return (
    <Popover
      width={260}
      trigger={({ toggle }) => (
        <button
          onClick={toggle}
          aria-label="Account menu"
          className="flex items-center gap-2.5 h-[38px] pl-[3px] pr-3 border border-border rounded-[20px] bg-surface hover:bg-surface-2 transition-colors max-[560px]:pr-1.5"
        >
          <Avatar name={name} size={30} />
          <span className="font-semibold text-[13px] max-[560px]:hidden">{name.split(' ')[0]}</span>
        </button>
      )}
    >
      {({ close }) => (
        <div>
          <div className="flex items-center gap-3 p-3.5 border-b border-border">
            <Avatar name={name} size={40} />
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold truncate">{name}</div>
              <div className="text-[11.5px] text-text-3 truncate">{roleSummary}</div>
              <div className="text-[11px] text-text-3 truncate">{tenantLabel}</div>
            </div>
          </div>
          <div className="p-1.5">
            <button
              onClick={() => start(async () => { close(); await signOut(); })}
              disabled={pending}
              className="flex items-center gap-2.5 w-full text-left px-2.5 py-2 rounded-lg text-[13px] font-medium text-negative hover:bg-surface-2 transition-colors disabled:opacity-60"
            >
              <LogOut size={16} />
              {pending ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      )}
    </Popover>
  );
}
