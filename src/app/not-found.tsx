import { SearchX } from 'lucide-react';

export default function NotFound() {
  return <main className="pb-app pb-state"><div className="pb-state-card"><span className="pb-state-icon"><SearchX size={24} aria-hidden="true" /></span><p className="text-[13px] text-text-3">404</p><h1 className="pb-state-title">That page is not available</h1><p className="pb-state-copy">The link may be outdated or you may not have access to this workspace.</p><a className="pb-action bg-primary" href="/dashboard">Return to dashboard</a></div></main>;
}
