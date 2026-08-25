import { redirect } from 'next/navigation';
import { Building2 } from 'lucide-react';
import { getSession, DEV_IDENTITIES } from '@/server/session';
import { homeRouteFor } from '@/config/shells';
import { brand } from '@/config/brand';
import { SignInList } from '@/components/auth/sign-in-list';

/** The signed-out landing (SC-01 sign-in). Public — not gated. In dev it offers
 *  the identity presets as accounts; production swaps in the real credential UI. */
export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect(homeRouteFor(session.actor));

  const accounts = DEV_IDENTITIES.map((i) => ({
    key: i.key,
    name: i.label.split(' — ')[1] ?? i.label,
    roleSummary: i.roleSummary,
    tenantLabel: i.tenantLabel,
  }));

  return (
    <div className="min-h-screen bg-app text-text flex items-center justify-center p-5">
      <div className="w-full max-w-[420px]">
        <div className="flex items-center gap-2.5 mb-6 justify-center">
          <span className="w-10 h-10 rounded-xl flex items-center justify-center text-white bg-primary" style={{ boxShadow: '0 6px 16px var(--primary-weak-2)' }}>
            <Building2 size={20} />
          </span>
          <div className="leading-none">
            <div className="font-bold text-[18px] tracking-[-0.02em]">{brand.name}</div>
            <div className="text-[10.5px] text-text-3 font-medium tracking-[0.04em] mt-1">{brand.tagline}</div>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-2xl shadow-card p-5 sm:p-6">
          <h1 className="text-[18px] font-semibold tracking-[-0.02em]">Sign in</h1>
          <p className="text-[13px] text-text-3 mt-1 mb-4">
            Choose an account to continue. <span className="text-text-2">Demo</span> — each account is a role from the
            §7 permissions matrix.
          </p>
          <SignInList accounts={accounts} />
        </div>

        <p className="text-center text-[11.5px] text-text-3 mt-4">
          {brand.name} · built for {brand.client}
        </p>
      </div>
    </div>
  );
}
