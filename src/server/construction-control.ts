import 'server-only';

import { emptyConstructionControlState, type ConstructionControlState } from '@/domain/construction/control';
import { getRecordAuxiliary } from '@/server/data/record-context';

/** Commercial and field-control sidecars persisted in the locked company workspace document. */
export function constructionControl(tenantId: string): ConstructionControlState {
  const states = getRecordAuxiliary<Record<string, ConstructionControlState>>('construction:control:v1', () => ({}));
  return states[tenantId] ??= emptyConstructionControlState();
}
