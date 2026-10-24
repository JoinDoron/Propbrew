import { PageHeader } from '@/components/ui/page-header';
import { Card, CardHeader, EmptyState, StatusPill } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import shortletStyles from '@/components/shortlet/shortlet-reference.module.css';
import styles from '@/components/shortlet/shortlet-directory-polish.module.css';
import { shortletDate } from '@/components/shortlet/shortlet-format';
import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { reviewStats, reviewsByApartment } from '@/domain/shortlet';
import { Star, MessageSquare } from 'lucide-react';

function Stars({ rating }: { rating: number }) {
  return <span className={styles.rating} role="img" aria-label={rating + ' out of 5 stars'}>{[1, 2, 3, 4, 5].map((value) => <Star key={value} size={16} aria-hidden="true" className={value <= Math.round(rating) ? 'fill-current' : 'text-border-2'} />)}<span aria-hidden="true" className={styles.metadata}>{rating} / 5</span></span>;
}

export default async function ShortletReviewsPage() {
  const { actor } = await requireCapability('bookings_amenities', 'read', 'shortlet');
  const reviews = repos.shortletReviews.list(actor).items;
  const apartments = new Map(repos.shortletApartments.list(actor).items.map((apartment) => [apartment.id, apartment.name]));
  const stats = reviewStats(reviews);
  const byApartment = reviewsByApartment(reviews);
  const sorted = [...reviews].sort((a, b) => b.atISO.localeCompare(a.atISO));
  return <div className="pb-page">
    <PageHeader title="Guest reviews" subtitle="Track feedback, ratings and the experience at each apartment." />
    <PageTabs label="Guest review sections" items={[
      { id: "reviews", label: "Guest reviews", content: <div className={styles.stack}>
        <Card><CardHeader title="Guest feedback" subtitle="Recorded review comments · newest first" action={<StatusPill status={stats.count + ' reviews'} tone="info" />} /><p className={styles.text}>Use guest feedback to prioritise service improvements. These records do not verify WhatsApp delivery, a public review listing or a marketing audience.</p></Card>
        {sorted.length ? sorted.map((review) => <Card key={review.id} className={styles.review}><CardHeader title={review.guestName} subtitle={(apartments.get(review.apartmentId) ?? 'Apartment not linked') + ' · ' + shortletDate(review.atISO)} action={<Stars rating={review.rating} />} /><blockquote>“{review.comment}”</blockquote>{review.tags.length > 0 && <div className={styles.inline}>{review.tags.map((tag) => <StatusPill key={tag} status={tag} tone="neutral" />)}</div>}</Card>) : <Card><EmptyState title="No feedback yet" description="Guest reviews appear here when review records are available." /></Card>}
      </div> },
      { id: "ratings", label: "Ratings overview", content: <div className={styles.ratings}>
        <Card className={styles.score}><strong>{stats.count ? stats.avg : '—'}</strong>{stats.count ? <Stars rating={stats.avg} /> : <MessageSquare size={24} className="text-text-3" aria-hidden="true" />}<p className={styles.metadata}>{stats.count} recorded reviews · score out of 5</p></Card>
        <Card><CardHeader title="Rating distribution" subtitle="Share of recorded reviews at each rating" /><div className={styles.distribution}>{[5, 4, 3, 2, 1].map((rating, index) => <div key={rating}><span>{rating} stars</span><progress className={styles.progress} max={stats.count || 1} value={stats.distribution[index]} aria-label={rating + ' star reviews: ' + stats.distribution[index] + ' of ' + stats.count} /><span>{stats.distribution[index]}</span></div>)}</div>{!stats.count && <p className={styles.metadata + ' mt-6'}>There are no review ratings to summarise.</p>}</Card>
      </div> },
      { id: "apartments", label: "Apartment ratings", content: <div className={styles.stack}>
        <Card><CardHeader title="Apartment feedback" subtitle="Average rating and review count for each apartment with recorded feedback" /></Card>
        {byApartment.size ? <div className={styles.grid}>{[...byApartment.entries()].sort((a, b) => b[1].avg - a[1].avg).map(([id, rating]) => <Card key={id}><CardHeader title={apartments.get(id) ?? 'Apartment not linked'} subtitle={rating.count + ' recorded reviews'} /><Stars rating={rating.avg} /></Card>)}</div> : <Card><EmptyState title="No apartment ratings" description="Apartment averages appear after review records are available." /></Card>}
      </div> },
    ]} />
    <p className={shortletStyles.metadata}>Review summaries use the records in your current Shortlet scope. Ratings are guest feedback, not independently verified service or safety scores.</p>
  </div>;
}
