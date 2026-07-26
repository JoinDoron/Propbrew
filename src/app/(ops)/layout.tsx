import { ShellFrame } from '@/components/shell-frame';
export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return <ShellFrame expected="ops">{children}</ShellFrame>;
}
