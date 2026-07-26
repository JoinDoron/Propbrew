'use client';

/** Segmented control (PRD §5.4): "For Your Community" vs "For You". Default is
 *  For Your Community. Client-side only — swaps which quick-action set shows. */

import { useState } from 'react';

export function ContentToggle({ community, forYou }: { community: React.ReactNode; forYou: React.ReactNode }) {
  const [tab, setTab] = useState<'community' | 'you'>('community');
  return (
    <div>
      <div role="tablist" className="inline-flex p-1 rounded-xl bg-surface-2 border border-border mb-3">
        {(
          [
            ['community', 'For Your Community'],
            ['you', 'For You'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key as 'community' | 'you')}
            className={`h-8 px-3.5 rounded-lg text-[12.5px] font-semibold transition-colors ${
              tab === key ? 'bg-surface text-text shadow-card' : 'text-text-3 hover:text-text-2'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div>{tab === 'community' ? community : forYou}</div>
    </div>
  );
}
