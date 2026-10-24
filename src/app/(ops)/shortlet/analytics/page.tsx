import { PageHeader } from '@/components/ui/page-header';
import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { NOW_MS } from '@/domain/ppm';
import { revenueVsExpense, profitByProperty, occupancyRate, sourcePerformance } from '@/domain/shortlet';
import { ShortletAnalytics, type AptOcc } from '@/components/shortlet/analytics';
import { withDurableRead } from '@/server/data/durable-records';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** FR-AN (Short-Let PMS) — analytics: revenue-vs-expense, profit by property,
 *  occupancy per apartment, booking-source performance, CSV export. */
export default async function ShortletAnalyticsPage() {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('bookings_amenities', 'read', 'shortlet');
  const bookings = repos.shortletBookings.list(actor).items;
  const expenses = repos.shortletExpenses.list(actor).items;
  const apts = repos.shortletApartments.list(actor).items;
  const props = repos.shortletProperties.list(actor).items;
  const propName = new Map(props.map((p) => [p.id, p.name]));

  const now = new Date(NOW_MS);
  const mStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const mEnd = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);

  const revExp = revenueVsExpense(bookings, expenses, NOW_MS, 6).map((m) => ({ label: MONTHS[Number(m.month.slice(5, 7)) - 1], revenueMinor: m.revenueMinor, expenseMinor: m.expenseMinor }));
  const propProfit = profitByProperty(props, bookings, expenses).map((p) => ({ name: p.name, revenueMinor: p.revenueMinor, expenseMinor: p.expenseMinor, profitMinor: p.profitMinor, marginPct: p.marginPct }));
  const occupancy: AptOcc[] = apts.map((a) => ({ name: a.name, property: propName.get(a.propertyId) ?? '', occupancyPct: occupancyRate(bookings, a.id, mStart, mEnd) })).sort((a, b) => b.occupancyPct - a.occupancyPct);
  const sources = sourcePerformance(bookings).map((s) => ({ label: s.label, bookings: s.bookings, revenueMinor: s.revenueMinor, nights: s.nights }));

  return (
    <div className="pb-page">
      <PageHeader title="Shortlet analytics" subtitle="Revenue, expenses, occupancy and booking-source performance." />
      <ShortletAnalytics revExp={revExp} propProfit={propProfit} occupancy={occupancy} sources={sources} />
    </div>
  );
  });
}
