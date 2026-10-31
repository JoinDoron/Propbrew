import type { Metadata } from 'next';
import { publicTransmittal } from '@/server/construction/transmittal-delivery';

export const metadata: Metadata = { title: 'Acknowledge construction document | Propbrew', robots: { index: false, follow: false }, referrer: 'no-referrer' };

export default async function AcknowledgePage({ searchParams }: { searchParams: Promise<{ token?: string; done?: string }> }) {
  const params = await searchParams;
  let issue: Awaited<ReturnType<typeof publicTransmittal>> = null;
  try { issue = params.token ? await publicTransmittal(params.token) : null; } catch { issue = null; }
  return <main className="pb-app min-h-screen bg-app px-4 py-12 text-text"><section className="mx-auto max-w-lg rounded-2xl border border-border bg-surface p-8 shadow-card">
    <p className="mb-5 text-sm font-semibold text-primary">Propbrew · construction document control</p>
    {!issue ? <><h1 className="text-2xl font-semibold">Link unavailable</h1><p className="mt-3 text-text-2">This acknowledgement link is invalid or has expired. Ask the project team for a new transmittal.</p></> : <>
      <h1 className="text-2xl font-semibold">Acknowledge receipt</h1>
      <p className="mt-3 text-text-2">Confirm that your organisation received the controlled PDF sent by email. This does not approve its technical content.</p>
      <dl className="my-6 space-y-3 rounded-xl border border-border p-4"><div><dt className="text-sm text-text-2">Project</dt><dd className="font-medium">{issue.projectName}</dd></div><div><dt className="text-sm text-text-2">Drawing</dt><dd className="font-medium">{issue.docNumber} · revision {issue.revision}</dd></div><div><dt className="text-sm text-text-2">Issue purpose</dt><dd className="font-medium">{issue.purpose.replaceAll('_', ' ')}</dd></div><div><dt className="text-sm text-text-2">Issued to</dt><dd className="font-medium">{issue.toParty}</dd></div></dl>
      {issue.acknowledgedISO || params.done === '1' ? <p role="status" className="rounded-xl border border-border bg-surface-2 p-4 font-medium">Receipt acknowledged. The project team can now see the acknowledgement record.</p> : <form action="/api/construction/transmittals/acknowledge" method="post" className="space-y-4">
        <input type="hidden" name="token" value={params.token} />
        <label className="block font-medium">Your full name<input name="name" required minLength={2} maxLength={120} autoComplete="name" className="mt-2 block min-h-11 w-full rounded-lg border border-border bg-surface-2 px-3" /></label>
        <label className="block font-medium">Organisation<input name="organisation" required minLength={2} maxLength={120} autoComplete="organization" className="mt-2 block min-h-11 w-full rounded-lg border border-border bg-surface-2 px-3" /></label>
        <label className="flex items-start gap-3"><input name="confirmed" type="checkbox" value="yes" required className="mt-1 h-5 w-5" /><span>I confirm receipt of the emailed PDF.</span></label>
        <button type="submit" className="min-h-11 w-full rounded-lg bg-primary px-4 font-semibold text-on-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Acknowledge receipt</button>
      </form>}
    </>}
  </section></main>;
}
