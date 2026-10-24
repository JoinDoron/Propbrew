'use client';

/** Segmented control (PRD §5.4): "For Your Community" vs "For You". Default is
 *  For Your Community. Client-side only — swaps which quick-action set shows. */

import { PageTabs } from '@/components/ui/page-tabs';

export function ContentToggle({ community, forYou }: { community: React.ReactNode; forYou: React.ReactNode }) {
  return (
    <PageTabs label="Resident content sections" items={[
      { id: 'community', label: 'For Your Community', content: community },
      { id: 'you', label: 'For You', content: forYou },
    ]} />
  );
}
