import 'server-only';

/**
 * Notifications (SC-09) and messages inbox. Per-user, seeded on first access
 * from role-based templates so any identity has relevant content, with mutable
 * read state and a working compose. This is a demo stand-in for the SC-09
 * notifications engine + the estate messaging channel; the shapes are what a
 * real service would return.
 */

import type { Role } from '@/domain/enums';

export type NotifKind = 'info' | 'success' | 'warn' | 'danger';
export type Notification = {
  id: string;
  title: string;
  body: string;
  at: string;
  read: boolean;
  kind: NotifKind;
  href?: string;
};

export type ChatMessage = { mine: boolean; name: string; text: string; at: string };
export type Thread = { id: string; withName: string; subject: string; messages: ChatMessage[]; lastReadSeq: number };

const notifications = new Map<string, Notification[]>();
const threads = new Map<string, Thread[]>();

const BASE = Date.parse('2026-07-26T09:00:00Z');
const at = (minsAgo: number) => new Date(BASE - minsAgo * 60_000).toISOString();

/* --- role templates -------------------------------------------------------- */

type NotifSeed = [mins: number, title: string, body: string, kind: NotifKind, href?: string];
type ThreadSeed = { id: string; withName: string; subject: string; msgs: [mine: boolean, name: string, text: string, mins: number][]; unread: number };

const NOTIFS: Partial<Record<Role, NotifSeed[]>> = {
  resident: [
    [8, 'Payment received', 'Your ₦40,000 service charge was cleared from your wallet.', 'success', '/portal/bills'],
    [95, 'Request resolved', 'WO-24810 “Leaking pipe — Block C basement” was marked resolved.', 'info', '/portal/requests'],
    [140, 'New announcement', 'Water supply interruption — Sat 08:00–12:00.', 'warn', '/portal/announcements'],
    [1500, 'Service charge issued', 'A new Q3 2026 charge of ₦40,000 was issued to Shop 4.', 'info', '/portal/bills'],
  ],
  estate_manager: [
    [12, 'SOS raised', 'An SOS was raised at Unit D-04C — needs acknowledgement.', 'danger', '/security'],
    [40, 'New maintenance request', 'WO-24815 “AC not cooling — Unit C-09A” is awaiting triage.', 'warn', '/work-orders'],
    [180, 'Invoice escalated', 'INV-2981 for Unit D-04C moved to Escalated.', 'danger', '/billing'],
    [1400, 'Booking request', 'Tobi Ade requested the Tennis Court.', 'info', '/bookings'],
  ],
  facility_manager: [
    [30, 'PPM overdue', 'Water Pump — Block D is overdue for preventive maintenance.', 'danger', '/ppm'],
    [70, 'Work order needs assignment', 'WO-24816 “Generator failed to auto-start” is unassigned.', 'warn', '/work-orders'],
    [1600, 'Inspection failed', 'Lift statutory inspection failed — 3 work orders raised.', 'warn', '/inspections'],
  ],
  technician: [
    [15, 'New assignment', 'You were assigned WO-24817 “Lift making grinding noise”.', 'info', '/work-orders'],
    [400, 'SLA reminder', 'WO-24816 is approaching its resolve deadline.', 'warn', '/work-orders'],
  ],
  security: [
    [10, 'SOS raised', 'SOS-0043 raised at Unit D-04C — acknowledge within 60s.', 'danger', '/security'],
    [600, 'Patrol due', 'Evening patrol round is due at 20:00.', 'info', '/security'],
  ],
  vendor: [
    [25, 'New job assigned', 'WO-24809 “CCTV camera offline — main gate” was assigned to you.', 'info', '/portal/jobs'],
    [90, 'Order to accept', 'ORD-5002 “Emergency plumbing call-out” is awaiting acceptance.', 'warn', '/portal/listings'],
  ],
  investor: [
    [120, 'Sales update', 'Marina Heights reached 78/120 units sold (65%).', 'success', '/portal/projects'],
    [2000, 'ROI projection', 'Updated projected ROI for Marina Heights: 18.5% (estimate).', 'info', '/portal/projects'],
  ],
  executive: [
    [60, 'Collection rate', 'Portfolio collection rate is up 4% week-on-week.', 'success', '/dashboard'],
    [300, 'Escalations', '2 invoices moved to Escalated across your estates.', 'warn', '/billing'],
  ],
  platform_admin: [
    [45, 'Tenant activity', 'Ikoyi Heights onboarded 3 new residents.', 'info', '/admin/tenants'],
    [500, 'AI usage', 'Lekki Gardens is at 62% of its monthly AI budget.', 'warn', '/admin/ai'],
  ],
};

