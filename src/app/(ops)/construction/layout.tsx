import { ShellFrame } from '@/components/shell-frame';

export default function ConstructionLayout({ children }: { children: React.ReactNode }) {
  return <ShellFrame expected="ops" workspace="construction">{children}</ShellFrame>;
}
