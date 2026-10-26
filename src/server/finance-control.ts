import 'server-only';
import { emptyFinanceControlState, type FinanceControlState } from '@/domain/finance/control';
import { getRecordAuxiliary } from '@/server/data/record-context';

export function financeControl(tenantId: string): FinanceControlState {
  const states = getRecordAuxiliary<Record<string, FinanceControlState>>('finance:control:v1', () => ({}));
  return states[tenantId] ??= emptyFinanceControlState();
}
