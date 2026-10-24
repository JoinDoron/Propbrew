'use client';

import { useId, useRef, useTransition } from 'react';
import Link from 'next/link';
import { ChevronRight, LogOut } from 'lucide-react';
import { Avatar } from '@/components/ui';
import { Icon } from '@/components/icon';
import type { Workspace } from '@/config/workspaces';
import { Popover } from './popover';
import { signOut } from '@/server/actions/auth';

export function ProfileMenu({ name, roleSummary, tenantLabel, workspace }: {
  name: string;
  roleSummary: string;
  tenantLabel: string;
  workspace?: Pick<Workspace, 'id' | 'name' | 'icon'>;
}) {
  const [pending, start] = useTransition();
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  return (
    <Popover
      width={260}
      trigger={({ open, toggle }) => (
        <button
          ref={trigger}
          type="button"
          onClick={toggle}
          aria-label="Account menu"
          aria-expanded={open}
          aria-controls={panelId}
          className="flex items-center gap-2.5 h-[38px] pl-[3px] pr-3 border border-border rounded-[20px] bg-surface hover:bg-surface-2 transition-colors max-[560px]:pr-1.5"
        >
          <Avatar name={name} size={30} />
          <span className="font-medium text-sm max-[560px]:hidden">{name.split(' ')[0]}</span>
        </button>
      )}
    >
      {({ close }) => (
        <div id={panelId} onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            close();
            trigger.current?.focus();
          }
        }}>
          <div className="flex items-center gap-3 p-3.5 border-b border-border">
            <Avatar name={name} size={40} />
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold truncate">{name}</div>
              <div className="text-[12px] text-text-3 truncate">{roleSummary}</div>
              <div className="text-[12px] text-text-3 truncate">{tenantLabel}</div>
            </div>
          </div>
          {workspace && (
            <div className="p-1.5 border-b border-border">
              <Link href={`/workspaces?from=${workspace.id}`} onClick={close}
                aria-label={`Switch workspace, current ${workspace.name}`}
                className="flex items-center gap-3 min-h-14 p-3 rounded-lg hover:bg-surface-2 transition-colors">
                <span className="grid place-items-center size-9 shrink-0 rounded-lg bg-primary-weak text-primary" aria-hidden="true">
                  <Icon name={workspace.icon} className="size-[18px]" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium truncate">{workspace.name} workspace</span>
                  <span className="block mt-0.5 text-[12px] text-text-2">Switch workspace</span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-text-2" aria-hidden="true" />
              </Link>
            </div>
          )}
          <div className="p-1.5">
            <button
              type="button"
              onClick={() => start(async () => { close(); await signOut(); })}
              disabled={pending}
              className="flex items-center gap-2.5 w-full text-left px-2.5 py-2 rounded-lg text-sm font-medium text-negative hover:bg-surface-2 transition-colors disabled:opacity-60"
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
