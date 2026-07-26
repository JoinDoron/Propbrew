import { ShellFrame } from '@/components/shell-frame';
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <ShellFrame expected="admin">{children}</ShellFrame>;
}
