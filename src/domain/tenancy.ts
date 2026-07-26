/**
 * Cross-cutting record mixins. No framework imports.
 *
 * §8.2: "Every domain record carries its tenant scope." Every persisted entity
 * extends TenantScoped, and hard isolation (no query, file, index, AI retrieval
 * or report crosses tenants below Platform Admin) is enforced against it.
 */

import type {
  BuildingId,
  FloorId,
  SiteId,
  TenantId,
  UnitId,
  UserId,
} from './ids';
import type { ISODateTime } from './primitives';

/** The isolation boundary on every record (§8.2). */
export type TenantScoped = {
  readonly tenantId: TenantId;
};

/**
 * A location within the space hierarchy.
 *
 * PRD inconsistency (recorded, not invented): §8.1's Unit/Space row states the
 * hierarchy as estate→building→floor→unit/zone, while §8.2's bullet omits floor
 * and FM-01's location AC omits it too. Modelled as an OPTIONAL level so both
 * readings are satisfiable.
 */
export type SpaceRef = {
  readonly siteId: SiteId;
  readonly buildingId?: BuildingId;
  readonly floorId?: FloorId;
  readonly unitId?: UnitId;
};

/** Created/updated attribution. §10 & SC-10 require actor-attributed changes. */
export type Auditable = {
  readonly createdAt: ISODateTime;
  readonly createdBy: UserId;
  readonly updatedAt: ISODateTime;
  readonly updatedBy: UserId;
};

/**
 * FM-01: "Archive (no hard delete)." Nothing in the domain is ever destroyed;
 * the Action algebra deliberately contains no `delete` verb. `archivedAt` null
 * means live.
 */
export type Archivable = {
  readonly archivedAt: ISODateTime | null;
  readonly archivedBy: UserId | null;
};

/** The shape every top-level entity shares. */
export type Entity = TenantScoped & Auditable;
