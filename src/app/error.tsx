'use client';

import { useEffect } from 'react';
import { AlertCircle } from 'lucide-react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="pb-app pb-state">
      <div className="pb-state-card">
      <span className="pb-state-icon"><AlertCircle size={24} aria-hidden="true" /></span>
      <p className="text-[13px] text-negative">Something went wrong</p>
      <h1 className="pb-state-title">We couldn’t load this workspace</h1>
      <p className="pb-state-copy">Try again, or return to your dashboard to continue.</p>
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" className="pb-action bg-primary" onClick={() => reset()}>Try again</button>
        <a className="pb-action border border-border text-text-2" href="/dashboard">Dashboard</a>
      </div>
      </div>
    </main>
  );
}
