import { ShellFrame } from '@/components/shell-frame';

export default function ShortletLayout({ children }: { children: React.ReactNode }) {
  return <ShellFrame expected="ops" workspace="shortlet">{children}</ShellFrame>;
}
