import { redirect } from 'next/navigation';
import { getActor, devIdentityEnabled, getDevIdentity } from '@/server/session';
import { shellFor, homeRouteFor, type Shell } from '@/config/shells';
import { visibleNav } from '@/config/nav';
import { ROLE_LABELS } from '@/lib/authz';
import { AppShell, type ShellIdentity } from '@/components/app-shell';
import { RoleSwitcher } from '@/components/dev/role-switcher';

/**
 * Server frame for an authenticated route group. Derives the actor, confirms it
 * belongs in THIS shell (bouncing it home otherwise so a resident can never land
 * on the ops dashboard), builds the capability-gated nav, and renders the client
 * AppShell. The per-page capability guard (`requireCapability`) is layered on top
 * inside each page.
 */
export async function ShellFrame({
  expected,
  children,
}: {
  expected: Shell;
  children: React.ReactNode;
}) {
  const actor = await getActor();
  const shell = shellFor(actor);
  if (shell !== expected) redirect(homeRouteFor(actor));

  const groups = visibleNav(shell, actor);

  let identity: ShellIdentity;
  let devKey: string | null = null;
  if (devIdentityEnabled()) {
    const dev = await getDevIdentity();
    identity = { name: dev.label.split(' — ')[1] ?? dev.label, roleSummary: dev.roleSummary, tenantLabel: dev.tenantLabel };
    devKey = dev.key;
  } else {
    identity = {
      name: actor.userId,
      roleSummary: actor.roles.map((r) => ROLE_LABELS[r]).join(' + '),
      tenantLabel: actor.tenantId ?? 'Platform',
    };
  }

  return (
    <AppShell
      groups={groups}
      identity={identity}
      devSwitcher={devKey ? <RoleSwitcher currentKey={devKey} /> : undefined}
    >
      {children}
    </AppShell>
  );
}
