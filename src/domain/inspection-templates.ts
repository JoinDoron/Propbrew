/**
 * Inspection template registry (FM-06: "inspection templates with checklist
 * items"). A new scheduled inspection is created from one of these — the
 * checklist items are cloned with a null result, ready to run. Pure/framework-free.
 */

import type { InspectionItem } from './entities';

export type InspectionTemplateKey = 'fire' | 'lift' | 'water' | 'generator' | 'electrical' | 'document' | 'general';

type TemplateItem = Omit<InspectionItem, 'result'>;
export type InspectionTemplate = { key: InspectionTemplateKey; name: string; items: readonly TemplateItem[] };

export const INSPECTION_TEMPLATES: Record<InspectionTemplateKey, InspectionTemplate> = {
  fire: {
    key: 'fire',
    name: 'Fire safety certification',
    items: [
      { id: 'f1', label: 'Extinguishers charged & in date', severity: 'critical', requiresPhoto: true },
      { id: 'f2', label: 'Smoke & heat alarms functional', severity: 'critical', requiresPhoto: false },
      { id: 'f3', label: 'Escape routes clear & signed', severity: 'major', requiresPhoto: true },
      { id: 'f4', label: 'Emergency lighting works', severity: 'major', requiresPhoto: false },
      { id: 'f5', label: 'Fire-drill log up to date', severity: 'minor', requiresPhoto: false },
    ],
  },
  lift: {
    key: 'lift',
    name: 'Lift statutory inspection',
    items: [
      { id: 'l1', label: 'Safety-gear (overspeed) test', severity: 'critical', requiresPhoto: true },
      { id: 'l2', label: 'Ropes & sheaves within wear limit', severity: 'critical', requiresPhoto: true },
      { id: 'l3', label: 'Door interlocks engage', severity: 'major', requiresPhoto: false },
      { id: 'l4', label: 'Emergency alarm & intercom', severity: 'major', requiresPhoto: false },
      { id: 'l5', label: 'Car levelling accuracy', severity: 'minor', requiresPhoto: false },
    ],
  },
  water: {
    key: 'water',
    name: 'Water tank hygiene',
    items: [
      { id: 'w1', label: 'Tank cleaned & sealed', severity: 'major', requiresPhoto: true },
      { id: 'w2', label: 'Chlorination within range', severity: 'critical', requiresPhoto: false },
      { id: 'w3', label: 'Water sample bacteriology pass', severity: 'critical', requiresPhoto: false },
    ],
  },
  generator: {
    key: 'generator',
    name: 'Generator emissions & load test',
    items: [
      { id: 'g1', label: 'Emissions within NESREA limit', severity: 'major', requiresPhoto: false },
      { id: 'g2', label: 'Full-load test 30 min', severity: 'major', requiresPhoto: false },
      { id: 'g3', label: 'Fuel & exhaust integrity', severity: 'minor', requiresPhoto: true },
    ],
  },
  electrical: {
    key: 'electrical',
    name: 'Fixed electrical installation',
    items: [
      { id: 'e1', label: 'Earthing & bonding continuity', severity: 'critical', requiresPhoto: false },
      { id: 'e2', label: 'RCD/ELCB trip test', severity: 'critical', requiresPhoto: false },
      { id: 'e3', label: 'Distribution board thermography', severity: 'major', requiresPhoto: true },
    ],
  },
  document: {
    key: 'document',
    name: 'Certificate renewal check',
    items: [
      { id: 'd1', label: 'Current certificate on file & valid', severity: 'major', requiresPhoto: true },
      { id: 'd2', label: 'Coverage matches requirement', severity: 'minor', requiresPhoto: false },
    ],
  },
  general: {
    key: 'general',
    name: 'General compliance check',
    items: [
      { id: 'x1', label: 'Obligation requirements met', severity: 'major', requiresPhoto: true },
      { id: 'x2', label: 'Evidence recorded', severity: 'minor', requiresPhoto: false },
    ],
  },
};

/** A fresh checklist (null results) for a scheduled inspection. */
export function templateChecklist(key: InspectionTemplateKey): InspectionItem[] {
  return (INSPECTION_TEMPLATES[key] ?? INSPECTION_TEMPLATES.general).items.map((i) => ({ ...i, result: null }));
}
