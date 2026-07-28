import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { expenseInsights } from '@/domain/shortlet';
import { ExpensesWorkspace, type ExpenseRow } from '@/components/shortlet/expenses-workspace';

const REVENUE = ['confirmed', 'checked_in', 'checked_out', 'closed'];

/** FR-EX (Short-Let PMS) — expense tracking + real profit. Log naira expenses
 *  (diesel-era categories) per property; the module computes profit and surfaces
 *  diesel as a share of revenue and cost per occupied night. */
export default async function ShortletExpensesPage() {
  const { actor } = await requireCapability('bookings_amenities');
  const bookings = repos.shortletBookings.list(actor).items;
  const expenses = repos.shortletExpenses.list(actor).items;
  const props = repos.shortletProperties.list(actor).items;
  const propName = new Map(props.map((p) => [p.id, p.name]));

  const rows: ExpenseRow[] = [...expenses]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((e) => ({ id: e.id, property: propName.get(e.propertyId) ?? '', propertyId: e.propertyId, category: e.category, amountMinor: e.amount.minor, date: e.date, note: e.note }));

  const revenueMinor = bookings.filter((b) => REVENUE.includes(b.status)).reduce((n, b) => n + b.total.minor, 0);

  return (
    <div className="max-w-[920px] mx-auto">
      <ExpensesWorkspace expenses={rows} properties={props.map((p) => ({ id: p.id, name: p.name }))} insight={expenseInsights(bookings, expenses)} revenueMinor={revenueMinor} />
    </div>
  );
}
