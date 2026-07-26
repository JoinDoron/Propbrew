# Workflow state machines (PRD §10 + all lifecycle language elsewhere in the PRD)

## Summary
PRD §10 defines five state machines as a hard contract between backend, mobile and QA: Work order (FM-03), Service charge (EM-01), Booking (EM-05), SOS event (EM-06) and Marketplace order (EM-09), governed by the invariant "Only the listed transitions are legal; every transition is timestamped, actor-attributed and notified via SC-09". §10 gives state NAMES and a handful of SLA/rule sentences, but it does NOT give the transition graph, actor attribution per transition, or guards — those must be derived from §7 (roles matrix), §9 (acceptance criteria) and §12.1 (offline), and every derived edge is flagged here with provenance so it is confirmed rather than silently shipped. Only four numeric SLA defaults exist in the whole PRD: Emergency work order respond 2h / resolve 24h, Routine resolve 72h, work-order auto-close after 5 days, SOS acknowledge <60s during manned hours; plus one reminder cadence (−3d, due, +7d, +21d). Everything else marked "per tenant", "per policy" or "within SLA" (booking cancellation window, arrears aging thresholds, escalation policy, marketplace vendor accept SLA) has NO proposed value in the PRD and is a build-blocking gap. AI touches four of the five workflows (AI-F-02/AI-E-02 triage, AI-E-03 arrears intelligence, AI-S-05/AI-E-05 fraud on bookings and orders, AI-E-06 optional security) and in every case §11.4 forbids autonomy — AI may only decorate a transition with a suggestion a human confirms, it may never fire a transition; SOS is the one workflow with no AI in its default acceptance.

### Governing invariant: §10 is a closed-world contract, not a sketch
*Requirements: SC-01, SC-07, SC-09, SC-10, FM-03, SC-02*

Verbatim from §10: "State machines below are the contract between backend, mobile and QA. Only the listed transitions are legal; every transition is timestamped, actor-attributed and notified via SC-09. SLA values are proposed defaults, configurable per tenant."

Four consequences that must be encoded, not just documented:

1. CLOSED WORLD. Any edge not listed is illegal. The server must reject unknown (from,event) pairs with a deny-by-default response (SC-01: "deny-by-default on every API"). This is the reason every derived edge in the artifacts below carries `provenance: 'derived-proposed'` — a CI test should assert that only `prd-explicit` and `prd-implied` transitions are reachable in production builds until a Change Request (Clause 10, §6.3) signs off the rest.

2. TIMESTAMPED. Every transition record carries `occurredAt` (server clock) and, because of §12.1 offline queued writes, also `clientOccurredAt` — the two diverge for technician updates made offline. FM-03 requires "Lifecycle states and transitions exactly per §10 with per-priority SLA timers"; SLA measurement must be defined against one of these two clocks (open issue).

3. ACTOR-ATTRIBUTED. Every transition names a principal. Actors are the nine §7 roles plus system actors (timers, PPM scheduler FM-02, payment webhooks SC-02, per-tenant rules e.g. EM-05 auto-approval). SC-10 requires an "Immutable log of auth events, permission changes, financial actions, security events and AI overrides — actor, tenant, timestamp", 12-month retention (proposed), queryable from the admin console. Financial transitions (service charge, marketplace refunds, booking fees) and all SOS transitions are explicitly in SC-10's mandatory set.

4. NOTIFIED VIA SC-09. Every transition emits an event on the single event bus. SC-09: "Unified service for push/SMS/email/in-app used by all modules (single event bus). Per-user channel preferences and quiet hours; per-tenant templates; delivery logging." A transition is not complete until its notification is enqueued; delivery is logged separately.

Cross-cutting guards on EVERY transition in all five machines: (a) tenant scope — §8.2 "no query, file, search index, AI retrieval or report may cross tenants below Platform Admin", verified by release-blocking CI tests (SC-07); (b) RBAC per §7, server-side; (c) idempotency — a replayed offline transition must be a no-op, not a double-apply.

### WORK ORDER — full state machine (FM-03, source workflow for EM-03, FM-02, FM-06)
*Requirements: FM-03, FM-02, FM-05, FM-06, FM-07, FM-08, EM-03, AI-F-02, AI-E-02, AI-F-05, SC-09, SC-10, SC-01*

PRD §10 verbatim states: "New → Triaged → Assigned → In Progress → On Hold → Resolved → Verified → Closed; branches: Rejected, Cancelled".
PRD §10 verbatim rules: "AI triage suggests category/priority/assignee; human confirms (AI-F/E triage). SLA timers per priority (e.g. Emergency: respond 2h / resolve 24h; Routine: 72h). Resolved → Verified by requester or manager; auto-close after 5 days (proposed)."

STATES (10): New, Triaged, Assigned, InProgress, OnHold, Resolved, Verified, Closed | branches Rejected, Cancelled.
TERMINAL (3): Closed, Rejected, Cancelled. Verified is pseudo-terminal (auto-closes).

ENTRY POINTS into `New` (five distinct origins, all converge on one pipeline):
- Resident request (EM-03): "Request: category, description, photos → ticket ID with visible status" and "Requests feed the shared work-order pipeline (FM-03) with estate routing." Actor: Resident (§7 Work orders = O).
- Manager-created. Actor: FacilityManager or EstateManager (§7 = M).
- PPM scheduler (FM-02): "Scheduler auto-generates work orders ahead of due date; calendar view; overdue flagged." Actor: System.Scheduler. Lead time is a PPM plan field.
- Failed inspection item (FM-06): "Failed items auto-raise work orders (FM-03)." Actor: System.Rule, triggered by inspection completion; AI-F-03 may have drafted the defect but "Inspector edits and approves every report" so the human approval of the report is what fires the raise.
- Copilot drafted action (AI-F-05 / AI-S-01): "drafted actions (e.g. raise WO)" — "Every drafted action requires explicit user confirmation." Actor: the confirming human, never the AI.

LEGAL TRANSITIONS (from → to | event | actors | guards | effects):
T01 (none) → New | CREATE | Resident(O), FacilityManager(M), EstateManager(M), System.Scheduler, System.Rule | guard: tenant+estate scope; category/description present; photos optional (EM-03) | effects: issue ticket ID visible to requester (EM-03); compute AI triage suggestion (AI-F-02/AI-E-02) with confidence; start response + resolve SLA clocks; SC-10 audit; SC-09 notify requester + dispatch queue. [prd-implied]
T02 New → Triaged | TRIAGE | FacilityManager(M), EstateManager(M) | guard: category + priority set; assignee candidate chosen | effects: AI suggestion accepted or overridden — "Dispatcher confirms or overrides; overrides logged for tuning" (AI-F-02); override written to AI interaction log (§8.1) for tuning; priority fixes which SLA profile applies. [prd-explicit]
T03 New → Rejected | REJECT | FacilityManager(M), EstateManager(M) | guard: rejection reason (proposed — not in PRD) | effects: notify requester with reason. [prd-explicit branch]
T04 New → Cancelled | CANCEL | Resident(O, own request only), FacilityManager(M), EstateManager(M) | effects: notify requester + any watchers. [prd-explicit branch]
T05 Triaged → Assigned | ASSIGN | FacilityManager(M), EstateManager(M) | guard: assignee is an internal Technician OR a Vendor — FM-03 "Assign to internal technician or vendor"; vendor must be active with non-expired documents (FM-05 "documents (insurance/certifications) with expiry alerts") | effects: push to assignee (FM-08 "Push notifications for assignments and escalations"); vendor sees it in the vendor portal (FM-05); response SLA clock stops (proposed reading). [prd-explicit]
T06 Triaged → Rejected | REJECT | FacilityManager(M), EstateManager(M). [prd-explicit branch]
T07 Triaged → Cancelled | CANCEL | Resident(O), FacilityManager(M), EstateManager(M). [prd-explicit branch]
T08 Assigned → Assigned | REASSIGN (self-transition) | FacilityManager(M), EstateManager(M) | FM-03: "reassignment and every state change tracked and notified" | effects: notify old assignee (unassigned) AND new assignee; append to assignment history; does NOT reset SLA clocks (proposed). [prd-explicit]
T09 Assigned → InProgress | START | Technician(O), Vendor(O) | effects: work-start timestamp; feeds MTTR KPI (§14 "mean time to resolve"); offline-capable per §12.1. [prd-explicit]
T10 Assigned → Cancelled | CANCEL | FacilityManager(M), EstateManager(M). [prd-explicit branch]
T11 InProgress → OnHold | HOLD | Technician(O), Vendor(O), FacilityManager(M), EstateManager(M) | guard: hold reason (awaiting parts / awaiting access / awaiting vendor / awaiting approval — categories NOT in PRD) | effects: whether the resolve SLA clock pauses is UNDEFINED in the PRD (open issue). [prd-explicit]
T12 OnHold → InProgress | RESUME | Technician(O), Vendor(O), FacilityManager(M), EstateManager(M). [prd-implied — without it OnHold is a trap]
T13 InProgress → Resolved | RESOLVE | Technician(O), Vendor(O) | guards: FM-03 "Capture photos, notes, parts and costs"; for PPM-generated WOs FM-02 "Completion requires checklist + evidence photo (configurable)" | effects: notify requester (FM-03 "requester notified on state changes", EM-03 "Resident notified on each state change"); start the 5-day auto-close clock; open the verification window; costs roll into FM-07 "cost by category/estate". [prd-implied — the §10 chain literally routes InProgress→OnHold→Resolved; see open issue]
T14 OnHold → Resolved | RESOLVE | Technician(O), Vendor(O) | same guards/effects as T13. [prd-explicit under the literal chain reading]
T15 InProgress → Cancelled | CANCEL | FacilityManager(M), EstateManager(M). [prd-explicit branch]
T16 OnHold → Cancelled | CANCEL | FacilityManager(M), EstateManager(M). [prd-explicit branch]
T17 Resolved → Verified | VERIFY | Requester (Resident O / FacilityManager M / EstateManager M) — §10 verbatim "Resolved → Verified by requester or manager" | effects: cancel the auto-close timer; unlock resident rating (EM-03 "can rate the resolution") feeding §14 "resident satisfaction score" and FM-05 vendor "rating". [prd-explicit]
T18 Resolved → Closed | AUTO_CLOSE | System.Timer | guard: 5 days elapsed in Resolved with no verification — §10 "auto-close after 5 days (proposed)" | effects: mark `autoClosed: true` so QA and analytics can separate verified from lapsed closures. [prd-explicit, value proposed]
T19 Verified → Closed | CLOSE | FacilityManager(M), EstateManager(M) (or System.Timer under the alternative reading of the 5-day rule) | effects: freeze costs; record SLA hit/miss against the priority profile, feeding FM-05 "SLA hit rate" and FM-07 "open/overdue WOs, PPM compliance %". [prd-explicit]
T20 Resolved → InProgress | REOPEN (verification failed) | Requester or manager | NOT IN THE PRD. Under the §10 closed-world rule this is currently ILLEGAL, which means a resident who verifies-and-rejects has no path. Flagged as a build-blocking open issue. [derived-proposed — do not ship without sign-off]

Rejected / Cancelled / Closed accept no further events.

SLA TIMERS:
- WO-RESPOND-EMERGENCY: 2h (PT2H). §10 "Emergency: respond 2h". Runs in New/Triaged. On expiry: escalate (FM-08 "Push notifications for assignments and escalations"). Configurable per tenant.
- WO-RESOLVE-EMERGENCY: 24h (PT24H). §10 "resolve 24h". Runs New→Resolved.
- WO-RESOLVE-ROUTINE: 72h (PT72H). §10 "Routine: 72h".
- WO-RESPOND-ROUTINE: NO VALUE IN PRD.
- WO-AUTOCLOSE: 5 days (P5D), runs in Resolved, fires T18. §10 "(proposed)".
- PPM overdue flag: FM-02 "overdue flagged" — a display flag on the WO when past its PPM due date, not a state.
Priority taxonomy: the PRD names only Emergency and Routine, and prefixes them "e.g." — the full priority enum is undefined, which also blocks the AI-F-02 eval set ("suggested category, priority and best-fit assignee").

OFFLINE (§12.1): work-order updates are queued writes with visible sync status; "Conflict resolution is server-authoritative; overwritten offline edits are surfaced to the user and audit-logged." So transitions must carry a client-generated idempotency key, and a rejected offline transition must produce a user-visible surface plus an SC-10 audit entry.

### SERVICE CHARGE — full state machine (EM-01)
*Requirements: EM-01, SC-02, SC-09, SC-10, AI-E-03, Q10*

PRD §10 verbatim states: "Draft → Issued → Partially paid → Paid; Issued → Overdue → In arrears → Escalated".
PRD §10 verbatim rules: "Reminder schedule (e.g. −3d, due, +7d, +21d) via SC-09; AI timing suggestions (AI-E-03) require manager approval. Escalation policy per tenant."

Note this is the only §10 machine written as TWO chains, not one — a happy path and an arrears path, both hanging off Issued. That is structurally significant: Overdue/InArrears/Escalated are a parallel arrears track, and the PRD never draws the edges back from that track to Paid.

STATES (7): Draft, Issued, PartiallyPaid, Paid, Overdue, InArrears, Escalated.
TERMINAL (1): Paid. Escalated has no defined exit (open issue).

LEGAL TRANSITIONS:
S01 (none) → Draft | CREATE | EstateManager (§7 Charges & invoicing = M; FacM has no access, Resident is O/view-own) | EM-01: "Charge setup per unit type/size: recurring cycles, one-off levies, penalties/discounts (configurable)" | effects: bind to unit/resident; set amount + due date. [prd-implied]
S02 Draft → Issued | ISSUE | EstateManager(M) | guard: due date set; unit has a billable resident | effects: EM-01 "Invoices generated and delivered in-app + email/SMS"; SC-09 delivery per user channel preference honouring quiet hours; arm the four reminder timers relative to due date. [prd-explicit]
S03 Issued → PartiallyPaid | PAYMENT_CONFIRMED (partial) | System.Webhook (SC-02 "Webhook-confirmed payments with idempotency and retries"), initiated by Resident (§7 Payments = O for Resident ONLY — no other role can pay in-app) | guard: 0 < amount < outstanding balance | effects: EM-01 "Payments auto-reconcile to invoices; partial payments, receipts and arrears aging supported"; issue receipt; recompute balance. [prd-explicit]
S04 PartiallyPaid → PartiallyPaid | PAYMENT_CONFIRMED (further partial, self-transition) | System.Webhook. [prd-implied]
S05 PartiallyPaid → Paid | PAYMENT_CONFIRMED (settles balance) | System.Webhook | effects: cancel remaining reminders; receipt; feeds §14 "Service-charge collection rate · on-time payment %". [prd-explicit]
S06 Issued → Paid | PAYMENT_CONFIRMED (full) | System.Webhook | effects: as S05; if paid on/before due date, count toward "on-time payment %". [prd-explicit]
S07 Issued → Overdue | DUE_DATE_PASSED | System.Timer | guard: due date + grace period elapsed with outstanding balance > 0. GRACE PERIOD HAS NO PRD VALUE. | effects: begin arrears aging (EM-01 "arrears aging"); the +7d and +21d reminders continue to fire from this state; a configured penalty may be applied per EM-01 "penalties/discounts (configurable)" — but see the AI constraint below. [prd-explicit]
S08 Overdue → InArrears | AGE | System.Timer | guard: aging threshold per tenant — NO PRD VALUE. [prd-explicit]
S09 InArrears → Escalated | ESCALATE | System.Rule or EstateManager(M) | §10 "Escalation policy per tenant" — policy content undefined. [prd-explicit]
S10 Overdue → PartiallyPaid | PAYMENT_CONFIRMED (partial) | System.Webhook. [prd-implied — not drawn in §10 but required; a resident must be able to pay a late charge]
S11 Overdue → Paid | PAYMENT_CONFIRMED (full). [prd-implied]
S12 InArrears → PartiallyPaid / Paid | PAYMENT_CONFIRMED. [prd-implied]
S13 Escalated → PartiallyPaid / Paid | PAYMENT_CONFIRMED. [prd-implied]
S14 Draft → Void | VOID | EstateManager(M) — NOT IN PRD. No cancel/void/write-off state exists; a charge raised in error has no legal exit. [derived-proposed]
S15 any paid state → Refunded | REFUND | NOT IN PRD as a charge state, although SC-02 requires "refund/void" at the payment layer. [derived-proposed]

