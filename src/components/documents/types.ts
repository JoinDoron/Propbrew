import type { EstateDocument } from '@/domain/entities';

export type DocView = EstateDocument;

export type DocData = {
  now: string;
  canMutate: boolean;
  scopeLabel: string;
  documents: DocView[];
};
