/**
 * Authorization — PRD §7 matrix + deny-by-default decision engine (SC-01),
 * with hard tenant isolation (§8.2).
 *
 * IMPORTANT: this is the CLIENT-side gate. SC-01 says access is "enforced by the
 * server, not the UI" — the API must repeat every check independently. A pretty
 * ScopeFilter here is a convenience and an audit aid, never the boundary.
 */

export {
  MATRIX,
  CAPABILITIES,
  CAPABILITY_LABELS,
  ROLES,
  ROLE_LABELS,
  levelFor,
  isRole,
  isCapability,
  type Capability,
  type Level,
  type Role,
} from './matrix';

export {
  ACTIONS,
  actionsFor,
  ownershipKeysFor,
  ESTATE_SCOPED_ROLES,
  type Action,
  type OwnershipKey,
} from './policy';

export {
  can,
  assertCan,
  effectiveLevel,
  assertSameTenant,
  ForbiddenError,
  type Actor,
  type Decision,
  type DenyReason,
  type OwnershipClause,
  type ScopeFilter,
} from './can';

export { toWhere, applyScope, matchesScope, type ScopableRow } from './scope';
