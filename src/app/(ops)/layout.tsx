export default function OpsLayout({ children }: { children: React.ReactNode }) {
  // Each module owns its own server-gated shell. The chooser has no sidebar.
  return children;
}
