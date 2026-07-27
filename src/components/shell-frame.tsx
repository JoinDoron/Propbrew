import { redirect } from 'next/navigation';
import { getSession, devIdentityEnabled } from '@/server/session';
import { shellFor, homeRouteFor, type Shell } from '@/config/shells';
import { visibleNav } from '@/config/nav';
import { getNotifications, unreadNotificationCount, getThreads, unreadThreadCount } from '@/server/data/inbox';
import { AppShell, type ShellIdentity } from '@/components/app-shell';
import { RoleSwitcher } from '@/components/dev/role-switcher';

/**
 * Server frame for an authenticated route group. Redirects to /login when there
 * is no session; confirms the actor belongs in THIS shell (bouncing it home
 * otherwise so a resident can never land on the ops dashboard); builds the
 * capability-gated nav and the inbox; and renders the client AppShell. The
 * per-page capability guard (`requireCapability`) is layered on top inside pages.
 */
export async function ShellFrame({ expected, children }: { expected: Shell; children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  const actor = session.actor;

  const shell = shellFor(actor);
  if (shell !== expected) redirect(homeRouteFor(actor));

  const groups = visibleNav(shell, actor);

  const identity: ShellIdentity = {
    name: session.label.split(' — ')[1] ?? session.label,
    roleSummary: session.roleSummary,
    tenantLabel: session.tenantLabel,
  };

  const notifications = getNotifications(actor.userId, actor.roles);
  const unreadNotifications = unreadNotificationCount(actor.userId, actor.roles);
  const threads = getThreads(actor.userId, actor.roles);
  const unreadMessages = unreadThreadCount(actor.userId, actor.roles);

  return (
    <AppShell
      groups={groups}
      identity={identity}
      notifications={notifications}
      unreadNotifications={unreadNotifications}
      threads={threads}
      unreadMessages={unreadMessages}
      devSwitcher={devIdentityEnabled() ? <RoleSwitcher currentKey={session.key} /> : undefined}
    >
      {children}
    </AppShell>
  );
}
