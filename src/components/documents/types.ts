import type { EstateTargetOption } from '@/domain/estate/targets';
import type { EstateDocument } from '@/domain/entities';

export type DocView = EstateDocument;

export type DocData = {
  estates?: EstateTargetOption[];
  now: string;
  canMutate: boolean;
  scopeLabel: string;
  documents: DocView[];
};
