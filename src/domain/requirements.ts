// PRD v2.0 — Facility & Estate Management Platform (7 Fifteen Capital / Unrealabs)
// Complete requirements catalog: all 45 IDs, verbatim-faithful to the PRD.
// Suggested location: src/domain/requirements.ts

export type ModuleKey = "FM" | "EM" | "SC" | "AI-F" | "AI-E" | "AI-S";
export type Priority = "Must" | "Should" | "Could";
export type Phase = 1 | 2 | 3;
export type OpenQuestionId =
  | "Q1" | "Q2" | "Q3" | "Q4" | "Q5" | "Q6"
  | "Q7" | "Q8" | "Q9" | "Q10" | "Q11" | "Q12";

export interface Requirement {
  id: string;
  title: string;
  module: ModuleKey;
  moduleLabel: string;
  priority: Priority;
  /** Marked "(new in v2.0)" in the PRD. */
  newInV2?: true;
  /** Marked "(optional)" in the PRD. */
  optional?: true;
  story: string;
  /** Acceptance criteria, condensed but complete. */
  ac: string[];
  phase: Phase;
  /** §17 questions that block or materially shape this requirement. */
  blockedBy: OpenQuestionId[];
  /** Requirement IDs this one depends on or is cited by. */
  relates: string[];
}

export const PHASE_WEEKS: Record<Phase, string> = {
  1: "weeks 1-12 — Foundations & MVP",
  2: "weeks 10-20 — Committed scope",
  3: "weeks 18-26 — Complete & harden",
};

