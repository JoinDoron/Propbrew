'use client';

/**
 * Resident wallet card (PRD §5.2). Shows available + pending, a per-session
 * balance show/hide toggle, a live refresh, and the Top Up / Pending Charges
 * CTAs. Zero/negative available emphasises Top Up (PRD §7 edge case).
 */

import { useState, useSyncExternalStore, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Plus, RefreshCw, Wallet as WalletIcon } from 'lucide-react';
import type { Money } from '@/domain/primitives';
import { topUpWallet } from '@/server/actions/resident-home';
import { WorkspaceDecisionDialog, type WorkspaceDecision } from '@/components/ui/workspace-decision';
import { portalMoney } from './portal-patterns';

const HIDE_KEY = 'vesta_balance_hidden';
const MASK = '₦ ••••••';
const TOPUP_PRESETS = [5000, 10000, 25000, 50000];

/** Read the per-session balance-hidden flag from sessionStorage, SSR-safe. */
function useBalanceHidden(): [boolean, () => void] {
  const hidden = useSyncExternalStore(
    (cb) => {
      window.addEventListener('vesta:balance-toggle', cb);
      return () => window.removeEventListener('vesta:balance-toggle', cb);
    },
    () => sessionStorage.getItem(HIDE_KEY) === '1',
    () => false, // server snapshot
  );
  const toggle = () => {
    sessionStorage.setItem(HIDE_KEY, hidden ? '0' : '1');
    window.dispatchEvent(new Event('vesta:balance-toggle'));
  };
  return [hidden, toggle];
}

export function WalletCard({
  unitId,
  available,
  pending,
  pendingCount,
}: {
  unitId: string;
  available: Money;
  pending: Money;
  pendingCount: number;
}) {
  const router = useRouter();
  const [hidden, toggleHidden] = useBalanceHidden();
  const [refreshing, startRefresh] = useTransition();
  const [showTopUp, setShowTopUp] = useState(false);
  const [decision, setDecision] = useState<WorkspaceDecision | null>(null);

  const isEmpty = available.minor <= 0;
  const show = (m: Money) => (hidden ? MASK : portalMoney(m.minor, m.currency));

  function topUp(amount: number) {
    if (available.currency !== 'NGN') return;
    setDecision({ title: 'Review demo wallet top-up', record: `${shortUnit(unitId)} · ${portalMoney(amount * 100)}`, description: 'This demonstration credits the application wallet and may clear pending charges automatically. It does not charge a bank account, validate a gateway payment or represent real funds received. Do not use it to record a live customer payment.', confirmLabel: 'Confirm demo wallet credit', action: () => topUpWallet(unitId, amount), onSuccess: () => { setShowTopUp(false); router.refresh(); } });
  }

  return (
    <div className="rounded-xl p-5 relative overflow-hidden shadow-card"
         style={{ background: 'var(--brand-solid)', color: 'var(--on-brand-solid)' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[14px] font-medium">
          <WalletIcon size={15} /> Wallet balance
        </div>
        <div className="flex items-center gap-1">
          <button onClick={toggleHidden} aria-label={hidden ? 'Show balance' : 'Hide balance'} className="pb-icon-action rounded-lg grid place-items-center hover:bg-white/15 focus-visible:outline-white transition">
            {hidden ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <button onClick={() => startRefresh(() => router.refresh())} aria-label="Refresh balance" className="pb-icon-action rounded-lg grid place-items-center hover:bg-white/15 focus-visible:outline-white transition">
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="mt-2 text-[clamp(28px,4vw,40px)] [overflow-wrap:anywhere] font-normal tracking-[-0.04em] leading-tight tabular-nums">{show(available)}</div>

      <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-3 mt-4">
        <div className="rounded-lg bg-black/10 px-3 py-2">
          <div className="text-[12px]">Available</div>
          <div className="text-[15px] font-semibold tabular-nums">{show(available)}</div>
        </div>
        <div className="rounded-lg bg-black/10 px-3 py-2">
          <div className="text-[12px]">Pending charges</div>
          <div className="text-[15px] font-semibold tabular-nums">{show(pending)}</div>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-4">
        <Link
          href="/portal/bills"
          className="flex-1 h-11 rounded-lg grid place-items-center text-[14px] font-medium bg-white/10 hover:bg-white/15 focus-visible:outline-white transition"
        >
          Pending charges{pendingCount > 0 ? ` (${pendingCount})` : ' · ₦0'}
        </Link>
        <button
          onClick={() => setShowTopUp((s) => !s)}
          className={`flex-1 h-11 rounded-lg inline-flex items-center justify-center gap-1.5 text-[13px] font-medium text-[color:var(--brand-solid)] focus-visible:outline-white transition ${
            isEmpty ? 'bg-white hover:brightness-95 ring-2 ring-white/60' : 'bg-white/95 hover:bg-white'
          }`}
        >
          <Plus size={16} /> Top Up
        </button>
      </div>

      {showTopUp && (
        <div className="mt-3 rounded-lg bg-surface p-3 text-text">
          <div className="text-[12px] text-text-3 mb-2">
            Demo credit preview · {shortUnit(unitId)}
            {pending.minor > 0 && <span className="text-text-2"> · clears {portalMoney(pending.minor, pending.currency)} pending first</span>}
          </div>
          <div className="grid grid-cols-1 min-[480px]:grid-cols-4 gap-2">
            {TOPUP_PRESETS.map((a) => (
              <button
                key={a}
                disabled={available.currency !== 'NGN'}
                onClick={() => topUp(a)}
                className="pb-action h-9 rounded-lg border border-border text-[14px] font-semibold hover:bg-surface-2 transition disabled:opacity-50"
              >
                ₦{(a / 1000).toFixed(0)}k
              </button>
            ))}
          </div>
          <p className="mt-3 text-[12px]">Demo ledger only, not a live payment. Non-NGN funding requires verified currency support.</p>
        </div>
      )}
      {decision && <WorkspaceDecisionDialog decision={decision} onClose={() => setDecision(null)} />}
    </div>
  );
}

function shortUnit(unitId: string): string {
  return unitId.replace(/^u-/, '').toUpperCase();
}
