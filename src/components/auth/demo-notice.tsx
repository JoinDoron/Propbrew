import { signOut } from '@/server/actions/auth';

export function DemoNotice() {
  return <aside aria-label="Demo account notice" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
    <p><strong className="text-primary">Demo workspace</strong><span className="text-text-2"> · Sample data · View only. Please don’t enter private information.</span></p>
    <form action={signOut}><button type="submit" className="font-medium text-primary underline underline-offset-4">Exit demo</button></form>
  </aside>;
}
