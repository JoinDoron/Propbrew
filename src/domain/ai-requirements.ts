// PRD v2.0 §11 — AI requirements with the mandated four columns:
// inputs->outputs, human-in-the-loop, fallback, proposed benchmark.
// Suggested location: src/domain/ai-requirements.ts

import type { Priority, Phase, OpenQuestionId } from "./requirements";

export interface AiRequirement {
  id: string;
  title: string;
  family: "Facility Management AI" | "Estate Management AI" | "Shared platform AI";
  priority: Priority;
  optional?: true;
  phase: Phase;
  /** "what goes in, what comes out" */
  inputsToOutputs: string;
  /** "where the human sits" */
  humanInTheLoop: string;
  /** "what happens when the AI is unavailable" */
  fallback: string;
  /** Proposed acceptance baseline (TBC unless noted). */
  benchmark: string;
  benchmarkIsHardRequirement?: true;
  blockedBy: OpenQuestionId[];
  relates: string[];
}

export const AI_REQUIREMENTS: AiRequirement[] = [
  {
    id: "AI-F-01", title: "Predictive maintenance", family: "Facility Management AI",
    priority: "Should", phase: 2, blockedBy: [],
    inputsToOutputs: "Asset attributes, WO/failure history, sensor feeds where available -> ranked failure-risk list + suggested PPM dates as DRAFT schedule entries.",
    humanInTheLoop: "FM approves before any schedule changes. Runs in shadow mode until data volume is sufficient (§15.2).",
    fallback: "Standard PPM calendar unaffected (FM-02 operates untouched).",
    benchmark: "After 3-6 months of data: precision >= 70% on 30-day failure window.",
    relates: ["FM-01", "FM-02", "FM-03", "AI-S-06"],
  },
  {
    id: "AI-F-02", title: "Smart work-order triage", family: "Facility Management AI",
    priority: "Should", phase: 2, blockedBy: [],
    inputsToOutputs: "Request text / photos / category -> suggested category, priority and best-fit assignee/vendor, each with confidence.",
    humanInTheLoop: "Dispatcher confirms or overrides; overrides logged for tuning (and for SC-10 'AI overrides').",
    fallback: "Manual triage queue.",
    benchmark: "Top-1 category accuracy >= 85%; assignee suggestion acceptance >= 70%.",
    relates: ["FM-03", "EM-03", "AI-E-02", "SC-10", "AI-S-06"],
  },
  {
    id: "AI-F-03", title: "Vision-based inspections", family: "Facility Management AI",
    priority: "Should", phase: 2, blockedBy: [],
    inputsToOutputs: "Inspection photos -> detected defects with severity + auto-drafted report.",
    humanInTheLoop: "Inspector edits and approves EVERY report.",
    fallback: "Manual checklist flow (FM-06).",
    benchmark: "Defect recall >= 80% on agreed defect classes (pilot set).",
    relates: ["FM-06", "FM-03", "AI-S-06"],
  },
  {
    id: "AI-F-04", title: "Analytics & anomaly alerts", family: "Facility Management AI",
    priority: "Should", phase: 2, blockedBy: [],
    inputsToOutputs: "Cost / energy / usage series -> plain-language anomaly cards with drill-down.",
    humanInTheLoop: "Confirm/dismiss feedback loop tunes sensitivity.",
    fallback: "Static threshold alerts.",
    benchmark: "False-positive rate <= 30% after tuning period.",
    relates: ["FM-07", "AI-S-02", "SC-09"],
  },
  {
    id: "AI-F-05", title: "Facility-manager copilot", family: "Facility Management AI",
    priority: "Should", phase: 2, blockedBy: [],
    inputsToOutputs: "Natural-language queries over tenant-scoped data -> answers with sources; drafted actions (e.g. raise WO).",
    humanInTheLoop: "Every drafted action requires explicit user confirmation.",
    fallback: "Normal navigation and search.",
    benchmark: "Grounded-answer accuracy >= 90% on eval set.",
    relates: ["AI-S-01", "AI-S-06", "SC-01", "FM-03"],
  },
  {
    id: "AI-E-01", title: "Resident support chatbot", family: "Estate Management AI",
    priority: "Should", phase: 2, blockedBy: [],
    inputsToOutputs: "Resident question + estate RAG corpus -> grounded answer with source, or escalation.",
    humanInTheLoop: "No source -> MUST refuse and escalate to a ticket (EM-03). Corpus curated by the Estate Manager.",
    fallback: "FAQ + ticket.",
    benchmark: "Routine-query deflection >= 60%; grounded-answer accuracy >= 90%.",
    relates: ["EM-08", "EM-03", "AI-S-03", "AI-S-06"],
  },
  {
    id: "AI-E-02", title: "Smart request triage", family: "Estate Management AI",
    priority: "Should", phase: 2, blockedBy: [],
    inputsToOutputs: "Photo-based classification and auto-routing of resident requests (SHARED SERVICE with AI-F-02).",
    humanInTheLoop: "Same HITL as AI-F-02 — confirm or override, overrides logged.",
    fallback: "Same as AI-F-02 — manual triage queue.",
    benchmark: "Shared benchmark with AI-F-02.",
    relates: ["AI-F-02", "EM-03", "FM-03", "AI-S-06"],
  },
  {
    id: "AI-E-03", title: "Billing & arrears intelligence", family: "Estate Management AI",
    priority: "Should", phase: 2, blockedBy: [],
    inputsToOutputs: "Billing/payment history -> anomaly flags, defaulter-risk scores, reminder-timing suggestions.",
    humanInTheLoop: "Managers approve reminder campaigns; NO AUTOMATED PENALTIES EVER.",
    fallback: "Fixed reminder schedule (-3d, due, +7d, +21d).",
    benchmark: "Risk model AUC >= 0.75 after two billing cycles.",
    relates: ["EM-01", "SC-09", "SC-02", "AI-S-06"],
  },
  {
    id: "AI-E-04", title: "Communication assistant", family: "Estate Management AI",
    priority: "Should", phase: 2, blockedBy: ["Q6"],
    inputsToOutputs: "Drafts announcements and translates into configured languages.",
    humanInTheLoop: "Manager approval required before ANY send (restated as an EM-04 acceptance criterion).",
    fallback: "Manual compose.",
    benchmark: "Human review pass rate >= 90%.",
    relates: ["EM-04", "SC-09", "SC-03", "AI-S-06"],
  },
  {
    id: "AI-E-05", title: "Marketplace intelligence", family: "Estate Management AI",
    priority: "Could", phase: 3, blockedBy: ["Q3"],
    inputsToOutputs: "Listing auto-generation, personalised recommendations, fraud flags.",
    humanInTheLoop: "Fraud flags go to a human review queue — NEVER auto-block.",
    fallback: "Manual listings, no recommendations.",
    benchmark: "Fraud-flag precision >= 60% at review (pilot).",
    relates: ["EM-09", "SC-04", "AI-S-05", "SC-06"],
  },
  {
    id: "AI-E-06", title: "AI security & access", family: "Estate Management AI",
    priority: "Could", optional: true, phase: 3, blockedBy: ["Q5", "Q7"],
    inputsToOutputs: "CCTV anomaly detection and face/plate recognition.",
    humanInTheLoop: "Prerequisites: NDPA compliance, explicit consent and DPIA sign-off (Q5). Builds ONLY after sign-off; integrates with client hardware (hardware out of scope, §6.3).",
    fallback: "Not stated — the feature simply does not build if Q5 is not signed off.",
    benchmark: "Defined during DPIA; NOT in default acceptance.",
    relates: ["EM-06", "SC-10", "AI-S-06"],
  },
  {
    id: "AI-S-01", title: "Platform-wide copilot", family: "Shared platform AI",
    priority: "Should", phase: 2, blockedBy: [],
    inputsToOutputs: "One conversational assistant across both modules and admin (EXTENDS AI-F-05).",
    humanInTheLoop: "Action confirmation as AI-F-05.",
    fallback: "Standard UI.",
    benchmark: "Shared benchmark with AI-F-05.",
    relates: ["AI-F-05", "SC-06", "SC-01", "AI-S-06"],
  },
  {
    id: "AI-S-02", title: "NL search & reporting", family: "Shared platform AI",
    priority: "Should", phase: 2, blockedBy: [],
    inputsToOutputs: "Questions across data -> answers and reports in plain language with the underlying records viewable.",
    humanInTheLoop: "Every figure traceable to source records.",
    fallback: "Standard reports (FM-07).",
    benchmark: "Query success rate >= 80% on agreed test set.",
    relates: ["FM-07", "AI-F-04", "SC-07", "AI-S-06"],
  },
  {
    id: "AI-S-03", title: "Document intelligence", family: "Shared platform AI",
    priority: "Should", phase: 2, blockedBy: ["Q2", "Q7"],
    inputsToOutputs: "OCR + field extraction + semantic search across document management.",
    humanInTheLoop: "Extracted fields editable before save.",
    fallback: "Manual entry and keyword search.",
    benchmark: "Field extraction >= 95% printed / >= 85% scanned documents.",
    relates: ["EM-08", "FM-01", "FM-05", "AI-S-06"],
  },
  {
    id: "AI-S-04", title: "Investor-dashboard AI", family: "Shared platform AI",
    priority: "Should", phase: 2, blockedBy: [],
    inputsToOutputs: "Sales/occupancy forecasting, lead scoring, ROI projections.",
    humanInTheLoop: "All outputs labelled as ESTIMATES with assumptions shown; not presented as financial advice.",
    fallback: "Implicit per §11.4 — SC-08 renders pipeline/occupancy/returns without projections; core never blocks on AI.",
    benchmark: "Forecast error (MAPE) reviewed quarterly vs actuals.",
    relates: ["SC-08", "SC-11", "AI-S-06"],
  },
  {
    id: "AI-S-05", title: "Recommendation & fraud engine", family: "Shared platform AI",
    priority: "Could", phase: 3, blockedBy: ["Q3"],
    inputsToOutputs: "Shared personalisation and anomaly service behind AI-E-05 AND bookings (EM-05).",
    humanInTheLoop: "As AI-E-05 — human review queue, never auto-block.",
    fallback: "As AI-E-05 — manual listings, no recommendations.",
    benchmark: "As AI-E-05 — fraud-flag precision >= 60% at review (pilot).",
    relates: ["AI-E-05", "EM-09", "EM-05", "SC-04"],
  },
  {
    id: "AI-S-06", title: "AI architecture & guardrails", family: "Shared platform AI",
    priority: "Must", phase: 1, blockedBy: ["Q2", "Q7", "Q12"],
    inputsToOutputs: "LLM + RAG vector store, prompt/cost controls, logging — the platform every AI feature runs on.",
    humanInTheLoop: "See §11.4 — release-blocking requirements (AI_GUARDRAILS below).",
    fallback: "N/A — AI-S-06 IS the degradation machinery for every other AI feature.",
    benchmark: "Zero cross-tenant retrieval in isolation tests.",
    benchmarkIsHardRequirement: true,
    relates: ["SC-06", "SC-07", "SC-10", "SC-01"],
  },
];

/** §11.4 — AI guardrails & design requirements. ALL RELEASE-BLOCKING. Owned by AI-S-06. */
export const AI_GUARDRAILS = [
  {
    key: "tenantIsolation",
    rule: "Retrieval, embeddings and context are hard-scoped to the tenant; automated cross-tenant leakage tests run in CI.",
  },
  {
    key: "providerAbstraction",
    rule: "LLM/OCR/translation behind an abstraction with health checks; on provider failure features degrade to their listed fallback — core flows never block on AI.",
  },
  {
    key: "costControls",
    rule: "Per-tenant AND per-feature usage caps with alerts and a kill-switch per feature (usage billed to Client per §15). Thresholds pending Q12.",
  },
  {
    key: "promptInjectionDefence",
    rule: "User- and document-supplied content is treated as DATA; the assistant cannot be instructed by it to exceed the user's permissions (§7).",
  },
  {
    key: "loggingAndPrivacy",
    rule: "All AI interactions logged (AI interaction log, §8.1) with PII minimised/redacted in logs.",
  },
  {
    key: "uxStates",
    rule: "Every AI surface shows loading, confidence, sources and error states; every suggestion is review/approve/override — AI is assistive, not autonomous.",
  },
] as const;
