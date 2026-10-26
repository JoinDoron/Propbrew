import 'server-only';

import { getRecordAuxiliary } from '@/server/data/record-context';
import { DEFAULT_TEMPLATES } from '@/domain/shortlet/automation';
import { emptyShortletControlState, type ShortletControlState } from '@/domain/shortlet/control';

/** Persisted inside the same locked PostgreSQL workspace document as Shortlet records. */
export function shortletControl(tenantId: string): ShortletControlState {
  const states = getRecordAuxiliary<Record<string, ShortletControlState>>('shortlet:control:v1', () => ({}));
  if (!states[tenantId]) states[tenantId] = emptyShortletControlState();
  const state = states[tenantId];
  if (!state.templates.length) {
    state.templates = DEFAULT_TEMPLATES.map((template) => ({
      tenantId, key: template.key, label: template.label, body: template.body,
      enabled: true, requiresApproval: true, updatedAtISO: new Date(0).toISOString(), updatedBy: 'system',
    }));
  }
  return state;
}