export const REQUIREMENTS: Requirement[] = [
  // ── Module 01 — Facility Management ──────────────────────────────────────
  {
    id: "FM-01", title: "Asset management & register",
    module: "FM", moduleLabel: "Module 01 — Facility Management",
    priority: "Must", phase: 1, blockedBy: ["Q9"],
    story: "As a Facility Manager, I maintain a register of every asset so identity, location and history are trackable.",
    ac: [
      "Asset CRUD: name, category, serial/tag, location (estate>building>unit/zone), status, purchase & warranty dates, photos, documents.",
      "Assets link to work orders and inspections; service history viewable per asset.",
      "Archive only (no hard delete); all changes audit-logged (PRD cites SC-11; believed to mean SC-10).",
      "Bulk import via CSV template.",
    ],
    relates: ["FM-03", "FM-04", "FM-06", "SC-10", "AI-F-01", "AI-S-03"],
  },
  {
    id: "FM-02", title: "Preventive maintenance & scheduling",
    module: "FM", moduleLabel: "Module 01 — Facility Management",
    priority: "Must", phase: 1, blockedBy: [],
    story: "As a Facility Manager, I define recurring PPM plans so work is scheduled before failure.",
    ac: [
      "PPM plans: frequency, checklist, assignee rules, lead time; per asset or per category.",
      "Scheduler auto-generates work orders ahead of due date; calendar view; overdue flagged.",
      "Completion requires checklist + evidence photo (configurable).",
    ],
    relates: ["FM-01", "FM-03", "FM-07", "AI-F-01"],
  },
  {
    id: "FM-03", title: "Work-order management",
    module: "FM", moduleLabel: "Module 01 — Facility Management",
    priority: "Must", newInV2: true, phase: 1, blockedBy: [],
    story: "As a Technician, I receive, update and close work orders on mobile so nothing gets lost.",
    ac: [
      "Lifecycle states and transitions exactly per §10, with per-priority SLA timers.",
      "Assign to internal technician or vendor; reassignment and every state change tracked and notified.",
      "Capture photos, notes, parts and costs; requester notified on state changes.",
      "Offline updates supported per §12.1 (queued writes, visible sync status, server-authoritative conflicts).",
    ],
    relates: ["FM-02", "FM-05", "FM-06", "EM-03", "SC-09", "SC-10", "AI-F-02", "AI-E-02"],
  },
  {
    id: "FM-04", title: "Space management",
    module: "FM", moduleLabel: "Module 01 — Facility Management",
    priority: "Should", phase: 2, blockedBy: ["Q9"],
    story: "As a Facility Manager, I manage the space hierarchy so occupancy and allocation are always current.",
    ac: [
      "estate>building>floor>unit/zone hierarchy maintained once, shared with the Estate module.",
      "Occupancy/allocation status per space; spaces link to assets, bookings and residents.",
    ],
    relates: ["FM-01", "EM-01", "EM-02", "EM-05", "SC-07"],
  },
  {
    id: "FM-05", title: "Vendor management",
    module: "FM", moduleLabel: "Module 01 — Facility Management",
    priority: "Must", phase: 1, blockedBy: [],
    story: "As a Facility Manager, I onboard vendors and route jobs to them so external work is controlled.",
    ac: [
      "Vendor profiles: services, coverage, documents (insurance/certifications) with expiry alerts.",
      "Vendors receive assignments and submit updates & invoices via the vendor portal.",
      "Performance metrics: jobs completed, SLA hit rate, rating.",
    ],
    relates: ["FM-03", "EM-07", "EM-09", "SC-01", "SC-09", "AI-S-03"],
  },
  {
    id: "FM-06", title: "Inspection & compliance tracking",
    module: "FM", moduleLabel: "Module 01 — Facility Management",
    priority: "Should", phase: 2, blockedBy: [],
    story: "As a Facility Manager, I schedule inspections so compliance is evidenced, not assumed.",
    ac: [
      "Inspection templates with checklist items (pass/fail/severity); scheduled and ad-hoc runs on mobile with photo capture.",
      "Failed items auto-raise work orders (FM-03).",
      "Compliance register shows status and expiry per obligation.",
    ],
    relates: ["FM-01", "FM-03", "AI-F-03"],
  },
  {
    id: "FM-07", title: "Reporting & analytics",
    module: "FM", moduleLabel: "Module 01 — Facility Management",
    priority: "Must", phase: 1, blockedBy: [],
    story: "As an Executive, I see portfolio performance so decisions stop being guesswork.",
    ac: [
      "Dashboards: open/overdue WOs, PPM compliance %, downtime, cost by category/estate.",
      "Filters by estate/date; export CSV/PDF; role-scoped visibility per §7.",
      "§14: every KPI must be reportable from the product itself (FM-07 / AI-S-02).",
    ],
    relates: ["FM-02", "FM-03", "AI-F-04", "AI-S-02", "SC-08"],
  },
  {
    id: "FM-08", title: "Full mobile access",
    module: "FM", moduleLabel: "Module 01 — Facility Management",
    priority: "Must", phase: 1, blockedBy: ["Q11"],
    story: "As a Technician, I do my whole job from my phone, including in poor-connectivity areas.",
    ac: [
      "All technician and FM day-to-day flows usable on Android/iOS.",
      "Push notifications for assignments and escalations; camera-first capture.",
    ],
    relates: ["SC-05", "SC-09", "FM-03", "FM-06"],
  },

  // ── Module 02 — Estate Management ────────────────────────────────────────
  {
    id: "EM-01", title: "Service charge & billing",
    module: "EM", moduleLabel: "Module 02 — Estate Management",
    priority: "Must", phase: 1, blockedBy: ["Q10"],
    story: "As an Estate Manager, I issue charges and track collection so cash flow is predictable.",
    ac: [
      "Charge setup per unit type/size: recurring cycles, one-off levies, penalties/discounts (configurable).",
      "Invoices generated and delivered in-app + email/SMS; residents pay in-app via gateway (SC-02).",
      "Payments auto-reconcile to invoices; partial payments, receipts and arrears aging supported.",
      "Statements per unit/resident; accounting export.",
    ],
    relates: ["SC-02", "SC-09", "AI-E-03", "FM-07", "FM-04"],
  },
  {
    id: "EM-02", title: "Residents & visitor management",
    module: "EM", moduleLabel: "Module 02 — Estate Management",
    priority: "Must", phase: 1, blockedBy: ["Q7", "Q9"],
    story: "As an Estate Manager, I onboard residents and control guest access so I know who is on the estate.",
    ac: [
      "Resident onboarding (invite + profile) linked to unit(s); move-in/move-out; household members supported.",
      "Visitor invites generate time-bound codes/QR verified by Security at the gate; visitor log retained per NDPA retention policy (§12).",
    ],
    relates: ["SC-01", "SC-10", "EM-06", "FM-04"],
  },
  {
    id: "EM-03", title: "Maintenance request portal",
    module: "EM", moduleLabel: "Module 02 — Estate Management",
    priority: "Must", phase: 1, blockedBy: [],
    story: "As a Resident, I raise a request with photos and track it to resolution without chasing anyone.",
    ac: [
      "Request: category, description, photos -> ticket ID with visible status.",
      "Requests feed the shared work-order pipeline (FM-03) with estate routing.",
      "Resident notified on each state change and can rate the resolution.",
    ],
    relates: ["FM-03", "SC-09", "AI-E-01", "AI-E-02"],
  },
  {
    id: "EM-04", title: "Announcements & communication",
    module: "EM", moduleLabel: "Module 02 — Estate Management",
    priority: "Must", phase: 1, blockedBy: ["Q6"],
    story: "As an Estate Manager, I reach the right residents on the channels they actually read.",
    ac: [
      "Broadcast and targeted (estate/building/audience) sends via in-app, push, SMS, email per user preference (SC-09).",
      "Delivery/read statistics visible to managers.",
      "AI drafting/translation (AI-E-04) ALWAYS requires manager approval before send.",
    ],
    relates: ["SC-09", "SC-03", "AI-E-04"],
  },
  {
    id: "EM-05", title: "Facility booking",
    module: "EM", moduleLabel: "Module 02 — Estate Management",
    priority: "Should", phase: 2, blockedBy: [],
    story: "As a Resident, I book shared amenities without a WhatsApp back-and-forth.",
    ac: [
      "Amenity setup: capacity, hours, rules, optional fees.",
      "Availability calendar; auto- or manager-approval per amenity; fees paid via gateway; cancellation per policy.",
    ],
    relates: ["SC-04", "SC-02", "FM-04", "AI-S-05"],
  },
  {
    id: "EM-06", title: "Security & SOS alerts",
    module: "EM", moduleLabel: "Module 02 — Estate Management",
    priority: "Must", phase: 1, blockedBy: ["Q4"],
    story: "As a Resident, I trigger an SOS and know security has seen it.",
    ac: [
      "SOS alerts security desk and designated responders with unit/location; acknowledge -> responding -> resolved with timestamps (§10).",
      "Patrol and incident logging for security staff; all security events audit-logged.",
      "SOS submission works on poor connectivity with SMS fallback (proposed).",
    ],
    relates: ["SC-09", "SC-10", "SC-03", "EM-02", "AI-E-06"],
  },
  {
    id: "EM-07", title: "Vendor / staff directory",
    module: "EM", moduleLabel: "Module 02 — Estate Management",
    priority: "Should", phase: 2, blockedBy: [],
    story: "As a Resident, I find approved vendors and estate staff without asking around.",
    ac: ["Searchable directory with services and contact routes; visibility rules per role (§7)."],
    relates: ["FM-05", "SC-01"],
  },
  {
    id: "EM-08", title: "Document management",
    module: "EM", moduleLabel: "Module 02 — Estate Management",
    priority: "Should", phase: 2, blockedBy: ["Q7"],
    story: "As an Estate Manager, I publish estate documents once and the right people can always find them.",
    ac: [
      "Upload/organise with folder and permission control; residents see documents shared to their audience.",
      "All stored documents indexed for AI document intelligence (AI-S-03).",
    ],
    relates: ["AI-S-03", "AI-E-01", "SC-07", "SC-01"],
  },
  {
    id: "EM-09", title: "Marketplace",
    module: "EM", moduleLabel: "Module 02 — Estate Management",
    priority: "Should", phase: 2, blockedBy: ["Q3"],
    story: "As a Resident, I buy services from approved vendors inside the app.",
    ac: [
      "Vendors list products/services; residents browse, order and pay via gateway.",
      "Order lifecycle (placed -> accepted -> fulfilled -> closed) with notifications.",
      "Commission/payout model per commercial decision — Q3 BLOCKS BUILD OF PAYOUTS.",
    ],
    relates: ["SC-04", "SC-02", "FM-05", "AI-E-05", "AI-S-05"],
  },

  // ── Shared core platform ─────────────────────────────────────────────────
  {
    id: "SC-01", title: "Multi-user profiles & RBAC",
    module: "SC", moduleLabel: "Shared core platform",
    priority: "Must", phase: 1, blockedBy: ["Q1", "Q2"],
    story: "As any user, I see and do only what my role allows — enforced by the server, not the UI.",
    ac: [
      "Roles and access per §7, tenant- and estate-scoped; deny-by-default on every API.",
      "Session and password policy; MFA for admin roles (proposed in SC-01, firm target in §12).",
    ],
    relates: ["SC-07", "SC-10", "AI-S-06", "SC-06"],
  },
  {
    id: "SC-02", title: "Payments integration",
    module: "SC", moduleLabel: "Shared core platform",
    priority: "Must", phase: 1, blockedBy: ["Q10", "Q3"],
    story: "As a Resident, I pay any charge in-app and it reconciles itself.",
    ac: [
      "Gateway abstraction (provider per §13: Paystack / Flutterwave, decided at kickoff) supporting cards, transfers and USSD where available.",
      "Webhook-confirmed payments with idempotency and retries; refund/void; per-tenant reconciliation report.",
    ],
    relates: ["EM-01", "EM-05", "EM-09", "SC-04"],
  },
  {
    id: "SC-03", title: "Core integrations",
    module: "SC", moduleLabel: "Shared core platform",
    priority: "Must", phase: 1, blockedBy: ["Q12"],
    story: "As the platform, I send SMS/email and render maps through swappable providers.",
    ac: [
      "SMS/email behind an abstraction with template management and delivery-failure handling/logs; maps for locations.",
      "Providers per §13.2: SMS Termii/Twilio (kickoff), Email SES/SendGrid/Mailgun (kickoff), Maps Google Maps Platform (design phase).",
    ],
    relates: ["SC-09", "SC-07", "EM-01", "EM-04", "EM-06"],
  },
  {
    id: "SC-04", title: "E-commerce / marketplace infrastructure",
    module: "SC", moduleLabel: "Shared core platform",
    priority: "Should", phase: 2, blockedBy: ["Q3"],
    story: "As the platform, I provide shared catalog/order/payment services that EM-09 consumes.",
    ac: ["Catalog, cart/order and payment services shared between marketplace and paid bookings."],
    relates: ["EM-09", "EM-05", "SC-02", "AI-S-05"],
  },
  {
    id: "SC-05", title: "Mobile apps (Android, iOS)",
    module: "SC", moduleLabel: "Shared core platform",
    priority: "Must", phase: 1, blockedBy: ["Q11", "Q6"],
    story: "As a user, I get the same product on Android and iOS.",
    ac: [
      "Single cross-platform codebase (framework decision at kickoff); Android AAB + iOS builds.",
      "Distribution: Play Store + TestFlight/IPA per v1.0 — production App Store release is open question Q11.",
      "Push via FCM/APNs; crash and performance reporting wired in.",
    ],
    relates: ["FM-08", "SC-09", "SC-06"],
  },
  {
    id: "SC-06", title: "Web app & admin dashboard",
    module: "SC", moduleLabel: "Shared core platform",
    priority: "Must", phase: 1, blockedBy: ["Q1", "Q6"],
    story: "As an operator, I run everything from a browser.",
    ac: [
      "Responsive web app for residents/managers.",
      "Platform admin console for tenant management, configuration and audit views.",
      "§12: WCAG 2.1 AA for web; key screens interactive <3s on 4G; all UI strings externalised.",
    ],
    relates: ["SC-01", "SC-07", "SC-08", "SC-10", "FM-07", "AI-S-01"],
  },
  {
    id: "SC-07", title: "Multi-tenant deployment",
    module: "SC", moduleLabel: "Shared core platform",
    priority: "Must", phase: 1, blockedBy: ["Q1", "Q2", "Q7", "Q8", "Q12"],
    story: "As Platform Admin, I onboard a new organisation without touching code, and tenants can never see each other.",
    ac: [
      "All §8.2 isolation requirements met; cross-tenant access tests pass in CI (release-blocking).",
      "Tenant onboarding (org > estates/units bulk import, branding, settlement account, languages, enabled features).",
      "Per-tenant configuration: branding, notification templates, amenity rules, charge structures, AI feature flags and usage caps.",
      "Per-tenant usage metering for AI, SMS and email.",
    ],
    relates: ["SC-01", "SC-03", "SC-06", "AI-S-06"],
  },
  {
    id: "SC-08", title: "Investor off-plan dashboard",
    module: "SC", moduleLabel: "Shared core platform",
    priority: "Should", phase: 2, blockedBy: [],
    story: "As an Investor, I track my projects' sales, occupancy and returns.",
    ac: [
      "Off-plan projects with sales pipeline, occupancy and returns; investors see only their projects.",
      "AI projections (AI-S-04) always labelled as estimates with assumptions shown.",
    ],
    relates: ["AI-S-04", "SC-11", "SC-01", "FM-07"],
  },
  {
    id: "SC-09", title: "Notifications engine",
    module: "SC", moduleLabel: "Shared core platform",
    priority: "Must", newInV2: true, phase: 1, blockedBy: ["Q6"],
    story: "As a user, I get the right alerts on the right channel — and can control them.",
    ac: [
      "Unified service for push/SMS/email/in-app used by all modules (single event bus).",
      "Per-user channel preferences and quiet hours; per-tenant templates; delivery logging.",
      "§10: every state transition in every workflow is notified via SC-09.",
    ],
    relates: ["SC-03", "SC-05", "FM-03", "FM-05", "EM-01", "EM-04", "EM-06", "EM-09"],
  },
  {
    id: "SC-10", title: "Audit logging",
    module: "SC", moduleLabel: "Shared core platform",
    priority: "Must", newInV2: true, phase: 1, blockedBy: ["Q7"],
    story: "As a compliance owner, I can reconstruct who did what, when.",
    ac: [
      "Immutable log of auth events, permission changes, financial actions, security events and AI overrides — actor, tenant, timestamp.",
      "12-month retention (proposed); queryable from the admin console.",
    ],
    relates: ["SC-06", "SC-01", "EM-06", "FM-01", "AI-S-06"],
  },
  {
    id: "SC-11", title: "Landing page",
    module: "SC", moduleLabel: "Shared core platform",
    priority: "Should", phase: 2, blockedBy: ["Q1"],
    story: "As a prospect or investor, I learn about the platform and register interest.",
    ac: ["Public marketing page with lead capture into the investor pipeline (proposed)."],
    relates: ["SC-08", "AI-S-04"],
  },
];

export const AI_REQUIREMENT_IDS = [
  "AI-F-01","AI-F-02","AI-F-03","AI-F-04","AI-F-05",
  "AI-E-01","AI-E-02","AI-E-03","AI-E-04","AI-E-05","AI-E-06",
  "AI-S-01","AI-S-02","AI-S-03","AI-S-04","AI-S-05","AI-S-06",
] as const;

/** Sanity: FM 8 + EM 9 + SC 11 = 28 non-AI, + 17 AI = 45 total. */
export const TOTAL_REQUIREMENT_COUNT = REQUIREMENTS.length + AI_REQUIREMENT_IDS.length; // 45
