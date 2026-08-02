'use client';

/**
 * Application shell — collapsible sidebar, sticky header, mobile drawer.
 *
 * A 248px sidebar that collapses to a 72px icon rail, a 64px header, and a fixed
 * off-canvas drawer below 880px. Nav and identity are computed on the server
 * (getActor → visibleNav) and passed in as serializable data; this component
 * only renders and handles interactivity.
 */

import { useCallback, useEffect, useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, LogOut, Menu, Moon, Search, Sun, Truck } from 'lucide-react';
import { brand } from '@/config/brand';
import { PAGE_META, type NavGroup } from '@/config/nav';
import { useTheme } from '@/components/theme-provider';
import { Icon } from '@/components/icon';
import { Avatar, IconButton } from '@/components/ui';
import { NotificationsMenu } from '@/components/inbox/notifications-menu';
import { MessagesMenu } from '@/components/inbox/messages-menu';
import { SyncIndicator } from '@/components/sync/sync-indicator';
import { ProfileMenu } from '@/components/inbox/profile-menu';
import { signOut } from '@/server/actions/auth';
import type { Notification, Thread } from '@/server/data/inbox';

const SIDEBAR_WIDTH = 248;
const SIDEBAR_COLLAPSED = 72;

export type ShellIdentity = {
  name: string;
  roleSummary: string;
  tenantLabel: string;
};

export function AppShell({
  groups,
  identity,
  notifications,
  unreadNotifications,
  threads,
  unreadMessages,
  devSwitcher,
  children,
}: {
  groups: NavGroup[];
  identity: ShellIdentity;
  notifications: Notification[];
  unreadNotifications: number;
  threads: Thread[];
  unreadMessages: number;
  devSwitcher?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [signingOut, startSignOut] = useTransition();

  const meta = PAGE_META[pathname] ?? { title: brand.name, subtitle: '' };
  const showLabels = !collapsed;

  const handleKey = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      document.getElementById('global-search')?.focus();
    }
    if (e.key === 'Escape') setMobileNav(false);
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-app text-text">
      {mobileNav && (
        <div
          onClick={() => setMobileNav(false)}
          className="fixed inset-0 bg-[rgba(10,12,20,.5)] z-[55] min-[880px]:hidden animate-fade"
        />
      )}

      <aside
        style={{ width: collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_WIDTH }}
        className={`flex-none flex flex-col bg-surface border-r border-border transition-[width] duration-200
          max-[879px]:fixed max-[879px]:top-0 max-[879px]:left-0 max-[879px]:h-full max-[879px]:z-[60]
          max-[879px]:!w-[264px] max-[879px]:shadow-float
          max-[879px]:transition-transform max-[879px]:duration-200
          ${mobileNav ? 'max-[879px]:translate-x-0' : 'max-[879px]:-translate-x-[102%]'}`}
      >
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-4 h-16 flex-none">
          <span
            className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center flex-none text-white bg-primary"
            style={{ boxShadow: '0 4px 12px var(--primary-weak-2)' }}
          >
            <Truck size={18} />
          </span>
          {showLabels && (
            <div className="flex flex-col leading-none min-w-0">
              <span className="font-bold text-base tracking-[-0.02em] truncate">{brand.name}</span>
              <span className="text-[10px] text-text-3 font-medium tracking-[0.04em] mt-[3px]">
                {brand.tagline}
              </span>
            </div>
          )}
          <IconButton
            bordered={false}
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? 'Expand' : 'Collapse'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="ml-auto !w-[26px] !h-[26px] max-[879px]:hidden"
          >
            <ChevronLeft size={16} className={`transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`} />
          </IconButton>
        </div>

        {/* Search */}
        <div className="px-3 pb-3">
          <button
            onClick={() => document.getElementById('global-search')?.focus()}
            className="w-full flex items-center gap-2.5 h-[38px] px-[11px] border border-border rounded-[10px] bg-surface-2 text-text-3 text-[13px] cursor-pointer hover:bg-surface-3 transition-colors"
          >
            <Search size={15} className="flex-none" />
            {showLabels && (
              <>
                <span className="flex-1 text-left truncate">Search…</span>
                <span className="text-[11px] border border-border-2 rounded-[5px] px-1.5 py-px">⌘K</span>
              </>
            )}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3">
          {groups.map((group) => (
            <div key={group.label}>
              {showLabels && (
                <div className="text-[10.5px] font-semibold tracking-[0.06em] text-text-3 uppercase px-2.5 pt-3.5 pb-1.5">
                  {group.label}
                </div>
              )}
              {group.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    title={item.label}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setMobileNav(false)}
                    className={`w-full flex items-center gap-[11px] h-10 px-2.5 mb-0.5 rounded-[10px] text-[13.5px] font-medium transition-colors duration-150 ${
                      active ? 'bg-primary-weak text-primary' : 'text-text-2 hover:bg-surface-2'
                    }`}
                  >
                    <Icon name={item.icon} className={`flex-none ${active ? 'text-primary' : 'text-text-3'}`} />
                    {showLabels && <span className="flex-1 truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Identity footer */}
        <div className="p-3 border-t border-border mt-1">
          {devSwitcher}
          <div className="flex items-center gap-2.5 p-1.5 rounded-[10px]">
            <Avatar name={identity.name} />
            {showLabels && (
              <>
                <div className="flex-1 min-w-0 leading-tight">
                  <div className="font-semibold text-[13px] truncate">{identity.name}</div>
                  <div className="text-[11px] text-text-3 truncate">{identity.roleSummary}</div>
                </div>
                <IconButton
                  bordered={false}
                  title="Sign out"
                  aria-label="Sign out"
                  disabled={signingOut}
                  onClick={() => startSignOut(async () => { await signOut(); })}
                  className="!w-8 !h-8 flex-none hover:!text-negative"
                >
                  <LogOut size={16} />
                </IconButton>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <header className="h-16 flex-none border-b border-border bg-surface flex items-center px-4 sm:px-6 gap-2 sm:gap-4">
          <IconButton
            onClick={() => setMobileNav(true)}
            title="Menu"
            aria-label="Open menu"
            className="min-[880px]:!hidden"
          >
            <Menu size={18} />
          </IconButton>

          <div className="flex-1 min-w-0">
            <h1 className="text-[16px] sm:text-[18px] font-semibold tracking-[-0.02em] leading-tight truncate">
              {meta.title}
            </h1>
            <p className="text-[12.5px] text-text-3 mt-0.5 truncate max-[879px]:hidden">{meta.subtitle}</p>
          </div>

          <label htmlFor="global-search" className="sr-only">
            Search
          </label>
          <input
            id="global-search"
            placeholder="Search…"
            className="hidden lg:block w-56 h-[38px] px-3 rounded-[10px] border border-border bg-surface-2 text-[13px] outline-none focus:border-primary transition-colors"
          />

          <SyncIndicator />

          <IconButton onClick={toggleTheme} title="Toggle theme" aria-label="Toggle theme">
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </IconButton>
          <div className="max-[560px]:hidden">
            <MessagesMenu threads={threads} unread={unreadMessages} />
          </div>
          <NotificationsMenu notifications={notifications} unread={unreadNotifications} />
          <ProfileMenu name={identity.name} roleSummary={identity.roleSummary} tenantLabel={identity.tenantLabel} />
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-6 pt-[22px] pb-10">{children}</main>
      </div>
    </div>
  );
}