REMINDER TIMERS (SC-09, all relative to due date, §10 proposed defaults):
- R1 at due − 3 days (fires while Issued/PartiallyPaid)
- R2 on due date
- R3 at due + 7 days (fires while Overdue/InArrears)
- R4 at due + 21 days
All four are cancelled the moment the charge reaches Paid. Channel selection per SC-09 "Per-user channel preferences and quiet hours"; delivery logged. EM-01 requires delivery "in-app + email/SMS" — SMS via the Termii/Twilio abstraction (§13.2 SMS, decide by kickoff), metered per tenant (§8.2 cost metering).

CRITICAL AI CONSTRAINT — the sharpest HITL rule in the PRD: AI-E-03 "Managers approve reminder campaigns; NO AUTOMATED PENALTIES EVER." EM-01 permits configurable penalties, so the machine must distinguish (a) a deterministic, manager-configured penalty rule attached to S07 — permitted — from (b) any AI-influenced penalty — forbidden outright. Equally, the reminder timers R1–R4 fire automatically on the FIXED schedule (that is the AI-E-03 fallback: "Fallback: fixed reminder schedule"), but any AI-retimed or AI-targeted campaign must sit behind an explicit manager approval step before send.

RECONCILIATION: Q10 ("Payment reconciliation source of truth — gateway settlement vs bank statements", owner Client, needed Phase 1) determines what legally constitutes Paid. Until answered, the transition into Paid cannot be finalised. SC-02 also requires a "per-tenant reconciliation report" and per-tenant settlement accounts (§8.1 Payment: "Webhook-confirmed; idempotent; per-tenant settlement account").

### BOOKING — full state machine (EM-05)
*Requirements: EM-05, SC-02, SC-04, SC-09, AI-S-05, AI-E-05, AI-E-01*

PRD §10 verbatim states: "Requested → Approved / Auto-approved → Confirmed → Completed; branches: Declined, Cancelled".
PRD §10 verbatim rules: "Auto-approval per amenity rules; payment (if fees) required to confirm; cancellation window per policy."
EM-05 acceptance criteria: "Amenity setup: capacity, hours, rules, optional fees." / "Availability calendar; auto- or manager-approval per amenity; fees paid via gateway; cancellation per policy."

STATES: Requested, Approved, AutoApproved, Confirmed, Completed | branches Declined, Cancelled.
MODELLING RECOMMENDATION: Approved and AutoApproved are the same logical state reached by two routes. Encode as a single `Approved` state with a discriminant `approvalMode: 'manual' | 'auto'` — the downstream transition set is identical and duplicating the state doubles every outgoing edge. Flagged as an open issue because §10's slash notation is ambiguous.
TERMINAL (3): Completed, Declined, Cancelled.

LEGAL TRANSITIONS:
B01 (none) → Requested | REQUEST | Resident (§7 Bookings & amenities = O for Res; EstM = M; Sec = V; Plat/Exec = V) | guards: slot within amenity hours; capacity not exceeded; amenity rules satisfied (EM-05) | effects: hold the slot on the availability calendar; notify EstateManager if manual approval. [prd-implied]
B02 Requested → Approved | APPROVE | EstateManager(M) | guard: amenity is configured for manager approval. [prd-explicit]
B03 Requested → AutoApproved | AUTO_APPROVE | System.Rule | guard: §10 "Auto-approval per amenity rules" satisfied. [prd-explicit]
B04 Requested → Declined | DECLINE | EstateManager(M) | effects: release the held slot; notify resident. [prd-explicit branch]
B05 Requested → Cancelled | CANCEL | Resident(O), EstateManager(M) | effects: release slot. [prd-explicit branch]
B06 Approved|AutoApproved → Confirmed | CONFIRM (no fee) | System.Rule | guard: amenity has no fee → confirm immediately. [prd-explicit — "payment (if fees) required to confirm" implies fee-free bookings confirm without payment]
B07 Approved|AutoApproved → Confirmed | PAYMENT_CONFIRMED | System.Webhook, initiated by Resident | guard: amenity has a fee AND gateway webhook confirms (SC-02); order/payment handled by the shared SC-04 services — "Catalog, cart/order and payment services shared between marketplace and paid bookings" | effects: receipt; slot firmly booked. [prd-explicit]
B08 Approved|AutoApproved → Cancelled | CANCEL | Resident(O) within the cancellation window, EstateManager(M) any time | §10 "cancellation window per policy"; EM-05 "cancellation per policy". WINDOW LENGTH AND REFUND RULE HAVE NO PRD VALUE. [prd-explicit branch]
B09 Confirmed → Completed | COMPLETE | trigger UNSPECIFIED in PRD — candidates: System.Timer at slot end, EstateManager(M), or Security(V→needs M) check-out | effects: free the amenity; feed utilisation reporting. [prd-explicit state, trigger derived-proposed]
B10 Confirmed → Cancelled | CANCEL | Resident(O) inside the cancellation window, EstateManager(M) | effects: if a fee was paid, refund per policy via SC-02 "refund/void". REFUND POLICY NOT SPECIFIED. [prd-explicit branch]
B11 Approved|AutoApproved → Expired (unpaid slot released) | NOT IN PRD. Without it, an approved-but-never-paid booking holds a slot forever. [derived-proposed]
B12 Confirmed → NoShow | NOT IN PRD — no no-show state exists. [derived-proposed]

TIMERS: the PRD proposes NO numeric value for any booking timer. The cancellation window is the only timer named ("per policy"), and there is no payment-hold expiry. This is the least-specified of the five machines.

SECURITY VISIBILITY: §7 gives Security V on Bookings & amenities — the gate/desk can see who has booked what, but cannot transition a booking. If B09 is to be a security check-out action, §7 must be amended (Security would need M).

AI: bookings are named in AI-S-05 — "Recommendation & fraud engine — shared personalisation and anomaly service behind AI-E-05 and bookings" (priority: Could). HITL is inherited from AI-E-05: "Fraud flags go to a human review queue — never auto-block." Therefore a fraud flag on a booking is METADATA, never a state and never a transition. AI-E-01 (resident chatbot) can answer booking questions from the RAG corpus but must escalate to a ticket when unsourced; AI-F-05/AI-S-01 copilot may draft a booking action requiring explicit confirmation.

### SOS EVENT — full state machine (EM-06) — safety-critical, no branches, no AI
*Requirements: EM-06, SC-09, SC-10, AI-E-06, Q4, Q5*

PRD §10 verbatim states: "Raised → Acknowledged → Responding → Resolved → Reviewed".
PRD §10 verbatim rules: "Acknowledge target < 60s during manned hours (proposed); unacknowledged alerts escalate to backup responders; full timeline retained for review."
EM-06 acceptance criteria: "SOS alerts security desk and designated responders with unit/location; acknowledge → responding → resolved with timestamps (§10)." / "Patrol and incident logging for security staff; all security events audit-logged." / "SOS submission works on poor connectivity with SMS fallback (proposed)."
§8.1 SOS event entity: "Panic alert with acknowledge/resolve trail. Links resident/unit, responders, timestamps."

STATES (5): Raised, Acknowledged, Responding, Resolved, Reviewed. This is the ONLY §10 machine with no branch states at all — strictly linear.
TERMINAL (1): Reviewed.

