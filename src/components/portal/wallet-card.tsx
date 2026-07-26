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
import { formatMoney } from '@/components/domain';
import type { Money } from '@/domain/primitives';
import { topUpWallet } from '@/server/actions/resident-home';

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
  const [toppingUp, startTopUp] = useTransition();
  const [showTopUp, setShowTopUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEmpty = available.minor <= 0;
  const show = (m: Money) => (hidden ? MASK : formatMoney(m));

  function topUp(amount: number) {
    setError(null);
    startTopUp(async () => {
      const r = await topUpWallet(unitId, amount);
      if (!r.ok) setError(r.error);
      else {
        setShowTopUp(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-[20px] p-5 text-white bg-gradient-to-br from-primary to-[color:var(--primary)] relative overflow-hidden shadow-float"
         style={{ backgroundImage: 'linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 70%, #000))' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-white/80 text-[12.5px] font-medium">
          <WalletIcon size={15} /> Wallet balance
        </div>
        <div className="flex items-center gap-1">
          <button onClick={toggleHidden} aria-label={hidden ? 'Show balance' : 'Hide balance'} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-white/15 transition">
            {hidden ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <button onClick={() => startRefresh(() => router.refresh())} aria-label="Refresh balance" className="w-8 h-8 rounded-lg grid place-items-center hover:bg-white/15 transition">
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="mt-2 text-[30px] font-bold tracking-[-0.02em] tabular-nums">{show(available)}</div>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className="rounded-xl bg-white/12 px-3 py-2">
          <div className="text-[11px] text-white/70">Available</div>
          <div className="text-[15px] font-semibold tabular-nums">{show(available)}</div>
        </div>
        <div className="rounded-xl bg-white/12 px-3 py-2">
          <div className="text-[11px] text-white/70">Pending charges</div>
          <div className="text-[15px] font-semibold tabular-nums">{hidden ? MASK : formatMoney(pending)}</div>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-4">
        <Link
          href="/portal/bills"
          className="flex-1 h-11 rounded-xl grid place-items-center text-[13px] font-semibold bg-white/15 hover:bg-white/25 transition"
        >
          Pending charges{pendingCount > 0 ? ` (${pendingCount})` : ' · ₦0'}
        </Link>
        <button
          onClick={() => setShowTopUp((s) => !s)}
          className={`flex-1 h-11 rounded-xl inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold transition ${
            isEmpty ? 'bg-white text-primary hover:brightness-95 ring-2 ring-white/60' : 'bg-white/90 text-primary hover:bg-white'
          }`}
        >
          <Plus size={16} /> Top Up
        </button>
      </div>

      {showTopUp && (
        <div className="mt-3 rounded-xl bg-white/95 p-3 text-text">
          <div className="text-[12px] text-text-3 mb-2">
            Add funds to {shortUnit(unitId)}
            {pending.minor > 0 && <span className="text-text-2"> · clears {formatMoney(pending)} pending first</span>}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {TOPUP_PRESETS.map((a) => (
              <button
                key={a}
                disabled={toppingUp}
                onClick={() => topUp(a)}
                className="h-9 rounded-lg border border-border text-[12.5px] font-semibold hover:bg-surface-2 transition disabled:opacity-50"
              >
                ₦{(a / 1000).toFixed(0)}k
              </button>
            ))}
          </div>
          {error && <div className="text-[11.5px] text-negative mt-2">{error}</div>}
          {toppingUp && <div className="text-[11.5px] text-text-3 mt-2">Processing payment…</div>}
        </div>
      )}
    </div>
  );
}

function shortUnit(unitId: string): string {
  return unitId.replace(/^u-/, '').toUpperCase();
}
