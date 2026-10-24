import { ShellFrame } from '@/components/shell-frame';
import { ConstructionSnapshotProvider } from '@/components/construction/construction-ui';
import { operatingClock } from '@/server/operating-clock';

export default function ConstructionLayout({ children }: { children: React.ReactNode }) {
  return <ShellFrame expected="ops" workspace="construction"><ConstructionSnapshotProvider snapshot={operatingClock()}>{children}</ConstructionSnapshotProvider></ShellFrame>;
}
