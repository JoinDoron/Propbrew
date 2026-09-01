import 'server-only';

/**
 * The single clock for runtime writes.
 *
 * The DOMAIN layer is deliberately pinned to `NOW` (src/domain/ppm.ts) so every
 * score, SLA band and forecast is deterministic and unit-testable. The AUDIT
 * TRAIL is a different thing: it records when something actually happened.
 *
 * Mixing the two corrupted history. Nine `recordHistory` call sites stamped the
 * pinned date while six stamped the real one, and `getAllHistory()` sorts on
 * that field — so a record created today could sort five weeks behind its own
 * first transition. Every action-layer write now goes through this one function.
 */
export function nowISO(): string {
  return new Date().toISOString();
}
