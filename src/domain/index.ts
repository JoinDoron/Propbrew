/**
 * `@vesta/domain` — the framework-free heart of the platform.
 *
 * ZERO react/next imports live under src/domain: this is the package the backend
 * and the React Native app (SC-05) consume verbatim, so the wire format and the
 * UI cannot drift. Import UI/authz concerns from `@/lib`, not from here.
 */

export * from './ids';
export * from './primitives';
export * from './tenancy';
export * from './enums';
export * as Proposed from './enums.proposed';
export * from './workflows';
export {
  REQUIREMENTS,
  AI_REQUIREMENT_IDS,
  TOTAL_REQUIREMENT_COUNT,
  PHASE_WEEKS,
  type Requirement,
  type ModuleKey,
  type Priority,
  type Phase,
  type OpenQuestionId,
} from './requirements';
export { AI_REQUIREMENTS, type AiRequirement } from './ai-requirements';
export { PHASE_MAP, OPEN_QUESTIONS, TIMING_HAZARDS, type OpenQuestion } from './delivery';
