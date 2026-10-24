import { ShellFrame } from '@/components/shell-frame';

export default function FacilityLayout({ children }: { children: React.ReactNode }) {
  return <ShellFrame expected="ops" workspace="facility">{children}</ShellFrame>;
}
