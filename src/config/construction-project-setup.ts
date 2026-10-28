export const CONSTRUCTION_PROJECT_SETUP_SECTIONS = [
  { id: 'programme', label: 'WBS & programme', icon: 'clipboard' },
  { id: 'baselines', label: 'Calendar & baselines', icon: 'calendar' },
  { id: 'packages', label: 'Packages & BOQ', icon: 'banknote' },
  { id: 'team', label: 'Team & RACI', icon: 'users' },
  { id: 'locations', label: 'Locations', icon: 'building' },
  { id: 'parties', label: 'Parties & permits', icon: 'shield' },
  { id: 'lifecycle', label: 'Lifecycle controls', icon: 'checks' },
] as const;

export type ConstructionProjectSetupSection = typeof CONSTRUCTION_PROJECT_SETUP_SECTIONS[number]['id'];

export function isConstructionProjectSetupSection(value: string | undefined): value is ConstructionProjectSetupSection {
  return CONSTRUCTION_PROJECT_SETUP_SECTIONS.some((section) => section.id === value);
}
