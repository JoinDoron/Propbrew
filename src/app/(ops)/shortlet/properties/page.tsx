import { PageHeader } from '@/components/ui/page-header';
import { requireCapability } from '@/server/guard';
import { Card, CardHeader, EmptyState, StatusPill } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import shortletStyles from '@/components/shortlet/shortlet-reference.module.css';
import styles from '@/components/shortlet/shortlet-directory-polish.module.css';
import { ShortletMetric } from '@/components/shortlet/reference-ui';
import { shortletDate, shortletMoney } from '@/components/shortlet/shortlet-format';
import { repos } from '@/server/data';
import { operatingClock } from '@/server/operating-clock';
import { occupancyRate, suggestNightlyRate } from '@/domain/shortlet';
import { Building2, Wifi, KeyRound, Sparkles, Landmark, BedDouble } from 'lucide-react';
import { withDurableRead } from '@/server/data/durable-records';
import { can } from '@/lib/authz';
import { ApartmentEditorButton, PropertyEditorButton } from '@/components/shortlet/accommodation-editor';

/** Scoped property records and operator-reviewed rate suggestions. No automatic repricing. */
export default async function ShortletPropertiesPage() {
  return withDurableRead(async () => {
  const { dateISO: TODAY } = operatingClock();
  const NOW_MS = Date.parse(TODAY);
  const { actor } = await requireCapability('bookings_amenities', 'read', 'shortlet');
  const canCreate = can(actor, 'bookings_amenities', 'create').allowed;
  const canEdit = can(actor, 'bookings_amenities', 'update').allowed;
  const props = repos.shortletProperties.list(actor).items;
  const apts = repos.shortletApartments.list(actor).items;
  const bookings = repos.shortletBookings.list(actor).items;
  const now = new Date(NOW_MS);
  const mStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const mEnd = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  const nextSat = new Date(NOW_MS + ((6 - now.getUTCDay() + 7) % 7 || 7) * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const snapshot = now.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' });
  return <div className="pb-page">
    <PageHeader title="Shortlet properties" subtitle="Manage apartments, guest access and advisory nightly rates." actions={<PropertyEditorButton allowed={canCreate} />} />
    <PageTabs label="Shortlet property sections" items={[
      { id: 'apartments', label: 'Apartments & access', content: <div className={styles.stack}>
        <div className={shortletStyles.columns}><ShortletMetric label="Properties" value={String(props.length)} icon={<Building2 size={18} />} /><ShortletMetric label="Apartments" value={String(apts.length)} icon={<BedDouble size={18} />} /><ShortletMetric label="Active apartments" value={String(apts.filter((apt) => apt.status === 'active').length)} note="Recorded apartment status, not current availability" /></div>
        {props.length ? props.map((property) => {
          const apartments = apts.filter((apt) => apt.propertyId === property.id);
          return <Card key={property.id} padded={false}>
            <div className={styles.header}><CardHeader title={property.name} subtitle={property.area + ', ' + property.city + ' · ' + apartments.length + ' apartments'} action={<div className={styles.inline}><PropertyEditorButton allowed={canEdit} property={{ id: property.id, name: property.name, city: property.city, area: property.area }} /><ApartmentEditorButton allowed={canCreate} propertyId={property.id} propertyName={property.name} /></div>} /></div>
            <div className={styles.body}><dl className={styles.facts}><div><dt><Landmark size={16} aria-hidden="true" /> Recorded settlement account</dt><dd>{property.bankName || property.accountNumber ? `${property.bankName} · ${property.accountNumber}` : 'No settlement account reference recorded'}</dd></div><div><dt>Account name</dt><dd>{property.accountName || 'Not recorded'}</dd></div></dl><p className={styles.metadata + ' mt-4'}>Account details are recorded references, not verification of account ownership, gateway configuration or settlement.</p></div>
            {apartments.length ? apartments.map((apartment) => <section key={apartment.id} className={styles.apartment} aria-label={apartment.name + ' apartment details'}>
              <header><div><h3>{apartment.name}</h3><p className={styles.metadata}>{apartment.type}</p></div><div className={styles.inline}><StatusPill status={apartment.status} tone={apartment.status === 'active' ? 'success' : 'neutral'} /><ApartmentEditorButton allowed={canEdit} propertyId={property.id} propertyName={property.name} apartment={{ id: apartment.id, name: apartment.name, type: apartment.type, nightlyMinor: apartment.nightlyRate.minor, status: apartment.status, wifiSsid: apartment.wifiSsid, accessInstructions: apartment.accessInstructions, houseRules: apartment.houseRules, amenities: apartment.amenities }} /></div></header>
              <dl className={styles.facts}><div><dt>Recorded nightly rate · NGN</dt><dd className={styles.amount}>{shortletMoney(apartment.nightlyRate.minor)} / night</dd></div><div><dt>Recorded occupancy this month</dt><dd>{occupancyRate(bookings, apartment.id, mStart, mEnd)}%</dd></div><div><dt><Wifi size={16} aria-hidden="true" /> Wi-Fi network</dt><dd>{apartment.wifiSsid || 'No network recorded'}</dd></div><div><dt><KeyRound size={16} aria-hidden="true" /> Guest access instructions</dt><dd>{apartment.accessInstructions || 'No instructions recorded'}</dd></div></dl>
            </section>) : <div className={styles.body}><EmptyState title="No apartments linked" description="No apartment records are linked to this property in the current scope." /></div>}
            <p className={styles.footer}>Snapshot · {snapshot} · WAT. Rates are recorded in NGN; access instructions should be shared only through an approved guest process.</p>
          </Card>;
        }) : <Card><EmptyState title="No shortlet properties" description="No properties are available in your current scope." /></Card>}
      </div> },
      { id: 'rates', label: 'Rate recommendations', content: <div className={styles.stack}>
        <Card><CardHeader title="Operator-reviewed rate suggestions" subtitle={'Illustration for ' + shortletDate(nextSat)} action={<Sparkles size={20} className="text-primary" />} /><p className={styles.text}>Suggestions use recorded occupancy, weekend and seasonal rules. They are advisory rules—not a calibrated demand forecast. No apartment or existing booking is repriced automatically.</p></Card>
        {apts.length ? apts.map((apartment) => {
          const occupancy = occupancyRate(bookings, apartment.id, mStart, mEnd);
          const recommendation = suggestNightlyRate(apartment, nextSat, occupancy);
          return <Card key={apartment.id}><CardHeader title={apartment.name} subtitle="Rules-based nightly-rate illustration · NGN" action={<StatusPill status={recommendation.deltaPct > 0 ? '+' + recommendation.deltaPct + '%' : recommendation.deltaPct + '%'} tone={recommendation.deltaPct > 0 ? 'success' : 'info'} />} /><dl className={styles.facts}><div><dt>Current recorded base</dt><dd>{shortletMoney(apartment.nightlyRate.minor)} / night</dd></div><div><dt>Suggested for {shortletDate(nextSat)}</dt><dd>{shortletMoney(recommendation.suggestedMinor)} / night</dd></div><div><dt>Recorded month occupancy</dt><dd>{occupancy}%</dd></div></dl><ul className={styles.text + ' mt-6 list-disc pl-5'}>{recommendation.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></Card>;
        }) : <Card><EmptyState title="No rate suggestions" description="Suggestions appear for apartments visible in your current scope." /></Card>}
      </div> },
    ]} />
    <p className={styles.metadata}>Recorded snapshot · {snapshot} · WAT. Rate suggestions are advisory—you set the price. Automated dynamic pricing is not enabled by this screen.</p>
  </div>;
  });
}
