import { notFound, redirect } from 'next/navigation';
import { getSession, devIdentityEnabled } from '@/server/session';
import { shellFor, homeRouteFor, type Shell } from '@/config/shells';
import { visibleNav } from '@/config/nav';
import { getNotifications, unreadNotificationCount, getThreads, unreadThreadCount } from '@/server/data/inbox';
import { AppShell, type ShellIdentity } from '@/components/app-shell';
import { RoleSwitcher } from '@/components/dev/role-switcher';
import { getOwnerIdentity } from '@/server/onboarding/identity';
import { requireOperatorSession } from '@/server/workspaces';
import { canEnterWorkspace, workspaceById, type WorkspaceId } from '@/config/workspaces';
import { can } from '@/lib/authz';
import { withDurableRead } from '@/server/data/durable-records';

/**
 * Server frame for an authenticated route group. Redirects to /login when there
 * is no session; confirms the actor belongs in THIS shell (bouncing it home
 * otherwise so a resident can never land on the ops dashboard); builds the
 * capability-gated nav and the inbox; and renders the client AppShell. The
 * per-page capability guard (`requireCapability`) is layered on top inside pages.
 */
export async function ShellFrame({ expected, workspace, children }: { expected: Shell; workspace?: WorkspaceId; children: React.ReactNode }) {
  return withDurableRead(async () => {
  const session = expected === 'ops' ? await requireOperatorSession() : await getSession();
  if (!session) {
    if (await getOwnerIdentity()) redirect('/onboarding');
    redirect('/login');
  }
  const actor = session.actor;

  const shell = shellFor(actor);
  if (shell !== expected) redirect(homeRouteFor(actor));
  if (expected === 'ops' && (!workspace || !canEnterWorkspace(actor, workspace))) notFound();

  const groups = visibleNav(shell, actor, workspace);

  const identity: ShellIdentity = {
    name: session.key === 'clerk' ? session.label : session.label.split(' — ')[0],
    roleSummary: session.roleSummary,
    tenantLabel: session.tenantLabel,
    outboxOwner: actor.tenantId ? JSON.stringify([actor.tenantId, actor.userId]) : undefined,
  };

  const canReadWorkOrders = can(actor, 'work_orders', 'read').allowed;
  // A shared notification may point at the legacy Facility route. Keep Estate
  // maintenance in its own portal without changing the stored event or grants.
  const notifications = getNotifications(actor.userId, actor.roles).map((notification) => {
    if (workspace !== 'estate' || !notification.href || !/^\/work-orders(?:\/[^/?#]+)?(?:[?#].*)?$/.test(notification.href)) return notification;
    return {
      ...notification,
      href: canReadWorkOrders ? notification.href.replace(/^\/work-orders/, '/estate/work-orders') : undefined,
    };
  });
  const unreadNotifications = unreadNotificationCount(actor.userId, actor.roles);
  const threads = getThreads(actor.userId, actor.roles);
  const unreadMessages = unreadThreadCount(actor.userId, actor.roles);

  return (
    <AppShell
      groups={groups}
      workspace={workspaceById(workspace)}
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
  });
}
