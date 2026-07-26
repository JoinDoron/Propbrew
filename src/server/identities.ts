/**
 * Dev identity presets.
 *
 * Eight of nine roles are unreviewable until real auth lands, so this is the
 * highest-leverage scaffold in the plan: it lets the client sign off on the §7
 * surfaces during Phase-1 discovery. Every preset is a full authz `Actor` plus
 * display metadata, keyed to the seed world's stable ids.
 *
 * These are the ONLY place dev identities are defined. `getActor()` maps the
 * dev cookie onto one of these; in production, `getActor()` reads the real
 * session and this file is never imported.
 */

import type { Actor } from '@/lib/authz';
import type { Role } from '@/domain/enums';

/** Stable seed ids, shared with the fixtures so scope filtering lines up. */
export const SEED = {
  tenantA: 't-lekki',
  tenantB: 't-ikoyi',
  // tenant A estates
  estateGardens: 's-gardens', // Lekki Gardens Estate (residential)
  estateVictoria: 's-victoria', // Victoria Court (facility)
  // tenant B estate
  estateIkoyi: 's-ikoyi',
  unitRes: 'u-c12b', // the demo resident's unit
  vendorOrg: 'v-brightworks',
  investorProject: 'p-marina',
} as const;

export type DevIdentity = {
  key: string;
  label: string;
  roleSummary: string;
  tenantLabel: string;
  actor: Actor;
};

const base = {
  tenantId: SEED.tenantA as string | null,
  estateIds: [] as readonly string[],
  allEstates: false,
  unitIds: [] as readonly string[],
  vendorOrgId: null as string | null,
  investorProjectIds: [] as readonly string[],
};

function id(
  key: string,
  label: string,
  roles: readonly Role[],
  roleSummary: string,
  tenantLabel: string,
  over: Partial<Actor>,
): DevIdentity {
  return {
    key,
    label,
    roleSummary,
    tenantLabel,
    actor: { ...base, userId: `user-${key}`, roles, ...over },
  };
}

export const DEV_IDENTITIES: readonly DevIdentity[] = [
  id('platform_admin', 'Amara — Platform Admin', ['platform_admin'], 'Platform Admin', '7 Fifteen HQ (all tenants)', {
    tenantId: null,
    allEstates: true,
  }),
  id('executive', 'Chidi — Owner / Executive', ['executive'], 'Executive', 'Lekki (portfolio-wide)', {
    allEstates: true,
  }),
  id('estate_manager', 'Ngozi — Estate Manager', ['estate_manager'], 'Estate Manager', 'Lekki · Gardens Estate', {
    estateIds: [SEED.estateGardens],
  }),
  id('facility_manager', 'Bola — Facility Manager', ['facility_manager'], 'Facility Manager', 'Lekki · Gardens + Victoria', {
    estateIds: [SEED.estateGardens, SEED.estateVictoria],
  }),
  id('technician', 'Emeka — Technician', ['technician'], 'Technician', 'Lekki · Gardens Estate', {
    estateIds: [SEED.estateGardens],
  }),
  id('resident', 'Folake — Resident', ['resident'], 'Resident', 'Lekki · Unit C-12B', {
    allEstates: true,
    unitIds: [SEED.unitRes],
  }),
  id('security', 'Musa — Security', ['security'], 'Security', 'Lekki · Gardens Estate', {
    estateIds: [SEED.estateGardens],
  }),
  id('vendor', 'Brightworks — Vendor', ['vendor'], 'Vendor', 'Lekki (approved vendor)', {
    allEstates: true,
    vendorOrgId: SEED.vendorOrg,
  }),
  id('investor', 'Tunde — Investor', ['investor'], 'Investor', 'Lekki · Marina Heights (off-plan)', {
    allEstates: true,
    investorProjectIds: [SEED.investorProject],
  }),
  // Multi-role combinations that genuinely occur — exercise union semantics.
  id(
    'estm_resident',
    'Ada — Estate Manager & Resident',
    ['estate_manager', 'resident'],
    'Estate Manager + Resident',
    'Lekki · Gardens (manages & lives there)',
    { estateIds: [SEED.estateGardens], unitIds: [SEED.unitRes] },
  ),
  id('exec_investor', 'Kola — Executive & Investor', ['executive', 'investor'], 'Executive + Investor', 'Lekki (portfolio + off-plan)', {
    allEstates: true,
    investorProjectIds: [SEED.investorProject],
  }),
];

export const DEFAULT_IDENTITY_KEY = 'estate_manager';

export function identityByKey(key: string | undefined): DevIdentity {
  return DEV_IDENTITIES.find((i) => i.key === key) ?? DEV_IDENTITIES.find((i) => i.key === DEFAULT_IDENTITY_KEY)!;
}
