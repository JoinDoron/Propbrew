// PRD v2.0 §16 delivery plan + §17 open-questions register.
// Suggested location: src/domain/delivery.ts

import type { OpenQuestionId, Phase } from "./requirements";

export const PHASE_MAP: Record<Phase, { label: string; weeks: string; focus: string; requirementIds: string[] }> = {
  1: {
    label: "Foundations & MVP",
    weeks: "1-12 (indicative)",
    focus: "Discovery, brand, UX/UI; shared core; Must-priority features; AI guardrails scaffolding.",
    requirementIds: [
      "SC-01","SC-02","SC-03","SC-05","SC-06","SC-07","SC-09","SC-10",
      "FM-01","FM-02","FM-03","FM-05","FM-07","FM-08",
      "EM-01","EM-02","EM-03","EM-04","EM-06",
      "AI-S-06",
    ], // 20
  },
  2: {
    label: "Committed scope",
    weeks: "10-20 (indicative)",
    focus: "Should-priority features behind flags; AI feature set on the guardrails platform.",
    requirementIds: [
      "FM-04","FM-06",
      "EM-05","EM-07","EM-08","EM-09",
      "SC-04","SC-08","SC-11",
      "AI-F-01","AI-F-02","AI-F-03","AI-F-04","AI-F-05",
      "AI-E-01","AI-E-02","AI-E-03","AI-E-04",
      "AI-S-01","AI-S-02","AI-S-03","AI-S-04",
    ], // 22
  },
  3: {
    label: "Complete & harden",
    weeks: "18-26 (indicative)",
    focus: "Could items; performance/security hardening; UAT; deployment, go-live, integration & handover.",
    requirementIds: [
      "AI-E-05",
      "AI-E-06", // conditional: "if Q5 signed off"
      "AI-S-05",
      // plus: NFR verification, docs & runbooks (no requirement IDs)
    ], // 3
  },
};

export interface OpenQuestion {
  id: OpenQuestionId;
  question: string;
  whyItMatters: string;
  owner: "Client" | "Unrealabs" | "Client + Unrealabs";
  neededBy: string;
  /** Requirements whose build cannot correctly complete until this is answered. */
  blocks: string[];
  /** Requirements whose shape/config changes with the answer. */
  shapes: string[];
}

export const OPEN_QUESTIONS: OpenQuestion[] = [
  { id: "Q1", question: "Who exactly is a 'tenant' — estates operated by 7 Fifteen Capital, or third-party operators too?",
    whyItMatters: "Shapes onboarding, branding and commercial model.", owner: "Client", neededBy: "Kickoff",
    blocks: ["SC-07"], shapes: ["SC-01","SC-06","SC-11"] },
  { id: "Q2", question: "Confirm data-isolation strategy (ADR-01: shared DB + row-level security vs schema-per-tenant).",
    whyItMatters: "Foundational architecture; expensive to change later.", owner: "Unrealabs", neededBy: "Kickoff",
    blocks: ["SC-07","AI-S-06"], shapes: ["SC-01","AI-S-03","EM-08"] },
  { id: "Q3", question: "Marketplace commercial model: commission %, escrow, vendor payout rails and KYC.",
    whyItMatters: "Payouts have regulatory and gateway implications; blocks EM-09 payout build.", owner: "Client", neededBy: "Phase 2 start",
    blocks: ["EM-09","SC-04"], shapes: ["SC-02","AI-E-05","AI-S-05"] },
  { id: "Q4", question: "SOS operating model: who responds, escalation chain, liability and manned hours.",
    whyItMatters: "Safety-critical flow; drives EM-06 SLAs and staffing.", owner: "Client", neededBy: "Phase 1",
    blocks: ["EM-06"], shapes: ["SC-09"] },
  { id: "Q5", question: "Proceed with AI security & access (AI-E-06)? Requires consent framework + DPIA.",
    whyItMatters: "NDPA-contingent; long lead time.", owner: "Client + Unrealabs", neededBy: "Phase 2",
    blocks: ["AI-E-06"], shapes: ["EM-06","SC-10"] },
  { id: "Q6", question: "Language list for localization at launch.",
    whyItMatters: "Sizes translation and QA effort.", owner: "Client", neededBy: "Design phase",
    blocks: ["AI-E-04"], shapes: ["SC-05","SC-06","SC-09","EM-04","SC-07"] },
  { id: "Q7", question: "Hosting provider and data-residency requirement (Nigeria vs regional cloud).",
    whyItMatters: "NDPA posture, latency and cost.", owner: "Client", neededBy: "Kickoff",
    blocks: ["SC-07"], shapes: ["AI-S-06","SC-10","EM-02","EM-08","AI-E-06","AI-S-03"] },
  { id: "Q8", question: "Launch sizing: tenants, units, users, expected concurrency.",
    whyItMatters: "Validates §12 scalability targets and load tests.", owner: "Client", neededBy: "Design phase",
    blocks: [], shapes: ["SC-07"] },
  { id: "Q9", question: "Any legacy data to migrate (spreadsheets, resident lists, asset registers)?",
    whyItMatters: "Migration is unscoped; may need a Change Request.", owner: "Client", neededBy: "Kickoff",
    blocks: [], shapes: ["FM-01","EM-02","SC-07","FM-04"] },
  { id: "Q10", question: "Payment reconciliation source of truth (gateway settlement vs bank statements).",
    whyItMatters: "Defines EM-01 reconciliation rules.", owner: "Client", neededBy: "Phase 1",
    blocks: ["EM-01"], shapes: ["SC-02"] },
  { id: "Q11", question: "iOS distribution: v1.0 lists TestFlight/IPA — is a production App Store release in scope?",
    whyItMatters: "Affects review lead times and release plan.", owner: "Client + Unrealabs", neededBy: "Phase 1",
    blocks: ["SC-05"], shapes: ["FM-08"] },
  { id: "Q12", question: "Per-tenant AI/SMS budget caps and alert thresholds.",
    whyItMatters: "Client pays usage; caps prevent surprises.", owner: "Client", neededBy: "Phase 2",
    blocks: [], shapes: ["AI-S-06","SC-03","SC-07"] },
];

/** Questions whose deadline lands no earlier than the phase of the work they gate. */
export const TIMING_HAZARDS = [
  "Q4 due Phase 1 but EM-06 is a Phase 1 Must (SLA/escalation undefined at build start).",
  "Q10 due Phase 1 but EM-01 is a Phase 1 Must (reconciliation rules undefined at build start).",
  "Q3 due Phase 2 START while EM-09 and SC-04 build during Phase 2.",
  "Q12 due Phase 2 while AI-S-06 (which implements the caps) builds in Phase 1.",
  "Q5 due Phase 2 but AI-E-06 is scheduled in Phase 3 with no defined descope path if declined.",
] as const;
