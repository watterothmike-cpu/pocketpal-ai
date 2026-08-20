export const MEMORY_KINDS = [
  'identity',
  'person',
  'experience',
  'knowledge',
  'preference',
  'pattern',
] as const;

export type MemoryKind = (typeof MEMORY_KINDS)[number];

export const MEMORY_STATUSES = [
  'candidate',
  'active',
  'superseded',
  'archived',
] as const;

export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

export const MEMORY_SOURCE_TYPES = [
  'explicit',
  'observed',
  'repeated',
  'manual',
  'imported',
] as const;

export type MemorySourceType = (typeof MEMORY_SOURCE_TYPES)[number];

export interface MemoryLink {
  memoryId: string;
  relation?: string;
  weight?: number;
}

export interface MemoryEvidence {
  sessionId?: string;
  messageId?: string;
  observedAt: number;
}

export interface PalMemoryData {
  id: string;
  palId: string;
  kind: MemoryKind;
  status: MemoryStatus;
  content: string;
  keywords: string[];
  links: MemoryLink[];
  evidence: MemoryEvidence[];
  sourceType: MemorySourceType;
  importance: number;
  confidence: number;
  repetitionCount: number;
  useCount: number;
  lastSeenAt: number;
  lastUsedAt?: number;
  supersedesId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CreatePalMemoryInput {
  palId: string;
  kind: MemoryKind;
  content: string;
  sourceType: MemorySourceType;
  status?: MemoryStatus;
  keywords?: string[];
  links?: MemoryLink[];
  evidence?: MemoryEvidence[];
  importance?: number;
  confidence?: number;
  repetitionCount?: number;
  lastSeenAt?: number;
  supersedesId?: string;
}

export type UpdatePalMemoryInput = Partial<
  Pick<
    PalMemoryData,
    | 'kind'
    | 'status'
    | 'content'
    | 'keywords'
    | 'links'
    | 'evidence'
    | 'sourceType'
    | 'importance'
    | 'confidence'
    | 'repetitionCount'
    | 'useCount'
    | 'lastSeenAt'
    | 'lastUsedAt'
    | 'supersedesId'
  >
>;
