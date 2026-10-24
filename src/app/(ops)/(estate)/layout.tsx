import { ShellFrame } from '@/components/shell-frame';

export default function EstateLayout({ children }: { children: React.ReactNode }) {
  return <ShellFrame expected="ops" workspace="estate">{children}</ShellFrame>;
}
