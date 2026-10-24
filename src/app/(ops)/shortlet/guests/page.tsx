import { PageHeader } from '@/components/ui/page-header';
import { Card, CardHeader } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import { ShortletMetric } from '@/components/shortlet/reference-ui';
import { GuestDirectory } from '@/components/shortlet/guest-directory';
import shortletStyles from '@/components/shortlet/shortlet-reference.module.css';
import styles from '@/components/shortlet/shortlet-directory-polish.module.css';
import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { guestProfiles } from '@/domain/shortlet';
import { Users, Star, Repeat } from 'lucide-react';

export default async function ShortletGuestsPage() {
  const { actor } = await requireCapability('bookings_amenities', 'read', 'shortlet');
  const guests = guestProfiles(repos.shortletBookings.list(actor).items);
  const repeatRate = guests.length ? Math.round((guests.filter((guest) => guest.repeat).length / guests.length) * 100) : 0;
  const vip = guests.filter((guest) => guest.vip).length;
  return <div className="pb-page">
    <PageHeader title="Guests" subtitle="Recognise returning guests and understand recorded accommodation value." />
    <PageTabs label="Guest management sections" items={[
      { id: "directory", label: "Guest directory", content: <GuestDirectory guests={guests} /> },
      { id: "loyalty", label: "Guest insights", content: <div className={styles.stack}>
        <div className={shortletStyles.columns}><ShortletMetric label="Guests" value={String(guests.length)} icon={<Users size={18} />} /><ShortletMetric label="Repeat rate" value={repeatRate + '%'} tone={repeatRate >= 30 ? 'success' : 'warn'} icon={<Repeat size={18} />} /><ShortletMetric label="VIP guests" value={String(vip)} tone="progress" icon={<Star size={18} />} /></div>
        <Card><CardHeader title="Understand the relationship signals" subtitle="Rules calculated from the currently scoped booking records" /><dl className={styles.facts}><div><dt>Returning guest</dt><dd>At least two non-cancelled booking records grouped by the same recorded guest phone.</dd></div><div><dt>VIP flag</dt><dd>At least three non-cancelled bookings, or recorded accommodation value of ₦100,000.00 or more.</dd></div></dl><p className={styles.text + ' mt-6'}>These labels do not verify completed stays, identity, payment settlement or permission to send marketing. Enquiries can contribute to the current booking-based relationship model.</p></Card>
      </div> },
    ]} />
  </div>;
}
