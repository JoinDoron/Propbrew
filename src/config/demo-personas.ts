import type { Role } from '@/domain/enums';
import type { WorkspaceId } from './workspaces';

export const DEMO_PERSONA_COOKIE = 'propbrew_demo_persona';

type DemoModuleAccess = 'manage' | 'view';

export type DemoPersona = {
  id: string;
  label: string;
  description: string;
  home: string;
  roles: readonly Role[];
  modules: Readonly<Partial<Record<WorkspaceId, DemoModuleAccess>>>;
};

const ALL_MANAGE = Object.freeze({ estate: 'manage', facility: 'manage', shortlet: 'manage', construction: 'manage' } as const);
const ALL_VIEW = Object.freeze({ estate: 'view', facility: 'view', shortlet: 'view', construction: 'view' } as const);

/**
 * Review personas are authorization projections inside a private demo sandbox.
 * They never create accounts, change a real membership or cross tenant scope.
 */
export const DEMO_PERSONAS = Object.freeze([
  Object.freeze({
    id: 'company-owner', label: 'Company owner', description: 'Full sandbox access across all four modules', home: '/workspaces',
    roles: Object.freeze(['estate_manager', 'facility_manager', 'technician', 'security'] as const), modules: ALL_MANAGE,
  }),
  Object.freeze({
    id: 'executive', label: 'Executive viewer', description: 'Portfolio visibility without operational changes', home: '/workspaces',
    roles: Object.freeze(['executive'] as const), modules: ALL_VIEW,
  }),
  Object.freeze({
    id: 'estate-manager', label: 'Estate manager', description: 'Residents, collections and estate operations', home: '/estate',
    roles: Object.freeze(['estate_manager'] as const), modules: Object.freeze({ estate: 'manage' } as const),
  }),
  Object.freeze({
    id: 'facility-manager', label: 'Facility manager', description: 'Assets, maintenance and building operations', home: '/facility',
    roles: Object.freeze(['facility_manager'] as const), modules: Object.freeze({ facility: 'manage' } as const),
  }),
  Object.freeze({
    id: 'technician', label: 'Field technician', description: 'Assigned maintenance work and field execution', home: '/facility',
    roles: Object.freeze(['technician'] as const), modules: Object.freeze({ facility: 'manage' } as const),
  }),
  Object.freeze({
    id: 'security', label: 'Security officer', description: 'Estate access, incidents and SOS response', home: '/estate',
    roles: Object.freeze(['security'] as const), modules: Object.freeze({ estate: 'manage' } as const),
  }),
  Object.freeze({
    id: 'shortlet-manager', label: 'Shortlet manager', description: 'Properties, bookings and guest operations', home: '/shortlet',
    roles: Object.freeze(['estate_manager'] as const), modules: Object.freeze({ shortlet: 'manage' } as const),
  }),
  Object.freeze({
    id: 'construction-manager', label: 'Construction manager', description: 'Projects, controls and site delivery', home: '/construction',
    roles: Object.freeze(['estate_manager'] as const), modules: Object.freeze({ construction: 'manage' } as const),
  }),
] satisfies readonly DemoPersona[]);

export type DemoPersonaId = (typeof DEMO_PERSONAS)[number]['id'];
export const DEFAULT_DEMO_PERSONA_ID: DemoPersonaId = 'company-owner';

export function demoPersonaById(value: unknown): DemoPersona {
  return DEMO_PERSONAS.find((persona) => persona.id === value)
    ?? DEMO_PERSONAS.find((persona) => persona.id === DEFAULT_DEMO_PERSONA_ID)!;
}
