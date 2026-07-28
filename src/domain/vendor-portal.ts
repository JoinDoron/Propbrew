/**
 * Vendor-portal helpers (deterministic, no LLM). Earnings roll-ups for jobs and
 * orders, listing performance, and the job/order action label maps the vendor
 * portal renders over the §10 machines.
 */

const JOB_DONE = ['resolved', 'verified', 'closed'];
const JOB_OPEN = ['assigned', 'in_progress', 'on_hold'];
const ORDER_EARNED = ['fulfilled', 'closed'];
const ORDER_OPEN = ['placed', 'accepted'];

export type JobLike = { status: string; costMinor: number | null };
export type OrderLike = { status: string; amountMinor: number };
export type ListingLike = { id: string; status: string; priceMinor: number };

export type Earnings = { earnedMinor: number; pipelineMinor: number; activeJobs: number; doneJobs: number };

export function jobEarnings(jobs: readonly JobLike[]): Earnings {
  const earned = jobs.filter((j) => JOB_DONE.includes(j.status)).reduce((n, j) => n + (j.costMinor ?? 0), 0);
  const pipeline = jobs.filter((j) => JOB_OPEN.includes(j.status)).reduce((n, j) => n + (j.costMinor ?? 0), 0);
  return {
    earnedMinor: earned,
    pipelineMinor: pipeline,
    activeJobs: jobs.filter((j) => JOB_OPEN.includes(j.status)).length,
    doneJobs: jobs.filter((j) => JOB_DONE.includes(j.status)).length,
  };
}

export type OrderEarnings = { earnedMinor: number; pendingMinor: number; newOrders: number; fulfilled: number };

export function orderEarnings(orders: readonly OrderLike[]): OrderEarnings {
  return {
    earnedMinor: orders.filter((o) => ORDER_EARNED.includes(o.status)).reduce((n, o) => n + o.amountMinor, 0),
    pendingMinor: orders.filter((o) => ORDER_OPEN.includes(o.status)).reduce((n, o) => n + o.amountMinor, 0),
    newOrders: orders.filter((o) => o.status === 'placed').length,
    fulfilled: orders.filter((o) => ORDER_EARNED.includes(o.status)).length,
  };
}

export type ListingPerf = { orders: number; revenueMinor: number; live: number; paused: number; totalRevenueMinor: number };

/** Portfolio-level listing performance: live/paused counts + total revenue. */
export function listingStats(listings: readonly ListingLike[], orders: readonly { amountMinor: number; status: string }[]): ListingPerf {
  const live = listings.filter((l) => l.status === 'active').length;
  const revenue = orders.filter((o) => ORDER_EARNED.includes(o.status)).reduce((n, o) => n + o.amountMinor, 0);
  return { orders: orders.length, revenueMinor: revenue, live, paused: listings.length - live, totalRevenueMinor: revenue };
}

/** Orders + revenue for a single listing (matched by title). */
export function perListing(listingTitle: string, orders: readonly { listingTitle: string; amountMinor: number; status: string }[]): { orders: number; revenueMinor: number } {
  const mine = orders.filter((o) => o.listingTitle === listingTitle);
  return { orders: mine.length, revenueMinor: mine.filter((o) => ORDER_EARNED.includes(o.status)).reduce((n, o) => n + o.amountMinor, 0) };
}

/* --- action label maps ---------------------------------------------------- */

export const JOB_ACTIONS: Record<string, { label: string; variant: 'primary' | 'default' | 'danger' }> = {
  START: { label: 'Start work', variant: 'primary' },
  HOLD: { label: 'Pause', variant: 'default' },
  RESUME: { label: 'Resume', variant: 'primary' },
  RESOLVE: { label: 'Mark done', variant: 'primary' },
};

export const ORDER_ACTIONS: Record<string, { label: string; variant: 'primary' | 'default' | 'danger' }> = {
  ACCEPT: { label: 'Accept', variant: 'primary' },
  DECLINE: { label: 'Decline', variant: 'danger' },
  FULFIL: { label: 'Mark fulfilled', variant: 'primary' },
};