LEGAL TRANSITIONS:
X01 (none) → Raised | RAISE | Resident (§7 Security & SOS = O for Res; EstM = M; Sec = M; Plat/Exec = V) | channels: in-app; queued offline write (§12.1 "Queued writes for work-order updates, inspection logs and SOS (SMS fallback for SOS, proposed), with visible sync status"); SMS fallback | effects: alert the security desk AND designated responders with unit/location (EM-06); start the 60s acknowledge clock; SC-10 audit ("security events" are named explicitly in SC-10's mandatory log set). [prd-implied]
X02 Raised → Acknowledged | ACKNOWLEDGE | Security(M), designated responder | SLA: <60s during manned hours | effects: notify the raising resident — the EM-06 user story is literally "I trigger an SOS and know security has seen it", so the acknowledge notification back to the resident is a functional requirement, not a nicety; stop the acknowledge clock. [prd-explicit]
X03 Acknowledged → Responding | RESPOND | Security(M), designated responder | effects: responder identity + timestamp on the trail; no SLA given. [prd-explicit]
X04 Responding → Resolved | RESOLVE | Security(M), designated responder | effects: incident log entry (EM-06 "Patrol and incident logging"); no SLA given. [prd-explicit]
X05 Resolved → Reviewed | REVIEW | EstateManager(M) | §10 "full timeline retained for review" | effects: close out the post-incident review; the full actor-attributed, timestamped timeline is the review artefact. [prd-explicit]
X06 Raised → Cancelled/FalseAlarm | NOT IN PRD — there is NO cancel or false-alarm state. An accidentally triggered panic alert can only be discharged by a responder walking it through Acknowledged → Responding → Resolved. Safety-critical gap; ties directly to Q4. [derived-proposed]

ESCALATION — MODELLING CALL: §10 says "unacknowledged alerts escalate to backup responders" but lists NO Escalated state. Encode escalation as a TIMER SIDE-EFFECT that fires while the event remains in `Raised` — it notifies BackupResponders and sets an `escalated: true` flag, but does NOT change state. Adding an Escalated state would violate the §10 closed-world rule. This must be confirmed.

TIMERS:
- SOS-ACK: 60 seconds (PT60S), active in Raised, on expiry ESCALATE to backup responders (state unchanged). §10 "(proposed)", configurable per tenant. Applies "during manned hours" — manned-hours definition and unmanned-hours behaviour are undefined and owned by Q4.
- No timer exists for Acknowledged→Responding, Responding→Resolved or Resolved→Reviewed.

Q4 IS THE BLOCKER: "SOS operating model: who responds, escalation chain, liability and manned hours. Why it matters: Safety-critical flow; drives EM-06 SLAs and staffing. Owner: Client. Needed by: Phase 1." The responder roster, the backup-responder chain and the manned-hours calendar are all inputs this machine cannot be built without.

SC-09 CONFLICT: SC-09 mandates "Per-user channel preferences and quiet hours". Quiet hours are exactly when an SOS is most likely. The PRD does not state that SOS alerts override quiet hours and channel preferences — it must, and this needs explicit confirmation.

SMS FALLBACK RECONCILIATION: the SMS path (proposed) creates an out-of-band raise channel. If a resident's app also syncs a queued write for the same incident, the platform will receive two raise events. Duplicate suppression / event correlation is not specified.

AI: SOS is the ONLY one of the five workflows with no AI feature in its default acceptance. The adjacent feature is AI-E-06 "AI security & access — CCTV anomaly detection and face/plate recognition", priority Could (optional), whose HITL column reads: "Prerequisites: NDPA compliance, explicit consent and DPIA sign-off (Q5). Builds only after sign-off; integrates with client hardware (hardware out of scope)." Benchmark: "Defined during DPIA; not in default acceptance." Nothing in the PRD authorises AI to raise, acknowledge, respond to or resolve an SOS, and §11.4 forbids it generally: "every suggestion is review/approve/override — AI is assistive, not autonomous."

### MARKETPLACE ORDER — full state machine (EM-09)
*Requirements: EM-09, SC-04, SC-02, SC-09, SC-10, FM-05, AI-E-05, AI-S-05, Q3*

PRD §10 verbatim states: "Placed → Accepted → Fulfilled → Closed; branches: Declined, Refunded".
PRD §10 verbatim rules: "Vendor must accept within SLA or order auto-expires; refunds via gateway; payout model pending Q3."
EM-09 acceptance criteria: "Vendors list products/services; residents browse, order and pay via gateway." / "Order lifecycle (placed → accepted → fulfilled → closed) with notifications." / "Commission/payout model per commercial decision — open question Q3 blocks build of payouts."
SC-04 provides the substrate: "Catalog, cart/order and payment services shared between marketplace and paid bookings."
§8.1 Listing/Order entity: "Marketplace product/service and purchase. Vendor listing → resident order → payment → fulfilment."

STATES: Placed, Accepted, Fulfilled, Closed | branches Declined, Refunded | plus Expired (implied by "auto-expires" but NOT listed as a branch — see open issues).
TERMINAL: Closed, Declined, Refunded, (Expired).

LEGAL TRANSITIONS:
M01 (none) → Placed | PLACE | Resident (§7 Marketplace = O for Res; Ven = O; EstM = M; Plat/Exec = V) | guard: listing active; vendor approved (EM-07 "approved vendors") | effects: notify vendor; start the vendor accept SLA clock; payment taken here or at accept — UNDEFINED (see open issues). [prd-implied]
M02 Placed → Accepted | ACCEPT | Vendor(O) | guard: within the accept SLA | effects: notify resident (EM-09 "with notifications"). [prd-explicit]
M03 Placed → Declined | DECLINE | Vendor(O) | effects: if already paid, refund via SC-02 "refund/void"; notify resident. [prd-explicit branch]
M04 Placed → Expired | AUTO_EXPIRE | System.Timer | guard: accept SLA elapsed — §10 "Vendor must accept within SLA or order auto-expires". SLA VALUE NOT GIVEN. | effects: release/refund; notify both parties; count against the vendor's performance metrics (FM-05 "jobs completed, SLA hit rate, rating"). [prd-explicit rule, state name not listed]
M05 Accepted → Fulfilled | FULFIL | Vendor(O) | effects: notify resident. [prd-explicit]
M06 Fulfilled → Closed | CLOSE | trigger UNSPECIFIED — candidates: Resident confirmation, System.Timer auto-close (by analogy with the work-order 5-day rule, which the PRD does NOT extend here), or EstateManager(M). [prd-explicit state, trigger derived-proposed]
M07 Accepted|Fulfilled|Closed → Refunded | REFUND | authoriser UNSPECIFIED — EstateManager(M) or PlatformAdmin are the candidates; §7 gives Plat only V on Marketplace | guard: idempotent gateway refund (SC-02 "refund/void"; "Webhook-confirmed payments with idempotency and retries") | effects: SC-10 financial-action audit entry. [prd-explicit branch, actor derived]
M08 Placed → Cancelled by resident | NOT IN PRD — a resident cannot cancel their own order. [derived-proposed]

TIMERS:
- MKT-ACCEPT-SLA: value NOT GIVEN — the PRD says only "within SLA". This is the single most concrete missing number in §10. Active in Placed; on expiry fires M04.
- No fulfilment SLA, no auto-close timer, no refund window.

Q3 CONSTRAINT — PAYOUT IS NOT PART OF THIS MACHINE: Q3 ("Marketplace commercial model: commission %, escrow, vendor payout rails and KYC", owner Client, needed by Phase 2 start) "blocks EM-09 payout build". The order machine must therefore NOT conflate `Closed` with "vendor has been paid". Model settlement as a SEPARATE, deferred lifecycle keyed off the order, so that when Q3 lands (commission split, escrow-or-not, payout rails, KYC gating on vendors) it can be added without reopening the order states. Whether escrow is used will retroactively change what M01/M02 mean financially.

AI: AI-E-05 "Marketplace intelligence — listing auto-generation, personalised recommendations, fraud flags", priority Could. HITL: "Fraud flags go to a human review queue — never auto-block." Fallback: "manual listings, no recommendations." Benchmark: "Fraud-flag precision ≥ 60% at review (pilot)." AI-S-05 is the shared engine behind it. CRITICAL: a fraud flag must be an annotation plus a review-queue entry — it must NOT auto-fire M03 (Decline) or block M02. Listing auto-generation touches the Listing entity, not the Order machine.

### Actor authority derived from §7 — who may fire what, per workflow
*Requirements: SC-01, SC-07*

§7 is "the authoritative baseline" with "Server-side, deny-by-default enforcement on every API (SC-01)". Legend: F = full control, M = manage (create/edit within own tenant/estate), V = view, O = own records only, — = no access. Mapping the matrix rows onto the five machines:

WORK ORDERS row — Plat V · Exec V · EstM M · FacM M · Tech O · Res O · Sec — · Ven O · Inv —
→ Transition authority: EstateManager and FacilityManager are the only full lifecycle drivers (triage, assign, reassign, reject, cancel, close). Technician and Vendor may only transition work orders assigned to them (START, HOLD, RESUME, RESOLVE). Resident may only create and cancel their own request and verify its resolution. Security has NO access to work orders at all. Platform Admin and Executive are VIEW ONLY — neither can force a transition, which has support-desk implications (see open issues).

CHARGES & INVOICING row — Plat V · Exec V · EstM M · FacM — · Tech — · Res O · Sec — · Ven — · Inv —
PAYMENTS (PAY IN-APP) row — Res O only; every other role is —
→ EstateManager alone drives Draft→Issued and any escalation action. Resident is the ONLY role that can pay, so every payment-driven transition (S03–S06, S10–S13) is initiated by a Resident and applied by System.Webhook. FacilityManager has no billing access whatsoever.

BOOKINGS & AMENITIES row — Plat V · Exec V · EstM M · FacM — · Tech — · Res O · Sec V · Ven — · Inv —
→ EstateManager approves/declines/cancels; Resident requests, pays and cancels own; Security can only view (relevant to the unresolved Confirmed→Completed trigger).

SECURITY & SOS row — Plat V · Exec V · EstM M · FacM — · Tech — · Res O · Sec M · Ven — · Inv —
→ Security and EstateManager both have M; Security drives Acknowledge/Respond/Resolve; EstateManager is the natural owner of Resolved→Reviewed. Resident can raise own only.

MARKETPLACE row — Plat V · Exec V · EstM M · FacM — · Tech — · Res O · Sec — · Ven O · Inv —
→ Vendor accepts/declines/fulfils own orders; Resident places own; EstateManager manages (and is the only plausible refund authoriser, since Plat is V).

Encode this as a per-transition `actors` list plus a `scope` qualifier so that 'O' actors are checked against record ownership, not just role — e.g. a Technician holds O on work orders, so the guard is `assigneeId === actor.id`, not `role === 'Technician'`. §7 closes with "Fine-grained permissions per endpoint are finalised at design; this matrix is the authoritative baseline."

### AI touchpoints per workflow and the exact human-in-the-loop rule for each
*Requirements: AI-S-06, AI-F-01, AI-F-02, AI-F-03, AI-F-04, AI-F-05, AI-E-01, AI-E-02, AI-E-03, AI-E-04, AI-E-05, AI-E-06, AI-S-01, AI-S-02, AI-S-05, SC-06, SC-10, EM-04, FM-06*

§11.4 sets the universal constraint (release-blocking): "UX states: every AI surface shows loading, confidence, sources and error states; every suggestion is review/approve/override — AI is assistive, not autonomous." Also release-blocking: tenant-hard-scoped retrieval with CI leakage tests; provider abstraction with health checks so "on provider failure, features degrade to their listed fallback — core flows never block on AI"; per-tenant/per-feature usage caps with kill-switch; prompt-injection defence — "user- and document-supplied content is treated as data; the assistant cannot be instructed by it to exceed the user's permissions (§7)"; all AI interactions logged with PII minimised.
Consequence for the state machines: NO AI feature may appear in any transition's `actors` list. AI attaches to a transition as a suggestion object (value + confidence + sources) that a human accepts or overrides; the override is written to the AI interaction log (§8.1: "Every AI request/response, confidence, override. Per tenant; powers audit, tuning and cost metering") and to SC-10 ("AI overrides" are named in the mandatory audit set).

WORK ORDER:
- AI-F-02 Smart work-order triage (Should) — inputs: request text/photos/category → outputs: suggested category, priority, best-fit assignee/vendor with confidence. Attaches to New→Triaged and Triaged→Assigned. HITL: "Dispatcher confirms or overrides; overrides logged for tuning." Fallback: "manual triage queue." Benchmark: top-1 category accuracy ≥ 85%; assignee suggestion acceptance ≥ 70%.
- AI-E-02 Smart request triage (Should) — "photo-based classification and auto-routing of resident requests (shared service with AI-F-02)". Same HITL and fallback; shared benchmark. Note "auto-routing" here still sits behind the AI-F-02 HITL — it is the same service.
- AI-F-01 Predictive maintenance (Should) — outputs "ranked failure-risk list + suggested PPM dates as draft schedule entries". Upstream of the machine: it changes PPM plans that generate work orders. HITL: "FM approves before any schedule changes. Runs in shadow mode until data volume is sufficient. Fallback: standard PPM calendar unaffected." Benchmark: after 3–6 months, precision ≥ 70% on a 30-day failure window.
- AI-F-03 Vision-based inspections (Should) — "inspection photos → detected defects with severity + auto-drafted report". Upstream: approved failed items auto-raise work orders (FM-06). HITL: "Inspector edits and approves every report." Benchmark: defect recall ≥ 80%.
- AI-F-05 FM copilot / AI-S-01 platform copilot (Should) — "drafted actions (e.g. raise WO)". HITL: "Every drafted action requires explicit user confirmation." Benchmark: grounded-answer accuracy ≥ 90%.
- AI-F-04 anomaly alerts and AI-S-02 NL reporting read work-order data; AI-S-02 requires "Every figure traceable to source records."

SERVICE CHARGE:
- AI-E-03 Billing & arrears intelligence (Should) — inputs billing/payment history → outputs anomaly flags, defaulter-risk scores, reminder-timing suggestions. HITL: "Managers approve reminder campaigns; no automated penalties ever." Fallback: "fixed reminder schedule" (i.e. the −3d/due/+7d/+21d defaults). Benchmark: risk model AUC ≥ 0.75 after two billing cycles. Data-hungry — §15.2 lists AI-E-03 as launching "in shadow/tuning mode".
- AI-E-04 Communication assistant (Should) — drafts and translates; "Manager approval required before any send" (also EM-04: "AI drafting/translation (AI-E-04) always requires manager approval before send"). Applies to any drafted reminder or arrears communication.

BOOKING:
- AI-S-05 Recommendation & fraud engine (Could) — explicitly "behind AI-E-05 and bookings". HITL as AI-E-05: fraud flags to a human review queue, never auto-block.
- AI-E-01 resident chatbot (Should) may answer booking questions; "No source → must refuse and escalate to a ticket (EM-03)". Deflection ≥ 60%, grounded accuracy ≥ 90%.

SOS EVENT:
- None in default acceptance. AI-E-06 (Could, optional) is gated on NDPA compliance, explicit consent and DPIA sign-off (Q5), and "not in default acceptance". No AI may drive any SOS transition.

MARKETPLACE ORDER:
- AI-E-05 Marketplace intelligence (Could) — listing auto-generation, personalised recommendations, fraud flags. HITL: "Fraud flags go to a human review queue — never auto-block." Fallback: "manual listings, no recommendations." Benchmark: fraud-flag precision ≥ 60% at review (pilot).
- AI-S-05 is the shared engine.

UI IMPLICATION for the web app (SC-06): each AI-decorated transition control needs four visual states (loading / confidence / sources / error) and an explicit override affordance. That is a design-system addition to the existing cargoflow-next primitives — a suggestion chip with a confidence indicator and a sources popover, plus an Accept / Override pair.

### Complete SLA / timer catalogue with provenance — only four numbers exist in the entire PRD
*Requirements: FM-03, FM-05, FM-07, FM-08, EM-01, EM-05, EM-06, EM-09, SC-09, Q4*

Every timer across all five machines, with the exact PRD status of its default value. §10 header: "SLA values are proposed defaults, configurable per tenant."

VALUES THE PRD ACTUALLY PROPOSES (5 entries, 4 distinct numbers):
1. Work order — Emergency respond: 2 hours. §10 "Emergency: respond 2h".
2. Work order — Emergency resolve: 24 hours. §10 "resolve 24h".
3. Work order — Routine resolve: 72 hours. §10 "Routine: 72h".
4. Work order — auto-close from Resolved: 5 days. §10 "auto-close after 5 days (proposed)".
5. SOS — acknowledge: <60 seconds during manned hours. §10 "(proposed)".
Plus one cadence, not a duration: Service charge reminders at due−3d, due, due+7d, due+21d. §10 "(e.g. −3d, due, +7d, +21d)".

TIMERS THE PRD NAMES BUT LEAVES WITHOUT A VALUE (all build-blocking):
- Work order — Routine respond target: not stated.
- Work order — respond/resolve targets for any priority other than Emergency and Routine: the priority list itself is not defined (§10 says "e.g.").
- Work order — whether the resolve clock pauses in OnHold: not stated.
- Work order — when the clocks start (creation vs triage): not stated.
- Service charge — grace period between due date and Overdue: not stated.
- Service charge — aging threshold Overdue → InArrears: "per tenant", no default.
- Service charge — Escalated trigger: "Escalation policy per tenant", no default.
- Booking — cancellation window: "per policy", no default (EM-05 and §10 both).
- Booking — payment hold / approved-unpaid expiry: does not exist in the PRD.
- SOS — Acknowledged→Responding target: not stated. Responding→Resolved target: not stated. Resolved→Reviewed target: not stated. Manned-hours calendar: owned by Q4.
- Marketplace — vendor accept SLA: "within SLA", NO VALUE. This is the timer that fires the auto-expire transition, so the machine cannot be completed without it.
- Marketplace — fulfilment SLA, auto-close, refund window: none exist.

ESCALATION BEHAVIOUR ON BREACH:
- Work order: FM-08 "Push notifications for assignments and escalations" is the only statement; the escalation recipient chain is undefined.
- SOS: "unacknowledged alerts escalate to backup responders" — recipients owned by Q4.
- Service charge: "Escalation policy per tenant" — content undefined.
- Marketplace: expiry is the escalation.
All four escalations are notifications through SC-09, subject to per-user channel preferences and quiet hours — which is a live conflict for SOS.

DOWNSTREAM USE OF SLA OUTCOMES: FM-05 vendor "Performance metrics: jobs completed, SLA hit rate, rating"; FM-07 dashboards "open/overdue WOs, PPM compliance %, downtime, cost by category/estate"; §14 KPIs "mean time to resolve", "Request resolution time", "on-time payment %". Every timer therefore needs its hit/miss outcome persisted on the entity at terminal state, not recomputed from logs.

### Terminal and branch state analysis — what can never be undone
*Requirements: FM-03, EM-01, EM-05, EM-06, EM-09, SC-01*

Per machine, the states that accept no further events, and the branch (off-happy-path) states:

WORK ORDER — branches: Rejected, Cancelled (both named as branches in §10). Terminal: Closed, Rejected, Cancelled. Pseudo-terminal: Verified (exits only to Closed). NOTE: there is no PRD-sanctioned path out of Resolved other than to Verified or (by timer) to Closed — no reopen. Total states 10, terminal 3.

SERVICE CHARGE — no branch states are declared; the arrears track (Overdue, InArrears, Escalated) is a second chain, not a branch. Terminal: Paid only. Escalated has NO defined exit — it is an absorbing state under a strict reading, which cannot be the intent. Total states 7, terminal 1 (plus 1 undefined-exit).

BOOKING — branches: Declined, Cancelled. Terminal: Completed, Declined, Cancelled. Total states 7 (or 6 if Approved/AutoApproved collapse), terminal 3.

SOS EVENT — no branches at all. Terminal: Reviewed only. Total states 5, terminal 1. This is the only machine where every raised event MUST traverse the full chain; there is no early exit for a false alarm.

MARKETPLACE ORDER — branches: Declined, Refunded. Terminal: Closed, Declined, Refunded (+ Expired if added). Total states 6 (7 with Expired), terminal 3 (4 with Expired).

REOPEN POLICY: the PRD contains no statement about whether any terminal state can be reopened, and no role in §7 has F on any of these five capability rows (Platform Admin is V on work orders, charges, bookings, marketplace and Security & SOS; F only on Tenant onboarding, Users & roles, Investor projects and Reports). Strictly read, once a record is terminal nobody — including Platform Admin — can move it. For a production support desk that is almost certainly wrong, and is listed as an open issue.

DESIGN-SYSTEM IMPLICATION: terminal states should render in the muted/closed tone in StatusPill; branch states (Rejected, Cancelled, Declined, Refunded, Expired) in the danger/neutral-negative tone; active states in progress tones. See the domain-status-tokens artifact.

### Offline, idempotency and conflict rules that constrain every transition (§12.1)
*Requirements: FM-03, FM-08, FM-02, EM-06, SC-02, SC-03, SC-10, AI-S-06*

§12.1 verbatim: "Read caching for dashboards, work-order lists and key resident screens." / "Queued writes for work-order updates, inspection logs and SOS (SMS fallback for SOS, proposed), with visible sync status." / "Conflict resolution is server-authoritative; overwritten offline edits are surfaced to the user and audit-logged."
FM-03 adds: "Offline updates supported per §12.1." FM-08: "All technician and FM day-to-day flows usable on Android/iOS... camera-first capture."

What this forces onto the state-machine contract:
1. Two workflows accept OFFLINE transitions: Work order (technician updates) and SOS (raise). Service charge, booking and marketplace order are all payment-gated and online-only in practice.
2. Every transition command carries a client-generated idempotency key and a `clientOccurredAt`. Replays are no-ops (aligns with SC-02's "idempotency and retries" requirement for payments).
3. Transitions can arrive STALE — a technician resolves offline while a manager cancels online. Server-authoritative means the later-arriving stale transition is REJECTED, not merged. The rejection must be (a) surfaced in the technician's UI and (b) written to the SC-10 audit log. The state machine must therefore expose a rejection reason type: `illegal-transition` vs `stale-precondition` vs `permission-denied` — the UI treats them differently.
4. Transitions can arrive OUT OF ORDER within one device's queue; the queue must be applied in client sequence order per record.
5. Evidence attachments (photos, per FM-03 "Capture photos, notes, parts and costs" and FM-02 "Completion requires checklist + evidence photo") are large and sync separately from the transition. A RESOLVE whose photo has not yet uploaded needs a defined behaviour — the PRD does not specify whether the transition blocks on evidence upload or completes with a pending-evidence flag. Practical recommendation: allow the transition, mark evidence pending, block Verified/Closed until evidence lands. Flagged as an open issue.
6. SOS via SMS fallback bypasses the app entirely — the raise transition arrives through the SMS provider abstraction (SC-03), needing the same actor attribution and dedup against a later app sync.

NFR context: API P95 < 500 ms; "key screens interactive < 3 s on 4G and usable on 3G"; 99.5% monthly availability for core flows; "AI outage never blocks core" — the last one directly means a transition must be admissible with the AI suggestion absent (fallback: manual triage queue).

### Notification obligations per transition (SC-09) and audit obligations (SC-10)
*Requirements: SC-09, SC-10, SC-11, FM-01, FM-03, FM-05, FM-08, EM-01, EM-03, EM-06, EM-09, Q12*

SC-09 (Must, new in v2.0): "Unified service for push/SMS/email/in-app used by all modules (single event bus). Per-user channel preferences and quiet hours; per-tenant templates; delivery logging." §10 makes notification part of the transition contract itself: every transition is "notified via SC-09".

Per-workflow notification audiences derived from the requirement text:
- Work order: requester on EVERY state change (FM-03 "requester notified on state changes"; EM-03 "Resident notified on each state change"); assignee on assignment and reassignment (FM-03 "reassignment and every state change tracked and notified"; FM-08 push for "assignments and escalations"); vendor via vendor portal (FM-05); manager on SLA breach escalation.
- Service charge: resident on issue (EM-01 "Invoices generated and delivered in-app + email/SMS") and on each of the four reminders; receipt on payment; manager on escalation.
- Booking: resident on approve/auto-approve/decline/confirm/cancel; manager on request when manual approval required.
- SOS: security desk AND designated responders on raise (EM-06); backup responders on 60s escalation; the raising resident on acknowledge (the EM-06 user story requires it).
- Marketplace: vendor on place; resident on accept/decline/fulfil/close/expire/refund (EM-09 "Order lifecycle ... with notifications").

SC-09 also requires per-tenant TEMPLATES — so the notification payload per transition is (eventType, entity, actor, tenantTemplateKey, audience, channelSet), and the template set is tenant configuration (§8.2 "Per-tenant configuration: branding, notification templates, amenity rules, charge structures, AI feature flags and usage caps").

SC-10 (Must, new in v2.0): "Immutable log of auth events, permission changes, financial actions, security events and AI overrides — actor, tenant, timestamp. 12-month retention (proposed); queryable from the admin console." Mapping onto the machines: every service-charge and marketplace payment/refund transition is a FINANCIAL ACTION; every SOS transition is a SECURITY EVENT; every accepted-or-overridden AI triage suggestion is an AI OVERRIDE. These three classes are non-negotiably logged. FM-01 also requires "all changes audit-logged (SC-11)" — note this is a typo in the PRD, the audit-log requirement is SC-10 and SC-11 is the landing page; worth raising.

Cost metering (§8.2): "AI, SMS and email usage metered per tenant" — every SC-09 send triggered by a transition increments a per-tenant meter, and Q12 ("Per-tenant AI/SMS budget caps and alert thresholds", Client, Phase 2) sets the caps. A transition must not fail because a notification cap was hit — the notification degrades, the transition commits.

### How the five machines interlock — cross-workflow edges
*Requirements: EM-03, FM-02, FM-03, FM-06, SC-02, SC-04, AI-F-01, AI-F-03, AI-E-01*

The machines are not independent; four cross-workflow edges exist in the PRD and must be modelled explicitly:

1. RESIDENT REQUEST → WORK ORDER. EM-03: "Requests feed the shared work-order pipeline (FM-03) with estate routing." There is NO separate request state machine — the resident-facing ticket IS the work order, rendered with resident-appropriate state labels. EM-03 requires "ticket ID with visible status", so the resident-facing status vocabulary is a projection of the 10 work-order states. Recommend a `residentLabel` mapping (e.g. Triaged/Assigned both surface as "Scheduled") rather than a second machine.

2. PPM PLAN → WORK ORDER. FM-02: "Scheduler auto-generates work orders ahead of due date", with plan-level "frequency, checklist, assignee rules, lead time". The PPM plan supplies the assignee rule, which is why it is unclear whether generated WOs should enter at New (needing triage) or straight at Assigned. AI-F-01 can propose changes to these plans but "FM approves before any schedule changes".

3. INSPECTION → WORK ORDER. FM-06: "Failed items auto-raise work orders (FM-03)", with severity from the checklist ("checklist items (pass/fail/severity)") — severity is the natural input to work-order priority and therefore to which SLA profile applies. AI-F-03 drafts the defects but "Inspector edits and approves every report", so the raise fires on human report approval.

4. BOOKING FEE and MARKETPLACE ORDER → shared payment substrate. SC-04: "Catalog, cart/order and payment services shared between marketplace and paid bookings." Both B07 (booking confirm on payment) and M01 (order placement) consume the same SC-02 gateway abstraction with webhook confirmation, idempotency, retries and refund/void. One payment-confirmed event type therefore fans out to two different machines — the event must carry the target aggregate type.

5. AI-E-01 CHATBOT → WORK ORDER. "No source → must refuse and escalate to a ticket (EM-03)" — an unanswerable resident question creates a work order via the EM-03 path. This is an AI-initiated CREATE, but it creates a ticket for a human rather than performing an action, so it does not violate §11.4.

Also note the entity model (§8.1) confirms these joins: "Work order — A maintenance job with lifecycle per §10. Links asset/unit, requester, assignee (tech or vendor), costs, evidence"; "Inspection — Failed items raise work orders; feeds compliance register"; "PPM plan — Generates work orders for an asset/category"; "Booking — Links resident, amenity, optional payment; approval per amenity rules"; "Listing/Order — Vendor listing → resident order → payment → fulfilment"; "SOS event — Panic alert with acknowledge/resolve trail. Links resident/unit, responders, timestamps."

### What this means for the cargoflow-next web app + admin dashboard (SC-06)
*Requirements: SC-06, SC-10, FM-07, AI-S-06, EM-06*

The target codebase at /Users/samuelomosehin/developer/cargoflow-next currently encodes a single logistics lifecycle in /Users/samuelomosehin/developer/cargoflow-next/src/components/ui/index.tsx: `type LoadStatus = 'Draft' | 'Posted' | 'Booked' | 'In Transit' | 'Delivered' | 'Closed'` with `STATUS_COLORS: Record<LoadStatus, string>` and `StatusPill({ status }: { status: LoadStatus | string })` doing a lookup with a grey `#8b93a1` fallback.

That shape does not survive this domain, for three reasons:
1. FIVE machines, not one — 35 distinct state names across them.
2. NAME COLLISIONS across machines: `Closed` appears in Work order AND Marketplace order; `Cancelled` in Work order AND Booking; `Declined` in Booking AND Marketplace order; `Draft` in Service charge (and in the existing template). A flat `Record<string, colour>` cannot disambiguate, and the current `?? '#8b93a1'` fallback would silently render unknown states as neutral grey — masking a bug rather than failing.
3. Semantic tone matters more than per-state colour: Overdue/InArrears/Escalated must escalate visually; SOS Raised must be the single most urgent token in the system.

Recommended change (artifact `domain-status-tokens.ts` below): keep the StatusPill component and the `hexA()` helper exactly as they are — they are good — and replace the flat colour map with a `(workflow, state) → tone` function over a small semantic tone palette that extends the existing scale (the template's `#8b93a1`, `#3b82f6`, `#8b5cf6`, `#f59e0b`, `#10b981`, `#6b7280` are all reused; only `danger` and `critical` are new). `StatusPill` gains an optional `workflow` prop and keeps its current signature working.

Additional UI surfaces the state machines demand, beyond the existing primitives (Card, KpiCard, StatusPill, Button, FilterChip, Tabs, Table, Avatar, Mono, EmptyState):
- A TRANSITION CONTROL that renders only the legal outgoing transitions for the current state AND the current user's §7 role — the admin dashboard must never offer an illegal action. This is a direct read off the machine spec.
- An SLA COUNTDOWN/BREACH indicator (work order, SOS, marketplace accept) — needs a breach tone and a paused presentation for OnHold if the pause question resolves that way.
- An AI SUGGESTION affordance with the four §11.4 UX states (loading, confidence, sources, error) plus Accept/Override, used on work-order triage and arrears reminder campaigns.
- A TIMELINE component rendering the timestamped, actor-attributed transition trail — mandatory for SOS ("full timeline retained for review") and valuable everywhere; also the surface for the SC-10 admin audit view.
- An OFFLINE/SYNC-STATUS badge (§12.1 "with visible sync status") — web is less affected than mobile, but the admin console must show when a technician's update was made offline vs received.
- FilterChip sets keyed to state groups (Open / Overdue / Terminal) for the FM-07 dashboards: "open/overdue WOs, PPM compliance %, downtime, cost by category/estate", with "Filters by estate/date; export CSV/PDF; role-scoped visibility per §7".

## Code-ready artifacts

### src/domain/workflow/core.ts (`typescript`)

```typescript
/**
 * Shared primitives for the five PRD §10 state machines.
 *
 * PRD §10 (verbatim): "State machines below are the contract between backend,
 * mobile and QA. Only the listed transitions are legal; every transition is
 * timestamped, actor-attributed and notified via SC-09. SLA values are proposed
 * defaults, configurable per tenant."
 */

/** §7 Roles & permissions matrix — the nine roles, in matrix column order. */
export type Role =
  | 'PlatformAdmin'   // Plat — 7 Fifteen Capital HQ
  | 'Executive'       // Exec — Owner/Executive
  | 'EstateManager'   // EstM
  | 'FacilityManager' // FacM
  | 'Technician'      // Tech
  | 'Resident'        // Res
  | 'Security'        // Sec
  | 'Vendor'          // Ven
  | 'Investor';       // Inv

/** Non-human principals that may fire a transition. Still actor-attributed (§10). */
export type SystemActor =
  | 'System.Timer'     // SLA, reminder and auto-close clocks
  | 'System.Scheduler' // FM-02 PPM work-order generation
  | 'System.Webhook'   // SC-02 gateway payment confirmation
  | 'System.Rule';     // per-tenant configured rule (e.g. EM-05 auto-approval)

export type Actor = Role | SystemActor;

/** §7 legend: F full · M manage · V view · O own records only · — no access. */
export type AccessLevel = 'F' | 'M' | 'V' | 'O' | 'none';

/**
 * Provenance of each edge. §10 is a closed world, so anything not `prd-explicit`
 * or `prd-implied` must be confirmed (Change Request, Clause 10) before shipping.
 */
export type Provenance =
  | 'prd-explicit'      // written verbatim in the PRD
  | 'prd-implied'       // strictly required for a prd-explicit rule to function
  | 'derived-proposed'; // NOT in the PRD — proposed, needs client sign-off

/** Only these may ship without a Change Request. Assert this in CI. */
export const CONTRACTED_PROVENANCE: readonly Provenance[] = ['prd-explicit', 'prd-implied'];

/** SC-09 notification audiences. Roles plus relationship-derived audiences. */
export type NotifyAudience =
  | Role
  | 'Requester'
  | 'Assignee'
  | 'PreviousAssignee'
  | 'DesignatedResponders'
  | 'BackupResponders'
  | 'DispatchQueue';

export interface TransitionSpec<S extends string, E extends string> {
  id: string;
  from: S | null;               // null = creation
  to: S;
  event: E;
  /** Who may fire it (SC-01 deny-by-default; §7 authoritative baseline). */
  actors: readonly Actor[];
  /** §7 qualifier per role actor; 'O' means an ownership guard, not just a role check. */
  scope?: Partial<Record<Role, AccessLevel>>;
  /** Server-side preconditions. Evaluated before the transition is admitted. */
  guards: readonly string[];
  /** Effects applied atomically with the transition. */
  effects: readonly string[];
  /** SC-09 recipients for this transition. */
  notify: readonly NotifyAudience[];
  requirementIds: readonly string[];
  provenance: Provenance;
  note?: string;
}

export type TimerValueSource =
  | 'prd-proposed-default'  // §10 proposes a number (configurable per tenant)
  | 'prd-per-tenant-policy' // PRD says "per tenant"/"per policy", no number given
  | 'not-in-prd';           // no PRD guidance at all — open issue

export interface TimerSpec<S extends string> {
  id: string;
  /** States in which the clock runs. */
  activeIn: readonly S[];
  /** States in which the clock is suspended (if any). */
  pausedIn?: readonly S[];
  startsOn: string;
  /** ISO-8601 duration, or null when the PRD proposes no value. */
  defaultDuration: string | null;
  onExpiry:
    | { kind: 'transition'; to: S; actor: SystemActor }
    | { kind: 'notify'; audience: readonly NotifyAudience[] }
    | { kind: 'escalate'; audience: readonly NotifyAudience[]; stateUnchanged: true }
    | { kind: 'flag'; flag: string };
  configurablePerTenant: boolean;
  source: TimerValueSource;
  requirementIds: readonly string[];
  note?: string;
}

/**
 * §11.4 (release-blocking): "every suggestion is review/approve/override —
 * AI is assistive, not autonomous." `mayFireTransition` is typed to the literal
 * `false` so no AI touchpoint can ever be declared as a transition actor.
 */
export interface AiTouchpoint<S extends string> {
  featureId: string;                      // e.g. 'AI-F-02'
  priority: 'Must' | 'Should' | 'Could';
  attachesTo: readonly S[] | 'workflow';
  suggests: string;
  /** The exact §11 human-in-the-loop rule. */
  humanInTheLoop: string;
  /** The exact §11 fallback when the provider is unavailable (§11.4). */
  fallback: string;
  benchmark: string | null;
  mayFireTransition: false;
}

export interface MachineSpec<S extends string, E extends string> {
  key: string;
  prdSection: string;
  prdStatesVerbatim: string;
  prdRulesVerbatim: string;
  states: readonly S[];
  initial: readonly S[];
  branch: readonly S[];
  terminal: readonly S[];
  transitions: readonly TransitionSpec<S, E>[];
  timers: readonly TimerSpec<S>[];
  ai: readonly AiTouchpoint<S>[];
  invariants: readonly string[];
}

/** Rejection reasons the UI must distinguish (§12.1 offline conflict surfacing). */
export type TransitionRejection =
  | { kind: 'illegal-transition'; from: string; event: string }
  | { kind: 'permission-denied'; role: Role; required: readonly Actor[] }
  | { kind: 'guard-failed'; guard: string }
  | { kind: 'stale-precondition'; observedState: string; currentState: string }
  | { kind: 'cross-tenant'; }; // §8.2 hard isolation — must never occur, always audited

export function legalTransitions<S extends string, E extends string>(
  machine: MachineSpec<S, E>,
  state: S,
  actorRole: Role,
): readonly TransitionSpec<S, E>[] {
  return machine.transitions.filter(
    (t) => t.from === state && (t.actors as readonly string[]).includes(actorRole),
  );
}

```

### src/domain/workflow/work-order.machine.ts (`typescript`)

```typescript
import type { MachineSpec, TransitionSpec, TimerSpec, AiTouchpoint } from './core';

/** PRD §10 Work order — FM-03. Also the pipeline for EM-03, FM-02 and FM-06. */
export type WorkOrderState =
  | 'New' | 'Triaged' | 'Assigned' | 'InProgress' | 'OnHold'
  | 'Resolved' | 'Verified' | 'Closed'
  | 'Rejected' | 'Cancelled';

export type WorkOrderEvent =
  | 'CREATE' | 'TRIAGE' | 'ASSIGN' | 'REASSIGN' | 'START' | 'HOLD' | 'RESUME'
  | 'RESOLVE' | 'VERIFY' | 'CLOSE' | 'AUTO_CLOSE' | 'REOPEN'
  | 'REJECT' | 'CANCEL';

/** §10 names only these two, prefixed "e.g." — the full taxonomy is an open issue. */
export type WorkOrderPriority = 'Emergency' | 'Routine';

export type WorkOrderOrigin =
  | 'ResidentRequest'      // EM-03
  | 'ManagerCreated'
  | 'PpmSchedule'          // FM-02 scheduler
  | 'FailedInspectionItem' // FM-06
  | 'CopilotDraft';        // AI-F-05 / AI-S-01, human-confirmed

const T: readonly TransitionSpec<WorkOrderState, WorkOrderEvent>[] = [
  { id: 'WO-T01', from: null, to: 'New', event: 'CREATE',
    actors: ['Resident', 'FacilityManager', 'EstateManager', 'System.Scheduler', 'System.Rule'],
    scope: { Resident: 'O', FacilityManager: 'M', EstateManager: 'M' },
    guards: ['tenant + estate scope (§8.2)', 'category and description present (EM-03)'],
    effects: ['issue ticket ID visible to requester (EM-03)',
              'request AI triage suggestion with confidence (AI-F-02 / AI-E-02)',
              'start response + resolve SLA clocks for the priority profile',
              'SC-10 audit entry'],
    notify: ['Requester', 'DispatchQueue'],
    requirementIds: ['FM-03', 'EM-03', 'FM-02', 'FM-06', 'AI-F-05'], provenance: 'prd-implied' },

  { id: 'WO-T02', from: 'New', to: 'Triaged', event: 'TRIAGE',
    actors: ['FacilityManager', 'EstateManager'], scope: { FacilityManager: 'M', EstateManager: 'M' },
    guards: ['category set', 'priority set', 'assignee candidate chosen'],
    effects: ['AI suggestion accepted or overridden; override written to AI interaction log (§8.1) and SC-10',
              'priority fixes the applicable SLA profile'],
    notify: ['Requester'], requirementIds: ['FM-03', 'AI-F-02', 'AI-E-02', 'SC-10'], provenance: 'prd-explicit' },

  { id: 'WO-T03', from: 'New', to: 'Rejected', event: 'REJECT',
    actors: ['FacilityManager', 'EstateManager'], guards: ['rejection reason (proposed — not in PRD)'],
    effects: ['stop all SLA clocks'], notify: ['Requester'],
    requirementIds: ['FM-03'], provenance: 'prd-explicit' },

  { id: 'WO-T04', from: 'New', to: 'Cancelled', event: 'CANCEL',
    actors: ['Resident', 'FacilityManager', 'EstateManager'], scope: { Resident: 'O' },
    guards: [], effects: ['stop all SLA clocks'], notify: ['Requester'],
    requirementIds: ['FM-03'], provenance: 'prd-explicit' },

  { id: 'WO-T05', from: 'Triaged', to: 'Assigned', event: 'ASSIGN',
    actors: ['FacilityManager', 'EstateManager'],
    guards: ['assignee is an internal Technician OR a Vendor (FM-03)',
             'vendor active with non-expired insurance/certification documents (FM-05)'],
    effects: ['push notification to assignee (FM-08)', 'vendor sees job in vendor portal (FM-05)',
              'response SLA clock stops (proposed reading — see open issues)'],
    notify: ['Assignee', 'Requester'], requirementIds: ['FM-03', 'FM-05', 'FM-08'], provenance: 'prd-explicit' },

  { id: 'WO-T06', from: 'Triaged', to: 'Rejected', event: 'REJECT',
    actors: ['FacilityManager', 'EstateManager'], guards: [], effects: [], notify: ['Requester'],
    requirementIds: ['FM-03'], provenance: 'prd-explicit' },

  { id: 'WO-T07', from: 'Triaged', to: 'Cancelled', event: 'CANCEL',
    actors: ['Resident', 'FacilityManager', 'EstateManager'], scope: { Resident: 'O' },
    guards: [], effects: [], notify: ['Requester'], requirementIds: ['FM-03'], provenance: 'prd-explicit' },

  { id: 'WO-T08', from: 'Assigned', to: 'Assigned', event: 'REASSIGN',
    actors: ['FacilityManager', 'EstateManager'],
    guards: ['new assignee differs from current'],
    effects: ['append to assignment history', 'SLA clocks NOT reset (proposed)'],
    notify: ['Assignee', 'PreviousAssignee', 'Requester'],
    requirementIds: ['FM-03'], provenance: 'prd-explicit',
    note: 'FM-03: "reassignment and every state change tracked and notified".' },

  { id: 'WO-T09', from: 'Assigned', to: 'InProgress', event: 'START',
    actors: ['Technician', 'Vendor'], scope: { Technician: 'O', Vendor: 'O' },
    guards: ['actor is the current assignee'],
    effects: ['work-start timestamp (feeds §14 mean time to resolve)', 'offline-capable per §12.1'],
    notify: ['Requester'], requirementIds: ['FM-03', 'FM-08'], provenance: 'prd-explicit' },

  { id: 'WO-T10', from: 'Assigned', to: 'Cancelled', event: 'CANCEL',
    actors: ['FacilityManager', 'EstateManager'], guards: [], effects: [],
    notify: ['Requester', 'Assignee'], requirementIds: ['FM-03'], provenance: 'prd-explicit' },

  { id: 'WO-T11', from: 'InProgress', to: 'OnHold', event: 'HOLD',
    actors: ['Technician', 'Vendor', 'FacilityManager', 'EstateManager'],
    scope: { Technician: 'O', Vendor: 'O' },
    guards: ['hold reason required (reason taxonomy NOT in PRD)'],
    effects: ['whether the resolve SLA clock pauses is UNDEFINED in the PRD'],
    notify: ['Requester'], requirementIds: ['FM-03'], provenance: 'prd-explicit' },

  { id: 'WO-T12', from: 'OnHold', to: 'InProgress', event: 'RESUME',
    actors: ['Technician', 'Vendor', 'FacilityManager', 'EstateManager'],
    scope: { Technician: 'O', Vendor: 'O' }, guards: [], effects: [],
    notify: ['Requester'], requirementIds: ['FM-03'], provenance: 'prd-implied',
    note: 'Without RESUME, OnHold is a trap. Not drawn in §10.' },

  { id: 'WO-T13', from: 'InProgress', to: 'Resolved', event: 'RESOLVE',
    actors: ['Technician', 'Vendor'], scope: { Technician: 'O', Vendor: 'O' },
    guards: ['photos, notes, parts and costs captured (FM-03)',
             'for PPM-generated WOs: checklist complete + evidence photo (FM-02, configurable)'],
    effects: ['start the 5-day auto-close clock', 'open the verification window',
              'costs roll into FM-07 cost-by-category/estate'],
    notify: ['Requester'], requirementIds: ['FM-03', 'FM-02', 'EM-03', 'FM-07'], provenance: 'prd-implied',
    note: 'The §10 chain literally routes InProgress → OnHold → Resolved; see open issues.' },

  { id: 'WO-T14', from: 'OnHold', to: 'Resolved', event: 'RESOLVE',
    actors: ['Technician', 'Vendor'], scope: { Technician: 'O', Vendor: 'O' },
    guards: ['as WO-T13'], effects: ['as WO-T13'], notify: ['Requester'],
    requirementIds: ['FM-03', 'FM-02'], provenance: 'prd-explicit' },

  { id: 'WO-T15', from: 'InProgress', to: 'Cancelled', event: 'CANCEL',
    actors: ['FacilityManager', 'EstateManager'], guards: [], effects: [],
    notify: ['Requester', 'Assignee'], requirementIds: ['FM-03'], provenance: 'prd-explicit' },

  { id: 'WO-T16', from: 'OnHold', to: 'Cancelled', event: 'CANCEL',
    actors: ['FacilityManager', 'EstateManager'], guards: [], effects: [],
    notify: ['Requester', 'Assignee'], requirementIds: ['FM-03'], provenance: 'prd-explicit' },

  { id: 'WO-T17', from: 'Resolved', to: 'Verified', event: 'VERIFY',
    actors: ['Resident', 'FacilityManager', 'EstateManager'], scope: { Resident: 'O' },
    guards: ['actor is the requester OR a manager (§10 verbatim)'],
    effects: ['cancel the auto-close timer',
              'unlock resident rating (EM-03) feeding §14 satisfaction and FM-05 vendor rating'],
    notify: ['Assignee', 'Requester'], requirementIds: ['FM-03', 'EM-03', 'FM-05'], provenance: 'prd-explicit' },

  { id: 'WO-T18', from: 'Resolved', to: 'Closed', event: 'AUTO_CLOSE',
    actors: ['System.Timer'], guards: ['5 days elapsed in Resolved with no verification'],
    effects: ['set autoClosed = true so analytics separate verified from lapsed closures',
              'record SLA hit/miss against the priority profile'],
    notify: ['Requester', 'Assignee'], requirementIds: ['FM-03'], provenance: 'prd-explicit',
    note: '§10: "auto-close after 5 days (proposed)". Value configurable per tenant.' },

  { id: 'WO-T19', from: 'Verified', to: 'Closed', event: 'CLOSE',
    actors: ['FacilityManager', 'EstateManager', 'System.Timer'],
    guards: [], effects: ['freeze costs', 'record SLA hit/miss (FM-05 SLA hit rate, FM-07 dashboards)'],
    notify: ['Requester', 'Assignee'], requirementIds: ['FM-03', 'FM-05', 'FM-07'], provenance: 'prd-explicit' },

  { id: 'WO-T20', from: 'Resolved', to: 'InProgress', event: 'REOPEN',
    actors: ['Resident', 'FacilityManager', 'EstateManager'], scope: { Resident: 'O' },
    guards: ['within the 5-day verification window'],
    effects: ['restart resolve SLA (proposed)'], notify: ['Assignee', 'Requester'],
    requirementIds: ['FM-03'], provenance: 'derived-proposed',
    note: 'NOT IN PRD. Under §10 closed-world this is currently illegal — build-blocking open issue.' },
];

const TIMERS: readonly TimerSpec<WorkOrderState>[] = [
  { id: 'WO-SLA-RESPOND-EMERGENCY', activeIn: ['New', 'Triaged'], startsOn: 'WO-T01 (creation)',
    defaultDuration: 'PT2H', onExpiry: { kind: 'escalate', audience: ['FacilityManager', 'EstateManager'], stateUnchanged: true },
    configurablePerTenant: true, source: 'prd-proposed-default',
    requirementIds: ['FM-03', 'FM-08'], note: '§10: "Emergency: respond 2h".' },
  { id: 'WO-SLA-RESOLVE-EMERGENCY', activeIn: ['New', 'Triaged', 'Assigned', 'InProgress', 'OnHold'],
    pausedIn: [], startsOn: 'WO-T01 (creation)', defaultDuration: 'PT24H',
    onExpiry: { kind: 'escalate', audience: ['FacilityManager', 'EstateManager'], stateUnchanged: true },
    configurablePerTenant: true, source: 'prd-proposed-default',
    requirementIds: ['FM-03'], note: '§10: "resolve 24h". Whether OnHold pauses this is UNDEFINED.' },
  { id: 'WO-SLA-RESOLVE-ROUTINE', activeIn: ['New', 'Triaged', 'Assigned', 'InProgress', 'OnHold'],
    startsOn: 'WO-T01 (creation)', defaultDuration: 'PT72H',
    onExpiry: { kind: 'escalate', audience: ['FacilityManager', 'EstateManager'], stateUnchanged: true },
    configurablePerTenant: true, source: 'prd-proposed-default',
    requirementIds: ['FM-03'], note: '§10: "Routine: 72h".' },
  { id: 'WO-SLA-RESPOND-ROUTINE', activeIn: ['New', 'Triaged'], startsOn: 'WO-T01 (creation)',
    defaultDuration: null, onExpiry: { kind: 'escalate', audience: ['FacilityManager'], stateUnchanged: true },
    configurablePerTenant: true, source: 'not-in-prd',
    requirementIds: ['FM-03'], note: 'No respond target given for Routine.' },
  { id: 'WO-AUTOCLOSE', activeIn: ['Resolved'], startsOn: 'entry to Resolved',
    defaultDuration: 'P5D', onExpiry: { kind: 'transition', to: 'Closed', actor: 'System.Timer' },
    configurablePerTenant: true, source: 'prd-proposed-default', requirementIds: ['FM-03'] },
  { id: 'WO-PPM-OVERDUE-FLAG', activeIn: ['New', 'Triaged', 'Assigned', 'InProgress', 'OnHold'],
    startsOn: 'PPM plan due date', defaultDuration: null, onExpiry: { kind: 'flag', flag: 'overdue' },
    configurablePerTenant: false, source: 'prd-per-tenant-policy',
    requirementIds: ['FM-02'], note: 'FM-02: "overdue flagged". A display flag, not a state.' },
];

const AI: readonly AiTouchpoint<WorkOrderState>[] = [
  { featureId: 'AI-F-02', priority: 'Should', attachesTo: ['New', 'Triaged'],
    suggests: 'request text/photos/category → suggested category, priority and best-fit assignee/vendor with confidence',
    humanInTheLoop: 'Dispatcher confirms or overrides; overrides logged for tuning.',
    fallback: 'manual triage queue',
    benchmark: 'Top-1 category accuracy >= 85%; assignee suggestion acceptance >= 70%', mayFireTransition: false },
  { featureId: 'AI-E-02', priority: 'Should', attachesTo: ['New', 'Triaged'],
    suggests: 'photo-based classification and auto-routing of resident requests (shared service with AI-F-02)',
    humanInTheLoop: 'Same HITL and fallback as AI-F-02.', fallback: 'manual triage queue',
    benchmark: 'Shared benchmark with AI-F-02', mayFireTransition: false },
  { featureId: 'AI-F-01', priority: 'Should', attachesTo: 'workflow',
    suggests: 'ranked failure-risk list + suggested PPM dates as draft schedule entries (upstream of WO generation)',
    humanInTheLoop: 'FM approves before any schedule changes. Runs in shadow mode until data volume is sufficient.',
    fallback: 'standard PPM calendar unaffected',
    benchmark: 'After 3-6 months of data: precision >= 70% on 30-day failure window', mayFireTransition: false },
  { featureId: 'AI-F-03', priority: 'Should', attachesTo: 'workflow',
    suggests: 'inspection photos → detected defects with severity + auto-drafted report (failed items raise WOs, FM-06)',
    humanInTheLoop: 'Inspector edits and approves every report.', fallback: 'manual checklist flow',
    benchmark: 'Defect recall >= 80% on agreed defect classes (pilot set)', mayFireTransition: false },
  { featureId: 'AI-F-05', priority: 'Should', attachesTo: 'workflow',
    suggests: 'natural-language queries over tenant-scoped data → answers with sources; drafted actions (e.g. raise WO)',
    humanInTheLoop: 'Every drafted action requires explicit user confirmation.',
    fallback: 'normal navigation and search',
    benchmark: 'Grounded-answer accuracy >= 90% on eval set', mayFireTransition: false },
  { featureId: 'AI-S-01', priority: 'Should', attachesTo: 'workflow',
    suggests: 'platform-wide copilot across both modules and admin (extends AI-F-05)',
    humanInTheLoop: 'Action confirmation as AI-F-05.', fallback: 'standard UI',
    benchmark: 'Shared benchmark with AI-F-05', mayFireTransition: false },
];

export const workOrderMachine: MachineSpec<WorkOrderState, WorkOrderEvent> = {
  key: 'work-order',
  prdSection: '§10 · FM-03',
  prdStatesVerbatim: 'New → Triaged → Assigned → In Progress → On Hold → Resolved → Verified → Closed; branches: Rejected, Cancelled',
  prdRulesVerbatim: 'AI triage suggests category/priority/assignee; human confirms (AI-F/E triage). SLA timers per priority (e.g. Emergency: respond 2h / resolve 24h; Routine: 72h). Resolved → Verified by requester or manager; auto-close after 5 days (proposed).',
  states: ['New', 'Triaged', 'Assigned', 'InProgress', 'OnHold', 'Resolved', 'Verified', 'Closed', 'Rejected', 'Cancelled'],
  initial: ['New'],
  branch: ['Rejected', 'Cancelled'],
  terminal: ['Closed', 'Rejected', 'Cancelled'],
  transitions: T, timers: TIMERS, ai: AI,
  invariants: [
    'Only listed transitions are legal (§10); unknown (from,event) pairs are denied (SC-01).',
    'Every transition is timestamped and actor-attributed and emits SC-09 (§10).',
    'Requester is notified on EVERY state change (FM-03, EM-03).',
    'Offline-queued transitions carry an idempotency key; conflicts are server-authoritative and the overwritten edit is surfaced and audit-logged (§12.1).',
    'A transition must be admissible with the AI suggestion absent (§11.4: core flows never block on AI).',
  ],
};

```

### src/domain/workflow/service-charge.machine.ts (`typescript`)

```typescript
import type { MachineSpec, TransitionSpec, TimerSpec, AiTouchpoint } from './core';

/** PRD §10 Service charge — EM-01. Two chains: happy path and arrears track. */
export type ServiceChargeState =
  | 'Draft' | 'Issued' | 'PartiallyPaid' | 'Paid'
  | 'Overdue' | 'InArrears' | 'Escalated';

export type ServiceChargeEvent =
  | 'CREATE' | 'ISSUE' | 'PAYMENT_CONFIRMED'
  | 'DUE_DATE_PASSED' | 'AGE' | 'ESCALATE'
  | 'VOID' | 'REFUND';

const T: readonly TransitionSpec<ServiceChargeState, ServiceChargeEvent>[] = [
  { id: 'SC-T01', from: null, to: 'Draft', event: 'CREATE',
    actors: ['EstateManager'], scope: { EstateManager: 'M' },
    guards: ['tenant scope', 'unit/resident bound', 'amount and due date set'],
    effects: ['EM-01: charge setup per unit type/size — recurring cycle or one-off levy; penalties/discounts configurable'],
    notify: [], requirementIds: ['EM-01'], provenance: 'prd-implied' },

  { id: 'SC-T02', from: 'Draft', to: 'Issued', event: 'ISSUE',
    actors: ['EstateManager'], guards: ['due date set', 'unit has a billable resident'],
    effects: ['EM-01: invoice generated and delivered in-app + email/SMS',
              'arm reminder timers R1..R4 relative to due date',
              'SC-10 financial-action audit entry'],
    notify: ['Resident'], requirementIds: ['EM-01', 'SC-09', 'SC-10'], provenance: 'prd-explicit' },

  { id: 'SC-T03', from: 'Issued', to: 'PartiallyPaid', event: 'PAYMENT_CONFIRMED',
    actors: ['System.Webhook'], scope: { Resident: 'O' },
    guards: ['SC-02 webhook confirmed, idempotent', '0 < amount < outstanding balance'],
    effects: ['auto-reconcile to invoice (EM-01)', 'issue receipt', 'recompute balance and arrears aging'],
    notify: ['Resident'], requirementIds: ['EM-01', 'SC-02'], provenance: 'prd-explicit',
    note: 'Resident is the ONLY role with in-app payment access (§7 Payments row).' },

  { id: 'SC-T04', from: 'PartiallyPaid', to: 'PartiallyPaid', event: 'PAYMENT_CONFIRMED',
    actors: ['System.Webhook'], guards: ['amount < remaining balance'],
    effects: ['receipt', 'recompute balance'], notify: ['Resident'],
    requirementIds: ['EM-01', 'SC-02'], provenance: 'prd-implied' },

  { id: 'SC-T05', from: 'PartiallyPaid', to: 'Paid', event: 'PAYMENT_CONFIRMED',
    actors: ['System.Webhook'], guards: ['payment settles the balance'],
    effects: ['cancel all outstanding reminders', 'receipt', 'feeds §14 collection rate'],
    notify: ['Resident'], requirementIds: ['EM-01', 'SC-02'], provenance: 'prd-explicit' },

  { id: 'SC-T06', from: 'Issued', to: 'Paid', event: 'PAYMENT_CONFIRMED',
    actors: ['System.Webhook'], guards: ['payment covers full balance'],
    effects: ['cancel reminders', 'receipt', 'if on/before due date, counts toward §14 on-time payment %'],
    notify: ['Resident'], requirementIds: ['EM-01', 'SC-02'], provenance: 'prd-explicit' },

  { id: 'SC-T07', from: 'Issued', to: 'Overdue', event: 'DUE_DATE_PASSED',
    actors: ['System.Timer'],
    guards: ['due date + grace period elapsed (GRACE PERIOD HAS NO PRD VALUE)', 'outstanding balance > 0'],
    effects: ['begin arrears aging (EM-01)',
              'a manager-configured penalty rule MAY apply (EM-01) — but never an AI-driven penalty (AI-E-03)'],
    notify: ['Resident', 'EstateManager'], requirementIds: ['EM-01', 'AI-E-03'], provenance: 'prd-explicit' },

  { id: 'SC-T08', from: 'Overdue', to: 'InArrears', event: 'AGE',
    actors: ['System.Timer'], guards: ['aging threshold per tenant — NO PRD VALUE'],
    effects: ['arrears aging bucket advances'], notify: ['Resident', 'EstateManager'],
    requirementIds: ['EM-01'], provenance: 'prd-explicit' },

  { id: 'SC-T09', from: 'InArrears', to: 'Escalated', event: 'ESCALATE',
    actors: ['System.Rule', 'EstateManager'],
    guards: ['per-tenant escalation policy satisfied (§10: "Escalation policy per tenant" — content undefined)'],
    effects: ['SC-10 financial-action audit entry'], notify: ['Resident', 'EstateManager'],
    requirementIds: ['EM-01', 'SC-10'], provenance: 'prd-explicit' },

  { id: 'SC-T10', from: 'Overdue', to: 'PartiallyPaid', event: 'PAYMENT_CONFIRMED',
    actors: ['System.Webhook'], guards: ['0 < amount < balance'], effects: ['receipt'],
    notify: ['Resident'], requirementIds: ['EM-01', 'SC-02'], provenance: 'prd-implied',
    note: 'Not drawn in §10 — the arrears track has no return edges. Required.' },
  { id: 'SC-T11', from: 'Overdue', to: 'Paid', event: 'PAYMENT_CONFIRMED',
    actors: ['System.Webhook'], guards: ['settles balance'], effects: ['cancel reminders', 'receipt'],
    notify: ['Resident'], requirementIds: ['EM-01', 'SC-02'], provenance: 'prd-implied' },
  { id: 'SC-T12', from: 'InArrears', to: 'PartiallyPaid', event: 'PAYMENT_CONFIRMED',
    actors: ['System.Webhook'], guards: ['0 < amount < balance'], effects: ['receipt'],
    notify: ['Resident'], requirementIds: ['EM-01', 'SC-02'], provenance: 'prd-implied' },
  { id: 'SC-T13', from: 'InArrears', to: 'Paid', event: 'PAYMENT_CONFIRMED',
    actors: ['System.Webhook'], guards: ['settles balance'], effects: ['cancel reminders', 'receipt'],
    notify: ['Resident'], requirementIds: ['EM-01', 'SC-02'], provenance: 'prd-implied' },
  { id: 'SC-T14', from: 'Escalated', to: 'PartiallyPaid', event: 'PAYMENT_CONFIRMED',
    actors: ['System.Webhook'], guards: ['0 < amount < balance'], effects: ['receipt'],
    notify: ['Resident', 'EstateManager'], requirementIds: ['EM-01', 'SC-02'], provenance: 'prd-implied' },
  { id: 'SC-T15', from: 'Escalated', to: 'Paid', event: 'PAYMENT_CONFIRMED',
    actors: ['System.Webhook'], guards: ['settles balance'], effects: ['cancel reminders', 'receipt'],
    notify: ['Resident', 'EstateManager'], requirementIds: ['EM-01', 'SC-02'], provenance: 'prd-implied',
    note: 'The PRD defines NO exit from Escalated. This is the minimum viable exit.' },

  // NOT IN THE PRD — do not implement without sign-off.
  { id: 'SC-T16', from: 'Draft', to: 'Paid', event: 'VOID',
    actors: ['EstateManager'], guards: [], effects: [], notify: ['Resident'],
    requirementIds: ['EM-01', 'SC-02'], provenance: 'derived-proposed',
    note: 'PLACEHOLDER. There is NO Void/Cancelled/WrittenOff state in the PRD — a charge raised in error has no legal exit. SC-02 supports refund/void at the payment layer only. Needs a real target state.' },
];

const TIMERS: readonly TimerSpec<ServiceChargeState>[] = [
  { id: 'SC-REMINDER-R1', activeIn: ['Issued', 'PartiallyPaid'], startsOn: 'due date minus 3 days',
    defaultDuration: 'P3D (before due)', onExpiry: { kind: 'notify', audience: ['Resident'] },
    configurablePerTenant: true, source: 'prd-proposed-default', requirementIds: ['EM-01', 'SC-09'] },
  { id: 'SC-REMINDER-R2', activeIn: ['Issued', 'PartiallyPaid'], startsOn: 'due date',
    defaultDuration: 'PT0S (on due)', onExpiry: { kind: 'notify', audience: ['Resident'] },
    configurablePerTenant: true, source: 'prd-proposed-default', requirementIds: ['EM-01', 'SC-09'] },
  { id: 'SC-REMINDER-R3', activeIn: ['Overdue', 'InArrears', 'PartiallyPaid'], startsOn: 'due date plus 7 days',
    defaultDuration: 'P7D (after due)', onExpiry: { kind: 'notify', audience: ['Resident'] },
    configurablePerTenant: true, source: 'prd-proposed-default', requirementIds: ['EM-01', 'SC-09'] },
  { id: 'SC-REMINDER-R4', activeIn: ['Overdue', 'InArrears', 'Escalated', 'PartiallyPaid'], startsOn: 'due date plus 21 days',
    defaultDuration: 'P21D (after due)', onExpiry: { kind: 'notify', audience: ['Resident', 'EstateManager'] },
    configurablePerTenant: true, source: 'prd-proposed-default', requirementIds: ['EM-01', 'SC-09'] },
  { id: 'SC-GRACE', activeIn: ['Issued'], startsOn: 'due date', defaultDuration: null,
    onExpiry: { kind: 'transition', to: 'Overdue', actor: 'System.Timer' },
    configurablePerTenant: true, source: 'not-in-prd', requirementIds: ['EM-01'] },
  { id: 'SC-AGING', activeIn: ['Overdue'], startsOn: 'entry to Overdue', defaultDuration: null,
    onExpiry: { kind: 'transition', to: 'InArrears', actor: 'System.Timer' },
    configurablePerTenant: true, source: 'prd-per-tenant-policy', requirementIds: ['EM-01'] },
  { id: 'SC-ESCALATION', activeIn: ['InArrears'], startsOn: 'entry to InArrears', defaultDuration: null,
    onExpiry: { kind: 'transition', to: 'Escalated', actor: 'System.Rule' },
    configurablePerTenant: true, source: 'prd-per-tenant-policy',
    requirementIds: ['EM-01'], note: '§10: "Escalation policy per tenant".' },
];

const AI: readonly AiTouchpoint<ServiceChargeState>[] = [
  { featureId: 'AI-E-03', priority: 'Should', attachesTo: ['Issued', 'PartiallyPaid', 'Overdue', 'InArrears', 'Escalated'],
    suggests: 'billing/payment history → anomaly flags, defaulter-risk scores, reminder-timing suggestions',
    humanInTheLoop: 'Managers approve reminder campaigns; no automated penalties ever.',
    fallback: 'fixed reminder schedule (the -3d / due / +7d / +21d defaults)',
    benchmark: 'Risk model AUC >= 0.75 after two billing cycles', mayFireTransition: false },
  { featureId: 'AI-E-04', priority: 'Should', attachesTo: 'workflow',
    suggests: 'drafts reminder/arrears communications and translates into configured languages',
    humanInTheLoop: 'Manager approval required before any send (EM-04: "always requires manager approval before send").',
    fallback: 'manual compose', benchmark: 'Human review pass rate >= 90%', mayFireTransition: false },
];

export const serviceChargeMachine: MachineSpec<ServiceChargeState, ServiceChargeEvent> = {
  key: 'service-charge',
  prdSection: '§10 · EM-01',
  prdStatesVerbatim: 'Draft → Issued → Partially paid → Paid; Issued → Overdue → In arrears → Escalated',
  prdRulesVerbatim: 'Reminder schedule (e.g. −3d, due, +7d, +21d) via SC-09; AI timing suggestions (AI-E-03) require manager approval. Escalation policy per tenant.',
  states: ['Draft', 'Issued', 'PartiallyPaid', 'Paid', 'Overdue', 'InArrears', 'Escalated'],
  initial: ['Draft'], branch: ['Overdue', 'InArrears', 'Escalated'], terminal: ['Paid'],
  transitions: T, timers: TIMERS, ai: AI,
  invariants: [
    'Resident is the only role that can pay in-app (§7 Payments row = O for Res, — for all others).',
    'All payment application is webhook-confirmed and idempotent (SC-02).',
    'NO AUTOMATED PENALTIES EVER (AI-E-03). Manager-configured deterministic penalty rules (EM-01) are permitted; AI-influenced penalties are not.',
    'Every transition is a FINANCIAL ACTION for SC-10 audit purposes.',
    'What constitutes Paid depends on Q10 (gateway settlement vs bank statements) — unresolved.',
  ],
};

```

### src/domain/workflow/booking.machine.ts (`typescript`)

```typescript
import type { MachineSpec, TransitionSpec, TimerSpec, AiTouchpoint } from './core';

/**
 * PRD §10 Booking — EM-05.
 * NOTE: §10 writes "Approved / Auto-approved" as alternatives. Modelled here as a
 * SINGLE `Approved` state with an `approvalMode` discriminant, because the outgoing
 * transition set is identical. Confirm at discovery (open issue).
 */
export type BookingState =
  | 'Requested' | 'Approved' | 'Confirmed' | 'Completed'
  | 'Declined' | 'Cancelled';

export type BookingApprovalMode = 'manual' | 'auto';

export type BookingEvent =
  | 'REQUEST' | 'APPROVE' | 'AUTO_APPROVE' | 'CONFIRM' | 'PAYMENT_CONFIRMED'
  | 'COMPLETE' | 'DECLINE' | 'CANCEL' | 'EXPIRE_UNPAID';

const T: readonly TransitionSpec<BookingState, BookingEvent>[] = [
  { id: 'BK-T01', from: null, to: 'Requested', event: 'REQUEST',
    actors: ['Resident'], scope: { Resident: 'O' },
    guards: ['slot within amenity hours (EM-05)', 'capacity not exceeded (EM-05)', 'amenity rules satisfied'],
    effects: ['hold the slot on the availability calendar (EM-05)'],
    notify: ['Resident', 'EstateManager'], requirementIds: ['EM-05'], provenance: 'prd-implied' },

  { id: 'BK-T02', from: 'Requested', to: 'Approved', event: 'APPROVE',
    actors: ['EstateManager'], scope: { EstateManager: 'M' },
    guards: ['amenity configured for manager approval (EM-05)'],
    effects: ['set approvalMode = manual'], notify: ['Resident'],
    requirementIds: ['EM-05'], provenance: 'prd-explicit' },

  { id: 'BK-T03', from: 'Requested', to: 'Approved', event: 'AUTO_APPROVE',
    actors: ['System.Rule'], guards: ['§10: auto-approval per amenity rules satisfied'],
    effects: ['set approvalMode = auto'], notify: ['Resident', 'EstateManager'],
    requirementIds: ['EM-05'], provenance: 'prd-explicit' },

  { id: 'BK-T04', from: 'Requested', to: 'Declined', event: 'DECLINE',
    actors: ['EstateManager'], guards: [], effects: ['release the held slot'],
    notify: ['Resident'], requirementIds: ['EM-05'], provenance: 'prd-explicit' },

  { id: 'BK-T05', from: 'Requested', to: 'Cancelled', event: 'CANCEL',
    actors: ['Resident', 'EstateManager'], scope: { Resident: 'O' },
    guards: [], effects: ['release the held slot'], notify: ['Resident', 'EstateManager'],
    requirementIds: ['EM-05'], provenance: 'prd-explicit' },

  { id: 'BK-T06', from: 'Approved', to: 'Confirmed', event: 'CONFIRM',
    actors: ['System.Rule'], guards: ['amenity has NO fee'],
    effects: ['slot firmly booked'], notify: ['Resident'],
    requirementIds: ['EM-05'], provenance: 'prd-explicit',
    note: '§10 "payment (if fees) required to confirm" implies fee-free bookings confirm without payment.' },

  { id: 'BK-T07', from: 'Approved', to: 'Confirmed', event: 'PAYMENT_CONFIRMED',
    actors: ['System.Webhook'], scope: { Resident: 'O' },
    guards: ['amenity HAS a fee', 'SC-02 gateway webhook confirms payment, idempotent',
             'order/payment served by the shared SC-04 cart/order/payment services'],
    effects: ['receipt', 'slot firmly booked'], notify: ['Resident'],
    requirementIds: ['EM-05', 'SC-02', 'SC-04'], provenance: 'prd-explicit' },

  { id: 'BK-T08', from: 'Approved', to: 'Cancelled', event: 'CANCEL',
    actors: ['Resident', 'EstateManager'], scope: { Resident: 'O' },
    guards: ['Resident: within the cancellation window per policy (WINDOW LENGTH HAS NO PRD VALUE)',
             'EstateManager: any time'],
    effects: ['release slot'], notify: ['Resident', 'EstateManager'],
    requirementIds: ['EM-05'], provenance: 'prd-explicit' },

  { id: 'BK-T09', from: 'Confirmed', to: 'Completed', event: 'COMPLETE',
    actors: ['System.Timer', 'EstateManager'],
    guards: ['TRIGGER UNSPECIFIED IN PRD — candidates: slot end, manager action, security check-out'],
    effects: ['free the amenity', 'feed utilisation reporting'],
    notify: ['Resident'], requirementIds: ['EM-05'], provenance: 'prd-explicit',
    note: 'State is prd-explicit; the trigger is derived-proposed. Security holds only V on bookings (§7), so a security check-out would require a §7 amendment.' },

  { id: 'BK-T10', from: 'Confirmed', to: 'Cancelled', event: 'CANCEL',
    actors: ['Resident', 'EstateManager'], scope: { Resident: 'O' },
    guards: ['within the cancellation window per policy'],
    effects: ['if a fee was paid, refund per policy via SC-02 refund/void — REFUND POLICY NOT SPECIFIED',
              'release slot'],
    notify: ['Resident', 'EstateManager'], requirementIds: ['EM-05', 'SC-02'], provenance: 'prd-explicit' },

  // NOT IN THE PRD — do not implement without sign-off.
  { id: 'BK-T11', from: 'Approved', to: 'Cancelled', event: 'EXPIRE_UNPAID',
    actors: ['System.Timer'], guards: ['fee-bearing booking approved but unpaid past a hold window'],
    effects: ['release slot'], notify: ['Resident'],
    requirementIds: ['EM-05'], provenance: 'derived-proposed',
    note: 'Without this, an approved-but-never-paid booking holds a slot indefinitely. No PRD guidance.' },
];

const TIMERS: readonly TimerSpec<BookingState>[] = [
  { id: 'BK-CANCELLATION-WINDOW', activeIn: ['Approved', 'Confirmed'], startsOn: 'booking slot start minus window',
    defaultDuration: null, onExpiry: { kind: 'flag', flag: 'cancellationWindowClosed' },
    configurablePerTenant: true, source: 'prd-per-tenant-policy',
    requirementIds: ['EM-05'], note: '§10 "cancellation window per policy"; EM-05 "cancellation per policy". NO VALUE GIVEN.' },
  { id: 'BK-PAYMENT-HOLD', activeIn: ['Approved'], startsOn: 'entry to Approved with an unpaid fee',
    defaultDuration: null, onExpiry: { kind: 'transition', to: 'Cancelled', actor: 'System.Timer' },
    configurablePerTenant: true, source: 'not-in-prd', requirementIds: ['EM-05'] },
  { id: 'BK-SLOT-END', activeIn: ['Confirmed'], startsOn: 'booking slot end',
    defaultDuration: null, onExpiry: { kind: 'transition', to: 'Completed', actor: 'System.Timer' },
    configurablePerTenant: false, source: 'not-in-prd', requirementIds: ['EM-05'] },
];

const AI: readonly AiTouchpoint<BookingState>[] = [
  { featureId: 'AI-S-05', priority: 'Could', attachesTo: 'workflow',
    suggests: 'shared personalisation and anomaly service behind AI-E-05 and bookings',
    humanInTheLoop: 'As AI-E-05: fraud flags go to a human review queue — never auto-block.',
    fallback: 'As AI-E-05: manual flow, no recommendations',
    benchmark: 'As AI-E-05', mayFireTransition: false },
  { featureId: 'AI-E-01', priority: 'Should', attachesTo: 'workflow',
    suggests: 'resident booking questions answered from the estate RAG corpus with sources',
    humanInTheLoop: 'No source → must refuse and escalate to a ticket (EM-03). Corpus curated by the Estate Manager.',
    fallback: 'FAQ + ticket',
    benchmark: 'Routine-query deflection >= 60%; grounded-answer accuracy >= 90%', mayFireTransition: false },
];

export const bookingMachine: MachineSpec<BookingState, BookingEvent> = {
  key: 'booking',
  prdSection: '§10 · EM-05',
  prdStatesVerbatim: 'Requested → Approved / Auto-approved → Confirmed → Completed; branches: Declined, Cancelled',
  prdRulesVerbatim: 'Auto-approval per amenity rules; payment (if fees) required to confirm; cancellation window per policy.',
  states: ['Requested', 'Approved', 'Confirmed', 'Completed', 'Declined', 'Cancelled'],
  initial: ['Requested'], branch: ['Declined', 'Cancelled'],
  terminal: ['Completed', 'Declined', 'Cancelled'],
  transitions: T, timers: TIMERS, ai: AI,
  invariants: [
    'A fee-bearing booking cannot reach Confirmed without a webhook-confirmed payment (§10, SC-02).',
    'Security holds V only on Bookings & amenities (§7) — it can see bookings but cannot transition them.',
    'A fraud flag from AI-S-05/AI-E-05 is metadata plus a review-queue entry; it must never auto-block or auto-decline.',
    'This machine has NO numeric SLA default anywhere in the PRD.',
  ],
};

```

### src/domain/workflow/sos-event.machine.ts (`typescript`)

```typescript
import type { MachineSpec, TransitionSpec, TimerSpec, AiTouchpoint } from './core';

/** PRD §10 SOS event — EM-06. Safety-critical. Strictly linear: no branch states. */
export type SosState = 'Raised' | 'Acknowledged' | 'Responding' | 'Resolved' | 'Reviewed';

export type SosEvent = 'RAISE' | 'ACKNOWLEDGE' | 'RESPOND' | 'RESOLVE' | 'REVIEW';

/** How the alert reached the platform. EM-06 / §12.1. */
export type SosChannel = 'InApp' | 'QueuedOffline' | 'SmsFallback';

const T: readonly TransitionSpec<SosState, SosEvent>[] = [
  { id: 'SOS-T01', from: null, to: 'Raised', event: 'RAISE',
    actors: ['Resident'], scope: { Resident: 'O' },
    guards: ['tenant + estate scope', 'resident linked to a unit (§8.1 SOS event links resident/unit)'],
    effects: ['EM-06: alert the security desk AND designated responders with unit/location',
              'start the 60s acknowledge clock',
              'SC-10 audit — security events are named in the mandatory audit set',
              'accepted via InApp, QueuedOffline (§12.1) or SmsFallback (proposed)'],
    notify: ['Security', 'DesignatedResponders', 'EstateManager'],
    requirementIds: ['EM-06', 'SC-10'], provenance: 'prd-implied' },

  { id: 'SOS-T02', from: 'Raised', to: 'Acknowledged', event: 'ACKNOWLEDGE',
    actors: ['Security', 'EstateManager'], scope: { Security: 'M', EstateManager: 'M' },
    guards: [],
    effects: ['stop the acknowledge clock and record hit/miss against the <60s target',
              'notify the raising resident — EM-06 user story: "I trigger an SOS and know security has seen it"'],
    notify: ['Resident', 'EstateManager'], requirementIds: ['EM-06'], provenance: 'prd-explicit' },

  { id: 'SOS-T03', from: 'Acknowledged', to: 'Responding', event: 'RESPOND',
    actors: ['Security', 'EstateManager'], guards: [],
    effects: ['record responder identity and timestamp on the trail (§8.1)'],
    notify: ['Resident', 'EstateManager'], requirementIds: ['EM-06'], provenance: 'prd-explicit',
    note: 'No SLA target given for this leg.' },

  { id: 'SOS-T04', from: 'Responding', to: 'Resolved', event: 'RESOLVE',
    actors: ['Security', 'EstateManager'], guards: [],
    effects: ['create incident log entry (EM-06 "Patrol and incident logging")'],
    notify: ['Resident', 'EstateManager'], requirementIds: ['EM-06'], provenance: 'prd-explicit',
    note: 'No SLA target given for this leg.' },

  { id: 'SOS-T05', from: 'Resolved', to: 'Reviewed', event: 'REVIEW',
    actors: ['EstateManager'], scope: { EstateManager: 'M' }, guards: [],
    effects: ['close out the post-incident review',
              '§10: "full timeline retained for review" — the actor-attributed, timestamped trail is the artefact'],
    notify: ['EstateManager', 'Executive'], requirementIds: ['EM-06', 'SC-10'], provenance: 'prd-explicit' },
];

const TIMERS: readonly TimerSpec<SosState>[] = [
  { id: 'SOS-ACK', activeIn: ['Raised'], startsOn: 'SOS-T01 (raise)', defaultDuration: 'PT60S',
    onExpiry: { kind: 'escalate', audience: ['BackupResponders', 'EstateManager'], stateUnchanged: true },
    configurablePerTenant: true, source: 'prd-proposed-default', requirementIds: ['EM-06'],
    note: '§10: "Acknowledge target < 60s during manned hours (proposed); unacknowledged alerts escalate to backup responders." There is NO Escalated state — escalation sets a flag and notifies, state stays Raised. Manned-hours calendar and backup-responder chain are owned by Q4.' },
];

/** SOS has NO AI feature in default acceptance. AI-E-06 is adjacent and gated. */
const AI: readonly AiTouchpoint<SosState>[] = [
  { featureId: 'AI-E-06', priority: 'Could', attachesTo: 'workflow',
    suggests: 'CCTV anomaly detection and face/plate recognition (security & access, adjacent to SOS)',
    humanInTheLoop: 'Prerequisites: NDPA compliance, explicit consent and DPIA sign-off (Q5). Builds only after sign-off; integrates with client hardware (hardware out of scope).',
    fallback: 'no AI security features',
    benchmark: 'Defined during DPIA; not in default acceptance', mayFireTransition: false },
];

export const sosEventMachine: MachineSpec<SosState, SosEvent> = {
  key: 'sos-event',
  prdSection: '§10 · EM-06',
  prdStatesVerbatim: 'Raised → Acknowledged → Responding → Resolved → Reviewed',
  prdRulesVerbatim: 'Acknowledge target < 60s during manned hours (proposed); unacknowledged alerts escalate to backup responders; full timeline retained for review.',
  states: ['Raised', 'Acknowledged', 'Responding', 'Resolved', 'Reviewed'],
  initial: ['Raised'], branch: [], terminal: ['Reviewed'],
  transitions: T, timers: TIMERS, ai: AI,
  invariants: [
    'Strictly linear — the only §10 machine with no branch states. Every raised event must traverse the full chain.',
    'There is NO cancel / false-alarm state. An accidental trigger can only be discharged by a responder walking it to Resolved. Safety-critical gap (Q4).',
    'Escalation after 60s does NOT change state — adding an Escalated state would violate the §10 closed-world rule.',
    'Every SOS transition is a SECURITY EVENT for SC-10 audit (EM-06: "all security events audit-logged").',
    'SOS must work on poor connectivity: queued write with visible sync status, plus SMS fallback (§12.1, EM-06, both proposed).',
    'SC-09 quiet hours must NOT suppress SOS alerts — the PRD does not state this and it must be confirmed.',
    'No AI feature may raise, acknowledge, respond to or resolve an SOS (§11.4: AI is assistive, not autonomous).',
  ],
};

```

### src/domain/workflow/marketplace-order.machine.ts (`typescript`)

```typescript
import type { MachineSpec, TransitionSpec, TimerSpec, AiTouchpoint } from './core';

/**
 * PRD §10 Marketplace order — EM-09, on the SC-04 shared catalog/order/payment substrate.
 * NOTE: `Expired` is implied by "auto-expires" but is NOT one of the two listed branches
 * (Declined, Refunded). Included here and flagged as an open issue.
 */
export type MarketplaceOrderState =
  | 'Placed' | 'Accepted' | 'Fulfilled' | 'Closed'
  | 'Declined' | 'Refunded' | 'Expired';

export type MarketplaceOrderEvent =
  | 'PLACE' | 'ACCEPT' | 'DECLINE' | 'AUTO_EXPIRE' | 'FULFIL' | 'CLOSE' | 'REFUND';

const T: readonly TransitionSpec<MarketplaceOrderState, MarketplaceOrderEvent>[] = [
  { id: 'MK-T01', from: null, to: 'Placed', event: 'PLACE',
    actors: ['Resident'], scope: { Resident: 'O' },
    guards: ['listing active', 'vendor approved (EM-07 "approved vendors")',
             'PAYMENT TIMING UNDEFINED — at place or at accept (open issue)'],
    effects: ['start the vendor accept SLA clock',
              'order served by the shared SC-04 catalog/cart/order/payment services'],
    notify: ['Vendor', 'Resident'], requirementIds: ['EM-09', 'SC-02', 'SC-04'], provenance: 'prd-implied' },

  { id: 'MK-T02', from: 'Placed', to: 'Accepted', event: 'ACCEPT',
    actors: ['Vendor'], scope: { Vendor: 'O' },
    guards: ['within the vendor accept SLA (VALUE NOT GIVEN IN PRD)'],
    effects: ['stop the accept clock and record hit/miss (feeds FM-05 SLA hit rate)'],
    notify: ['Resident'], requirementIds: ['EM-09', 'FM-05'], provenance: 'prd-explicit' },

  { id: 'MK-T03', from: 'Placed', to: 'Declined', event: 'DECLINE',
    actors: ['Vendor'], scope: { Vendor: 'O' }, guards: [],
    effects: ['if already paid, refund via SC-02 refund/void (idempotent)'],
    notify: ['Resident'], requirementIds: ['EM-09', 'SC-02'], provenance: 'prd-explicit' },

  { id: 'MK-T04', from: 'Placed', to: 'Expired', event: 'AUTO_EXPIRE',
    actors: ['System.Timer'],
    guards: ['§10: "Vendor must accept within SLA or order auto-expires" — SLA VALUE NOT GIVEN'],
    effects: ['release/refund if paid', 'count against vendor performance metrics (FM-05)'],
    notify: ['Resident', 'Vendor', 'EstateManager'],
    requirementIds: ['EM-09', 'SC-02', 'FM-05'], provenance: 'prd-explicit',
    note: 'The RULE is prd-explicit; the STATE NAME is not listed among the §10 branches. Confirm whether Expired is its own state or a system-attributed Declined.' },

  { id: 'MK-T05', from: 'Accepted', to: 'Fulfilled', event: 'FULFIL',
    actors: ['Vendor'], scope: { Vendor: 'O' }, guards: [], effects: [],
    notify: ['Resident'], requirementIds: ['EM-09'], provenance: 'prd-explicit' },

  { id: 'MK-T06', from: 'Fulfilled', to: 'Closed', event: 'CLOSE',
    actors: ['Resident', 'EstateManager', 'System.Timer'], scope: { Resident: 'O', EstateManager: 'M' },
    guards: ['TRIGGER UNSPECIFIED IN PRD — no auto-close rule is stated for marketplace orders'],
    effects: ['Closed does NOT imply the vendor has been paid — payout is a separate lifecycle blocked by Q3'],
    notify: ['Resident', 'Vendor'], requirementIds: ['EM-09', 'Q3'], provenance: 'prd-explicit',
    note: 'State is prd-explicit; the trigger is derived-proposed. The work-order 5-day auto-close is NOT extended here by the PRD.' },

  { id: 'MK-T07', from: 'Accepted', to: 'Refunded', event: 'REFUND',
    actors: ['EstateManager'], scope: { EstateManager: 'M' },
    guards: ['idempotent gateway refund (SC-02 refund/void)'],
    effects: ['SC-10 financial-action audit entry'], notify: ['Resident', 'Vendor'],
    requirementIds: ['EM-09', 'SC-02', 'SC-10'], provenance: 'prd-explicit',
    note: 'Branch is prd-explicit; the authorising actor is derived — §7 gives PlatformAdmin only V on Marketplace.' },
  { id: 'MK-T08', from: 'Fulfilled', to: 'Refunded', event: 'REFUND',
    actors: ['EstateManager'], guards: ['idempotent gateway refund'], effects: ['SC-10 audit entry'],
    notify: ['Resident', 'Vendor'], requirementIds: ['EM-09', 'SC-02'], provenance: 'prd-explicit' },
  { id: 'MK-T09', from: 'Closed', to: 'Refunded', event: 'REFUND',
    actors: ['EstateManager'], guards: ['idempotent gateway refund', 'refund window — NOT SPECIFIED'],
    effects: ['SC-10 audit entry'], notify: ['Resident', 'Vendor'],
    requirementIds: ['EM-09', 'SC-02'], provenance: 'prd-explicit',
    note: 'Which states permit Refunded is not specified; all post-payment states are assumed.' },
];

const TIMERS: readonly TimerSpec<MarketplaceOrderState>[] = [
  { id: 'MK-ACCEPT-SLA', activeIn: ['Placed'], startsOn: 'MK-T01 (order placed)',
    defaultDuration: null,
    onExpiry: { kind: 'transition', to: 'Expired', actor: 'System.Timer' },
    configurablePerTenant: true, source: 'prd-per-tenant-policy', requirementIds: ['EM-09'],
    note: '§10 says only "within SLA". NO VALUE PROPOSED — this is the timer that fires the auto-expire transition, so the machine cannot be completed without it.' },
];

const AI: readonly AiTouchpoint<MarketplaceOrderState>[] = [
  { featureId: 'AI-E-05', priority: 'Could', attachesTo: 'workflow',
    suggests: 'listing auto-generation, personalised recommendations, fraud flags',
    humanInTheLoop: 'Fraud flags go to a human review queue — never auto-block.',
    fallback: 'manual listings, no recommendations',
    benchmark: 'Fraud-flag precision >= 60% at review (pilot)', mayFireTransition: false },
  { featureId: 'AI-S-05', priority: 'Could', attachesTo: 'workflow',
    suggests: 'shared personalisation and anomaly service behind AI-E-05 and bookings',
    humanInTheLoop: 'As AI-E-05.', fallback: 'As AI-E-05.', benchmark: 'As AI-E-05', mayFireTransition: false },
];

export const marketplaceOrderMachine: MachineSpec<MarketplaceOrderState, MarketplaceOrderEvent> = {
  key: 'marketplace-order',
  prdSection: '§10 · EM-09',
  prdStatesVerbatim: 'Placed → Accepted → Fulfilled → Closed; branches: Declined, Refunded',
  prdRulesVerbatim: 'Vendor must accept within SLA or order auto-expires; refunds via gateway; payout model pending Q3.',
  states: ['Placed', 'Accepted', 'Fulfilled', 'Closed', 'Declined', 'Refunded', 'Expired'],
  initial: ['Placed'], branch: ['Declined', 'Refunded', 'Expired'],
  terminal: ['Closed', 'Declined', 'Refunded', 'Expired'],
  transitions: T, timers: TIMERS, ai: AI,
  invariants: [
    'Closed must NOT imply the vendor has been settled — Q3 (commission %, escrow, payout rails, KYC) blocks the payout build. Model settlement as a separate, deferred lifecycle keyed off the order.',
    'A fraud flag from AI-E-05/AI-S-05 must never auto-decline or block an order — human review queue only.',
    'All refunds go through the SC-02 gateway abstraction, idempotent with retries; every refund is an SC-10 financial action.',
    'Vendor acts only on its own orders (§7 Marketplace: Ven = O); Resident places only its own (Res = O); EstateManager manages (M); PlatformAdmin and Executive are view-only.',
  ],
};

```

### src/domain/workflow/index.ts (`typescript`)

```typescript
export * from './core';
export * from './work-order.machine';
export * from './service-charge.machine';
export * from './booking.machine';
export * from './sos-event.machine';
export * from './marketplace-order.machine';

import { workOrderMachine } from './work-order.machine';
import { serviceChargeMachine } from './service-charge.machine';
import { bookingMachine } from './booking.machine';
import { sosEventMachine } from './sos-event.machine';
import { marketplaceOrderMachine } from './marketplace-order.machine';

/** The five PRD §10 workflows. */
export const WORKFLOWS = {
  'work-order': workOrderMachine,
  'service-charge': serviceChargeMachine,
  booking: bookingMachine,
  'sos-event': sosEventMachine,
  'marketplace-order': marketplaceOrderMachine,
} as const;

export type WorkflowKey = keyof typeof WORKFLOWS;

```

### src/domain/workflow/domain-status-tokens.ts (`typescript`)

```typescript
/**
 * Status tokens for the five PRD §10 machines, for the cargoflow-next design system.
 *
 * Replaces the template's flat `STATUS_COLORS: Record<LoadStatus, string>` in
 * src/components/ui/index.tsx. A flat map cannot work here: state names COLLIDE
 * across machines — 'Closed' (work order + marketplace order), 'Cancelled'
 * (work order + booking), 'Declined' (booking + marketplace order), 'Draft'
 * (service charge). Tone is resolved per (workflow, state).
 *
 * The template's existing scale is reused: #8b93a1, #3b82f6, #8b5cf6, #f59e0b,
 * #10b981, #6b7280. Only `danger` and `critical` are new.
 */
import type { WorkflowKey } from './index';

export type StatusTone =
  | 'neutral'   // not yet live (Draft, New)
  | 'info'      // acknowledged, moving
  | 'accent'    // triaged / assigned / approved
  | 'progress'  // actively worked
  | 'paused'    // blocked, clock may be running
  | 'warn'      // overdue / at risk
  | 'danger'    // arrears, escalated, declined, expired, refunded
  | 'critical'  // SOS raised — the single most urgent token in the system
  | 'success'   // resolved / paid / completed / verified
  | 'closed';   // terminal, settled, archived

export const TONE_COLORS: Record<StatusTone, string> = {
  neutral:  '#8b93a1', // template grey
  info:     '#3b82f6', // template blue
  accent:   '#8b5cf6', // template violet
  progress: '#f59e0b', // template amber
  paused:   '#b45309', // amber-dark (new)
  warn:     '#f97316', // orange (new)
  danger:   '#ef4444', // red (new)
  critical: '#dc2626', // deep red (new) — SOS only
  success:  '#10b981', // template green
  closed:   '#6b7280', // template slate
};

type ToneMap = Record<string, StatusTone>;

const WORK_ORDER: ToneMap = {
  New: 'info', Triaged: 'accent', Assigned: 'accent', InProgress: 'progress',
  OnHold: 'paused', Resolved: 'success', Verified: 'success', Closed: 'closed',
  Rejected: 'danger', Cancelled: 'neutral',
};

const SERVICE_CHARGE: ToneMap = {
  Draft: 'neutral', Issued: 'info', PartiallyPaid: 'progress', Paid: 'success',
  Overdue: 'warn', InArrears: 'danger', Escalated: 'critical',
};

const BOOKING: ToneMap = {
  Requested: 'info', Approved: 'accent', Confirmed: 'progress',
  Completed: 'success', Declined: 'danger', Cancelled: 'neutral',
};

const SOS: ToneMap = {
  Raised: 'critical', Acknowledged: 'warn', Responding: 'progress',
  Resolved: 'success', Reviewed: 'closed',
};

const MARKETPLACE: ToneMap = {
  Placed: 'info', Accepted: 'accent', Fulfilled: 'progress', Closed: 'closed',
  Declined: 'danger', Refunded: 'danger', Expired: 'neutral',
};

const TONES: Record<WorkflowKey, ToneMap> = {
  'work-order': WORK_ORDER,
  'service-charge': SERVICE_CHARGE,
  booking: BOOKING,
  'sos-event': SOS,
  'marketplace-order': MARKETPLACE,
};

/** Throws in dev on an unknown state rather than silently rendering grey. */
export function statusTone(workflow: WorkflowKey, state: string): StatusTone {
  const tone = TONES[workflow]?.[state];
  if (!tone) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(`Unknown state "${state}" for workflow "${workflow}"`);
    }
    return 'neutral';
  }
  return tone;
}

export function statusColor(workflow: WorkflowKey, state: string): string {
  return TONE_COLORS[statusTone(workflow, state)];
}

/**
 * EM-03 requires a resident-visible ticket status. Work orders are the shared
 * pipeline, so the resident-facing vocabulary is a PROJECTION of the ten
 * work-order states — not a second machine. Labels are proposed, not from the PRD.
 */
export const RESIDENT_WORK_ORDER_LABEL: Record<string, string> = {
  New: 'Received', Triaged: 'Scheduled', Assigned: 'Scheduled',
  InProgress: 'In progress', OnHold: 'On hold', Resolved: 'Resolved — please confirm',
  Verified: 'Confirmed', Closed: 'Closed', Rejected: 'Not actioned', Cancelled: 'Cancelled',
};

```

### src/domain/workflow/__tests__/contract.test.ts (`typescript`)

```typescript
/**
 * Machine-contract tests. These enforce the §10 sentence:
 * "Only the listed transitions are legal; every transition is timestamped,
 * actor-attributed and notified via SC-09."
 */
import { WORKFLOWS, CONTRACTED_PROVENANCE } from '../index';

describe('PRD §10 workflow contract', () => {
  const machines = Object.values(WORKFLOWS);

  it('every transition names at least one actor (§10 actor-attributed)', () => {
    for (const m of machines)
      for (const t of m.transitions)
        expect(t.actors.length).toBeGreaterThan(0);
  });

  it('every transition targets a declared state', () => {
    for (const m of machines)
      for (const t of m.transitions) {
        expect(m.states).toContain(t.to);
        if (t.from !== null) expect(m.states).toContain(t.from);
      }
  });

  it('terminal states have no outgoing transitions', () => {
    for (const m of machines)
      for (const terminal of m.terminal)
        expect(m.transitions.filter((t) => t.from === terminal && t.to !== terminal)).toEqual([]);
  });

  it('every non-terminal state is reachable and can be left', () => {
    for (const m of machines)
      for (const s of m.states) {
        expect(m.transitions.some((t) => t.to === s)).toBe(true);
        if (!m.terminal.includes(s))
          expect(m.transitions.some((t) => t.from === s)).toBe(true);
      }
  });

  it('no AI feature is ever a transition actor (§11.4 assistive, not autonomous)', () => {
    for (const m of machines) {
      for (const a of m.ai) expect(a.mayFireTransition).toBe(false);
      for (const t of m.transitions)
        for (const actor of t.actors) expect(actor).not.toMatch(/^AI-/);
    }
  });

  /**
   * RELEASE GATE: derived edges are proposals, not contract. Flip this on once the
   * open-issues register is answered, or gate it behind a signed-off allow-list.
   */
  it.skip('only contracted transitions ship', () => {
    for (const m of machines)
      for (const t of m.transitions)
        expect(CONTRACTED_PROVENANCE).toContain(t.provenance);
  });

  it('reports every timer with no proposed default (build-blocking gaps)', () => {
    const gaps = machines.flatMap((m) =>
      m.timers.filter((t) => t.defaultDuration === null).map((t) => `${m.key}:${t.id}`),
    );
    // Expected today: WO-SLA-RESPOND-ROUTINE, SC-GRACE, SC-AGING, SC-ESCALATION,
    // BK-CANCELLATION-WINDOW, BK-PAYMENT-HOLD, BK-SLOT-END, MK-ACCEPT-SLA.
    expect(gaps.length).toBeGreaterThan(0);
  });
});

```

## Open issues
- WORK ORDER — On Hold placement: the §10 chain reads 'In Progress → On Hold → Resolved', which literally makes On Hold a mandatory step. Confirm On Hold is a pausable branch off In Progress with In Progress → Resolved legal directly.
- WORK ORDER — no reopen/verification-failure edge: §10 lists no path out of Resolved except to Verified or (by timer) Closed. A resident who inspects the work and rejects it has nowhere to go, yet §10 says only listed transitions are legal. Confirm Resolved → In Progress (or → Assigned).
- WORK ORDER — 'auto-close after 5 days' is ambiguous: does the clock run from Resolved (auto-closing unverified work) or from Verified? Does resident activity reset it? Recommendation: from Resolved, with autoClosed flagged for analytics.
- WORK ORDER — priority taxonomy incomplete: §10 names only Emergency (respond 2h / resolve 24h) and Routine (72h), prefixed 'e.g.'. No respond target exists for Routine and no intermediate priorities are defined. This also blocks the AI-F-02 eval set, since the model suggests priority.
- WORK ORDER — does On Hold pause the resolve SLA clock? Not stated. Materially changes SLA hit rate (FM-05) and MTTR (§14).
- WORK ORDER — when do SLA clocks start: at creation (New) or at triage? 'Respond 2h' implies creation, but that penalises the dispatcher for out-of-hours reports.
- WORK ORDER — do PPM-generated (FM-02) and failed-inspection (FM-06) work orders enter at New and require human triage, or enter pre-assigned using the PPM plan's 'assignee rules'? FM-02 supplies assignee rules, so the second reading is plausible.
- WORK ORDER — SLA breach escalation chain is undefined. FM-08 only promises 'Push notifications for assignments and escalations'; no recipients, no repeat cadence, no ceiling.
- WORK ORDER — Rejected vs Cancelled semantics are not distinguished, nor is a rejection reason mandated. Proposal: Rejected = manager judgement (not a valid job), Cancelled = withdrawn by requester or superseded.
- WORK ORDER — evidence upload vs transition: FM-03 requires photos/notes/parts/costs on resolve and FM-02 requires checklist + evidence photo, but §12.1 syncs attachments separately from queued writes. Does RESOLVE block on upload or complete with a pending-evidence flag?
- SERVICE CHARGE — no Void / Cancelled / Written-off state exists. A charge issued in error has no legal exit, despite SC-02 requiring 'refund/void' at the payment layer. Also no Refunded state for a charge.
- SERVICE CHARGE — the arrears chain (Issued → Overdue → In arrears → Escalated) has no return edges to Partially paid or Paid. A resident paying a late charge currently has no legal transition. Confirm the return edges.
- SERVICE CHARGE — three thresholds have no proposed value: the grace period between due date and Overdue, the aging threshold Overdue → In arrears, and the trigger for In arrears → Escalated ('Escalation policy per tenant', content undefined).
- SERVICE CHARGE — Escalated has no defined exit. Is it legal action, a payment plan, a write-off, or does it simply persist until paid?
- SERVICE CHARGE — EM-01 permits configurable penalties while AI-E-03 mandates 'no automated penalties ever'. Confirm the rule: deterministic manager-configured penalties are permitted at the Overdue transition; nothing AI-influenced ever applies a penalty.
- SERVICE CHARGE — Q10 (payment reconciliation source of truth: gateway settlement vs bank statements, Client, Phase 1) determines what legally constitutes 'Paid'. The transition into Paid cannot be finalised until answered.
- SERVICE CHARGE — §8.1 models 'Charge / Invoice' as one entity. Does the state machine run per charge line or per invoice? Partial payments across a multi-line invoice make this material.
- BOOKING — is 'Approved / Auto-approved' two states or one state with an approvalMode discriminant? Recommendation: one state plus discriminant, since the outgoing transition set is identical.
- BOOKING — who or what fires Confirmed → Completed? Candidates: a system timer at slot end, the Estate Manager, or a Security check-out. Note §7 gives Security only V on bookings, so a security-driven completion would require a permissions amendment.
- BOOKING — an approved but unpaid fee-bearing booking holds a slot indefinitely: there is no payment-hold expiry. Also no No-show state.
- BOOKING — 'cancellation window per policy' and the refund treatment on cancellation have no proposed defaults anywhere in the PRD. This machine currently has zero numeric SLA values.
- BOOKING — is Declined reachable after Approved (e.g. manager reverses an auto-approval)? §10 implies Declined only from Requested.
- SOS — there is no Cancelled or False-alarm state. An accidentally triggered panic alert can only be discharged by a responder walking it through Acknowledged → Responding → Resolved. Safety-critical; ties to Q4.
- SOS — confirm that escalation to backup responders after 60s is a side effect that leaves the state at Raised, not a new Escalated state (adding one would violate the §10 closed-world rule).
- SOS — no target exists for Acknowledged → Responding, Responding → Resolved or Resolved → Reviewed, and unmanned-hours behaviour is undefined. Q4 (who responds, escalation chain, liability, manned hours; Client, Phase 1) owns all of it.
- SOS — SC-09 mandates per-user quiet hours, which is exactly when an SOS is most likely. Confirm that SOS alerts override quiet hours and channel preferences for responders.
- SOS — the SMS fallback (proposed, EM-06/§12.1) creates an out-of-band raise path. Duplicate suppression and correlation between an SMS-raised event and a later app queue sync of the same incident is unspecified.
- MARKETPLACE — 'auto-expires' implies an Expired state that is not among the two listed branches (Declined, Refunded). Confirm whether Expired is its own state or a system-attributed Decline.
- MARKETPLACE — the vendor accept SLA has NO proposed value ('within SLA'). It is the timer that fires auto-expire, so the machine cannot be completed without it. This is the single most concrete missing number in §10.
- MARKETPLACE — payment timing is undefined: does the resident pay at Placed or at Accepted? This determines whether Declined and Expired require an automatic refund.
- MARKETPLACE — there is no resident-cancellation path for an order.
- MARKETPLACE — who fires Fulfilled → Closed, and is there an auto-close timer? The work-order 5-day rule is not extended here by the PRD.
- MARKETPLACE — which states permit Refunded, who authorises a refund (§7 gives Platform Admin only V on Marketplace), and is there a refund window?
- MARKETPLACE — Q3 (commission %, escrow, vendor payout rails, KYC; Client, Phase 2 start) blocks the payout build. Confirm that Closed does not imply vendor settlement and that payout is a separate, deferred lifecycle.
- CROSS-CUTTING — the PRD grants no role the ability to force or reverse a transition. §7 gives Platform Admin only V on work orders, charges, bookings, marketplace and Security & SOS. Confirm whether a support-desk override exists, and whether any terminal state can be reopened.
- CROSS-CUTTING — Owner/Executive is V only on all five workflows. Confirm executives genuinely cannot act (e.g. cannot approve a high-value work order or authorise a refund).
- CROSS-CUTTING — §12.1 says only 'Conflict resolution is server-authoritative'. Confirm the concrete rule for a stale offline transition: reject and surface, or apply-then-reconcile. Confirm that transitions carry client-generated idempotency keys and that per-record client sequence order is preserved on replay.
- CROSS-CUTTING — SLA measurement clock: server receipt time or client occurrence time? These diverge for offline technician updates and change every SLA hit-rate figure in FM-05 and FM-07.
- CROSS-CUTTING — typo in FM-01: 'all changes audit-logged (SC-11)' should reference SC-10 (audit logging); SC-11 is the landing page. Worth correcting in the next PRD revision.
- CROSS-CUTTING — Q12 (per-tenant AI/SMS budget caps and alert thresholds, Client, Phase 2). Confirm that hitting a notification cap degrades the notification but never blocks the transition.
