'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Copy, ExternalLink, Globe, Plus, Sparkles, Ticket, TrendingUp } from 'lucide-react';
import { Button, Card, CardHeader, EmptyState, StatusPill } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import { toggleBookingPage, saveBookingPage, addPromoCode, togglePromoCode } from '@/server/actions/shortlet';
import { ShortletConfirm, ShortletDialog, ShortletFeedback, ShortletNotice, ShortletReview } from './reference-ui';
import { shortletMoney } from './shortlet-format';
import styles from './shortlet-specialists-polish.module.css';

export type PromoCode = { code: string; pct: number; active: boolean };
export type Config = { enabled: boolean; slug: string; cancellationPolicy: string; holdHours: number; promoCodes: PromoCode[] };
export type Funnel = { visits: number; searches: number; views: number; enquiries: number; confirmed: number; conversionPct: number };
export type AptFunnel = { name: string; rateMinor: number; views: number; enquiries: number; confirmed: number; conversionPct: number };
export type PreviewApt = { name: string; type: string; rateMinor: number; property: string };

export function BookingPageWorkspace({ config, funnel, aptFunnels, preview, businessName, canUpdate = false }: { config: Config; funnel: Funnel; aptFunnels: AptFunnel[]; preview: PreviewApt[]; businessName: string; canUpdate?: boolean }) {
  const router = useRouter();
  const [slug, setSlug] = useState(config.slug);
  const [policy, setPolicy] = useState(config.cancellationPolicy);
  const [hold, setHold] = useState(String(config.holdHours));
  const [showPreview, setShowPreview] = useState(false);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const url = 'book.vesta.ng/' + config.slug;
  const validHold = hold.trim() !== '' && Number.isInteger(Number(hold)) && Number(hold) >= 0 && Number(hold) <= 48;
  const stages = [
    { label: 'Page visits', value: funnel.visits, modelled: true },
    { label: 'Date searches', value: funnel.searches, modelled: true },
    { label: 'Apartment views', value: funnel.views, modelled: true },
    { label: 'Enquiries', value: funnel.enquiries, modelled: false },
    { label: 'Confirmed', value: funnel.confirmed, modelled: false },
  ];
  const maximum = Math.max(...stages.map((stage) => stage.value), 1);
  async function copy() {
    try { await navigator.clipboard.writeText('https://' + url); setMessage('Legacy sample URL copied. Public publication and ownership are not verified.'); }
    catch { setMessage('Copy unavailable. Select the sample URL manually.'); }
  }

  return <div className={styles.stack}>
    <Card><CardHeader title="Your booking page" subtitle="Sample page configuration · public hosting, live availability and payment collection have not been verified" action={<StatusPill status={config.enabled ? 'Preference enabled' : 'Preference disabled'} tone={config.enabled ? 'info' : 'neutral'} />} /><div className={styles.stack}><p className={styles.text}>Prepare the guest-facing configuration without treating a saved preference as a published booking service. This view does not connect a public domain or collect a guest payment.</p><div><p className={styles.metadata + ' mb-2'}>Legacy sample URL · not a verified Propbrew public domain</p><code className={styles.url}>{url}</code></div><div className={styles.toolbar}><ShortletConfirm switchLabel="Enable direct booking page preference" checked={config.enabled} disabled={!canUpdate} title="Review booking page preference" label={config.enabled ? 'Disable page preference' : 'Enable page preference'} description="Change the recorded direct booking preference only. This does not publish a verified public website or connect payments." action={() => toggleBookingPage()} onDone={() => { router.refresh(); setMessage('Booking page preference recorded. Publication is not verified.'); }} /><div className={styles.actions}><Button icon={<Copy size={16} />} onClick={copy}>Copy sample URL</Button><Button variant="primary" icon={<ExternalLink size={16} />} onClick={() => setShowPreview(true)}>Preview</Button></div></div></div></Card>
    <ShortletNotice>Traffic and apartment views below are modelled illustrations, not measured visits. Enquiry and confirmation counts come from booking records. No live analytics provider is connected.</ShortletNotice>
    <PageTabs label="Booking page sections" items={[
      { id: "settings", label: "Settings & promotions", content: <div className={styles.stack}>
        <Card padded={false} className={styles.panel}><div className={styles.header}><CardHeader title="Booking page settings" subtitle="Recorded link name, policy and enquiry hold preference" action={<Globe size={18} className="text-primary" />} /></div><div className={styles.body}><div className={styles.form}><label className={styles.field}>Link name<input aria-label="Link name" disabled={!canUpdate} value={slug} onChange={(event) => setSlug(event.target.value)} className="pb-form-control" /><span className={styles.metadata}>The link name is a workspace preference. Changing it here does not provision or publish a public domain.</span></label><label className={styles.field}>Cancellation policy<textarea aria-label="Cancellation policy" disabled={!canUpdate} value={policy} onChange={(event) => setPolicy(event.target.value)} rows={4} className="pb-form-control" /></label><label className={styles.field}>Hold dates after a WhatsApp enquiry (hours)<input aria-label="Hold dates after a WhatsApp enquiry (hours)" disabled={!canUpdate} type="number" min={0} max={48} step={1} inputMode="numeric" value={hold} onChange={(event) => setHold(event.target.value)} className="pb-form-control" /><span className={styles.metadata}>Record 0–48 hours. The public enquiry reservation service is not connected.</span></label><div className={styles.actions}><ShortletConfirm disabled={!canUpdate || !slug.trim() || !validHold} title="Review booking page settings" label="Save settings" description={'Record link name ' + slug + ', hold period ' + hold + ' hours and the cancellation policy above. The public page and enquiry reservation service are not connected.'} action={() => saveBookingPage({ slug, cancellationPolicy: policy, holdHours: Number(hold) })} onDone={() => { router.refresh(); setMessage('Settings recorded.'); }} /></div></div></div><p className={styles.footer}>Saving settings does not publish a page, reserve dates, create an approved contract or send a guest message.</p></Card>
        <Card padded={false} className={styles.panel}><div className={styles.header}><CardHeader title="Promo codes" subtitle={config.promoCodes.filter((promo) => promo.active).length + ' active preference(s) · existing bookings are unchanged'} action={<Button icon={<Plus size={16} />} onClick={() => setAdding(true)} disabled={!canUpdate}>Add promo code</Button>} /></div>{config.promoCodes.length ? <ul className={styles.list}>{config.promoCodes.map((promo) => <li key={promo.code} className={styles.listRow}><span className={styles.icon}><Ticket size={18} aria-hidden="true" /></span><div className={styles.listContent}><h3 className={styles.title}>{promo.code}</h3><p className={styles.text}>{promo.pct}% discount preference</p></div><StatusPill status={promo.active ? 'Active record' : 'Paused record'} tone={promo.active ? 'info' : 'muted'} /><ShortletConfirm disabled={!canUpdate} title="Review promotion status" label={(promo.active ? 'Pause ' : 'Activate ') + promo.code} description={'Record ' + promo.code + ' as ' + (promo.active ? 'paused' : 'active') + ' with a ' + promo.pct + '% discount. Existing bookings are unchanged.'} action={() => togglePromoCode(promo.code)} onDone={() => { router.refresh(); setMessage('Promotion preference recorded.'); }} /></li>)}</ul> : <div className={styles.empty}><EmptyState icon={<Ticket size={26} />} title="No promo codes yet." description="An authorised operator can record a discount code after reviewing the offer and its intended use." /></div>}<p className={styles.footer}>Promotion records are not proof that a public checkout applies the discount. No existing booking price or guest payment is changed here.</p></Card>
      </div> },
      { id: "performance", label: "Performance", content: <div className={styles.stack}>
        <Card padded={false} className={styles.panel}><div className={styles.header}><CardHeader title="Illustrative booking funnel" subtitle="Visits, searches and views are modelled; enquiry and confirmation counts use booking records" action={<TrendingUp size={18} className="text-primary" />} /></div><div className={styles.body}><div className={styles.twoColumns}><div className={styles.stack}><div><p className={styles.value}>{funnel.conversionPct}%</p><p className={styles.text}>of recorded enquiries convert to a confirmed booking</p></div><dl className={styles.facts}><div><dt>Recorded enquiries</dt><dd>{funnel.enquiries}</dd></div><div><dt>Recorded confirmations</dt><dd>{funnel.confirmed}</dd></div><div><dt>Traffic source</dt><dd>Modelled illustration</dd></div><div><dt>Analytics provider</dt><dd>Not connected</dd></div></dl>{!funnel.enquiries ? <p className={styles.metadata}>No enquiry baseline is available. A zero figure does not establish a measured conversion rate.</p> : null}</div><div className={styles.funnel}>{stages.map((stage) => <div key={stage.label} className={styles.funnelItem}><div><span>{stage.label}<small className={styles.metadata}> · {stage.modelled ? 'modelled' : 'recorded'}</small></span><strong>{stage.value.toLocaleString('en-NG')}</strong></div><progress className={styles.progress} max={maximum} value={Math.max(0, stage.value)} aria-label={stage.label + ': ' + stage.value + (stage.modelled ? ', modelled illustration' : ', recorded booking count')} /></div>)}</div></div></div><p className={styles.footer}>Relative bars compare the supplied values, not measured website sessions or an independently verified conversion funnel.</p></Card>
        <Card padded={false} className={styles.panel}><div className={styles.header}><CardHeader title="Illustrative performance by apartment" subtitle="Recorded bookings alongside modelled view counts · rates in NGN" /></div><div className={styles.scroll} role="region" aria-label="Illustrative apartment booking funnel table" tabIndex={0}><table className={'pb-data-table ' + styles.table}><thead><tr>{['Apartment', 'Recorded rate / night · NGN', 'Modelled views', 'Enquiries', 'Confirmed', 'Conversion'].map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr></thead><tbody>{aptFunnels.map((apartment, index) => <tr key={apartment.name + '-' + index}><th scope="row">{apartment.name}</th><td className={styles.numeric}>{shortletMoney(apartment.rateMinor)}</td><td className={styles.numeric}>{apartment.views}</td><td className={styles.numeric}>{apartment.enquiries}</td><td className={styles.numeric}>{apartment.confirmed}</td><td className={styles.numeric}>{apartment.conversionPct}%</td></tr>)}{!aptFunnels.length ? <tr><td colSpan={6}><EmptyState title="No direct-booking activity yet." description="Recorded apartment booking counts will appear here when supplied. No live traffic is inferred." /></td></tr> : null}</tbody></table></div><p className={styles.footer}>The rate is a recorded accommodation amount, not a payment receipt. Views remain illustrative until a real analytics provider is connected.</p></Card>
      </div> },
    ]} />
    <div className={styles.identity}><Sparkles size={18} className="text-primary flex-none" aria-hidden="true" /><p className={styles.metadata}>The preview shows recorded accommodation rates, not operating costs or a verified payment offer. Real public publication, availability and review synchronisation still require connected services.</p></div>
    {showPreview ? <PreviewModal apartments={preview} businessName={businessName} url={url} onClose={() => setShowPreview(false)} /> : null}
    {canUpdate && adding ? <AddPromoDialog onClose={() => setAdding(false)} onDone={() => { setAdding(false); setMessage('Promo code added'); }} /> : null}
    {message ? <ShortletFeedback message={message} onClose={() => setMessage(null)} /> : null}
  </div>;
}

function PreviewModal({ apartments, businessName, url, onClose }: { apartments: PreviewApt[]; businessName: string; url: string; onClose: () => void }) {
  return <ShortletDialog title="Guest booking preview" onClose={onClose} wide><div className={styles.stack}><div><p className={styles.metadata}>Book direct with · sample preview</p><h3 className={styles.title}>{businessName}</h3><p className={styles.text + ' mt-3'}>Not a published booking service. Public availability, page ownership and payment collection are not verified.</p></div><div><p className={styles.metadata + ' mb-2'}>Legacy sample URL</p><code className={styles.url}>{url}</code></div>{apartments.length ? <div className={styles.stack}>{apartments.map((apartment, index) => <Card key={apartment.name + '-' + index} padded={false} className={styles.panel}><div className={styles.header}><CardHeader title={apartment.name} subtitle={apartment.type + ' · ' + apartment.property} action={<Building2 size={18} className="text-primary" />} /></div><div className={styles.body}><div className={styles.toolbar}><div><p className={styles.value}>{shortletMoney(apartment.rateMinor)}</p><p className={styles.metadata}>Recorded accommodation rate / night · NGN</p></div><Button disabled>Preview only</Button></div></div></Card>)}</div> : <Card><EmptyState icon={<Building2 size={26} />} title="No apartments in this preview" description="Only active apartment records supplied by the workspace appear here." /></Card>}<p className={styles.metadata}>Preview only · Propbrew Shortlet. No dates are reserved and no guest payment can be made from this view.</p></div></ShortletDialog>;
}

function AddPromoDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const inFlight = useRef(false);
  const [code, setCode] = useState('');
  const [percent, setPercent] = useState('10');
  const [error, setError] = useState<string | null>(null);
  const valid = code.trim() !== '' && percent.trim() !== '' && Number.isInteger(Number(percent)) && Number(percent) >= 1 && Number(percent) <= 90;
  function submit() {
    if (pending || inFlight.current || !valid) return;
    inFlight.current = true;
    setError(null);
    start(async () => {
      try {
        const result = await addPromoCode({ code, pct: Number(percent) });
        if (!result.ok) { setError(result.error); return; }
        router.refresh();
        onDone();
      } catch { setError('The promo record could not be confirmed. Your entries are still here; refresh before trying again.'); }
      finally { inFlight.current = false; }
    });
  }
  return <ShortletDialog title="Add promo code" onClose={onClose} pending={pending} wide><form className={styles.form} onSubmit={(event) => event.preventDefault()}><p className={styles.text}>Record the code and discount after reviewing the offer. This does not apply a discount to existing bookings or publish a public checkout.</p><label className={styles.field}>Code<input required aria-label="Code" disabled={pending} value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="WELCOME10" className="pb-form-control" autoFocus /></label><label className={styles.field}>Discount (%)<input required aria-label="Discount (%)" type="number" min={1} max={90} step={1} inputMode="numeric" disabled={pending} value={percent} onChange={(event) => setPercent(event.target.value)} className="pb-form-control" /><span className={styles.metadata}>Record an integer discount between 1% and 90%.</span></label>{error ? <p role="alert" className="text-[14px] text-negative">{error}</p> : null}<ShortletReview pending={pending} disabled={!valid} onCancel={onClose} onSubmit={submit} label="Confirm add code">Review the code and discount above. This records a workspace change only; messages, bank transfers and gateway refunds are not sent by this form.</ShortletReview></form></ShortletDialog>;
}
