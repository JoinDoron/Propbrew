import { ShellFrame } from '@/components/shell-frame';
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <ShellFrame expected="portal">{children}</ShellFrame>;
}