const THREADS: Partial<Record<Role, ThreadSeed[]>> = {
  resident: [
    { id: 't-em', withName: 'Ngozi (Estate Manager)', subject: 'Kitchen leak follow-up', unread: 1, msgs: [
      [true, 'You', 'Hi, the pipe under my kitchen sink is leaking again.', 180],
      [false, 'Ngozi Okafor', 'Thanks Folake — I’ve raised WO-24810 and assigned a plumber. They’ll come tomorrow AM.', 150],
      [false, 'Ngozi Okafor', 'Plumber confirmed for 9am. Please keep the cabinet clear.', 20],
    ] },
    { id: 't-sec', withName: 'Musa (Security)', subject: 'Visitor pass', unread: 0, msgs: [
      [true, 'You', 'I have a guest arriving Saturday around noon.', 1200],
      [false, 'Musa Ibrahim', 'Noted — generate a visitor pass from Safety & SOS and share the code with them.', 1180],
    ] },
  ],
  estate_manager: [
    { id: 't-res', withName: 'Folake (Resident, C-12B)', subject: 'Kitchen leak follow-up', unread: 1, msgs: [
      [false, 'Folake Bello', 'Hi, the pipe under my kitchen sink is leaking again.', 180],
      [true, 'You', 'Thanks Folake — raising a work order and assigning a plumber now.', 150],
      [false, 'Folake Bello', 'Thank you! What time tomorrow?', 12],
    ] },
    { id: 't-ven', withName: 'Brightworks (Vendor)', subject: 'CCTV rate confirmation', unread: 0, msgs: [
      [true, 'You', 'Can you confirm the rate for the main-gate CCTV repair?', 900],
      [false, 'Brightworks Dispatch', '₦45,000 all-in, parts included. We can attend Thursday.', 880],
    ] },
  ],
  vendor: [
    { id: 't-em', withName: 'Ngozi (Estate Manager)', subject: 'CCTV rate confirmation', unread: 1, msgs: [
      [false, 'Ngozi Okafor', 'Can you confirm the rate for the main-gate CCTV repair?', 900],
      [true, 'You', '₦45,000 all-in, parts included. We can attend Thursday.', 880],
      [false, 'Ngozi Okafor', 'Approved — I’ll assign the job to you now.', 15],
    ] },
  ],
  security: [
    { id: 't-em', withName: 'Ngozi (Estate Manager)', subject: 'Night patrol cover', unread: 0, msgs: [
      [false, 'Ngozi Okafor', 'Can you cover the extra patrol round tonight?', 700],
      [true, 'You', 'Yes, I’ll add a round at 22:00.', 690],
    ] },
  ],
};

const GENERIC_THREAD: ThreadSeed = {
  id: 't-support', withName: 'Vesta Support', subject: 'Welcome to Vesta', unread: 1,
  msgs: [[false, 'Vesta Support', 'Welcome! Reply here if you need a hand getting started.', 60]],
};

/* --- seeding + accessors --------------------------------------------------- */

function ensureSeeded(userId: string, role: Role): void {
  if (!notifications.has(userId)) {
    const seeds = NOTIFS[role] ?? [[120, 'Welcome to Vesta', 'You’re all set. Notifications will appear here.', 'info']];
    notifications.set(
      userId,
      seeds.map(([mins, title, body, kind, href], i) => ({ id: `n-${userId}-${i}`, title, body, kind, href, at: at(mins), read: i >= 3 })),
    );
  }
  if (!threads.has(userId)) {
    const seeds = THREADS[role] ?? [GENERIC_THREAD];
    threads.set(
      userId,
      seeds.map((t) => {
        const messages: ChatMessage[] = t.msgs.map(([mine, name, text, mins]) => ({ mine, name, text, at: at(mins) }));
        return { id: t.id, withName: t.withName, subject: t.subject, messages, lastReadSeq: Math.max(0, messages.length - t.unread) };
      }),
    );
  }
}

const primaryRole = (roles: readonly Role[]): Role => roles[0] ?? 'resident';

export function getNotifications(userId: string, roles: readonly Role[]): Notification[] {
  ensureSeeded(userId, primaryRole(roles));
  return [...(notifications.get(userId) ?? [])].sort((a, b) => (a.at < b.at ? 1 : -1));
}

export function unreadNotificationCount(userId: string, roles: readonly Role[]): number {
  ensureSeeded(userId, primaryRole(roles));
  return (notifications.get(userId) ?? []).filter((n) => !n.read).length;
}

export function markAllNotificationsRead(userId: string, roles: readonly Role[]): void {
  ensureSeeded(userId, primaryRole(roles));
  (notifications.get(userId) ?? []).forEach((n) => (n.read = true));
}

export function getThreads(userId: string, roles: readonly Role[]): Thread[] {
  ensureSeeded(userId, primaryRole(roles));
  return threads.get(userId) ?? [];
}

export function unreadThreadCount(userId: string, roles: readonly Role[]): number {
  return getThreads(userId, roles).reduce((sum, t) => sum + t.messages.slice(t.lastReadSeq).filter((m) => !m.mine).length, 0);
}

export function markThreadRead(userId: string, roles: readonly Role[], threadId: string): void {
  const t = getThreads(userId, roles).find((x) => x.id === threadId);
  if (t) t.lastReadSeq = t.messages.length;
}

export function appendMessage(userId: string, roles: readonly Role[], threadId: string, text: string): void {
  const t = getThreads(userId, roles).find((x) => x.id === threadId);
  if (!t) return;
  t.messages.push({ mine: true, name: 'You', text, at: new Date().toISOString() });
  t.lastReadSeq = t.messages.length;
}
