import {memoryRepository} from '../../repositories/MemoryRepository';
import type MemoryRepository from '../../repositories/MemoryRepository';
import type {Pal} from '../../types/pal';
import type {PalMemoryData} from '../../types/memory';
import {hasMemoryCapability} from '../../utils/pal-capabilities';

type MemoryCaptureRepository = Pick<
  MemoryRepository,
  'createMemory' | 'getMemoriesForPal' | 'updateMemory'
>;

export interface ExplicitMemoryMessage {
  id?: string;
  text: string;
  createdAt?: number;
}

export interface ExplicitMemoryCaptureInput {
  pal: Pal;
  sessionId: string;
  message: ExplicitMemoryMessage;
}

export type ExplicitMemoryCaptureResult =
  | {
      captured: false;
      reason: 'capability_disabled' | 'not_explicit';
    }
  | {
      captured: true;
      action: 'created' | 'reinforced';
      memory: PalMemoryData;
    };

const EXPLICIT_MEMORY_PREFIX = /^\s*(?:bitte\s+)?merk(?:e)?\s+dir\b/iu;
const COMMAND_FILLER = /^\s*(?:(?:bitte|mal)\b\s*)?(?:[:,\-–—]\s*)?/iu;

export function parseExplicitMemoryCommand(text: string): string | null {
  const prefix = EXPLICIT_MEMORY_PREFIX.exec(text);
  if (!prefix) {
    return null;
  }

  const content = text
    .slice(prefix[0].length)
    .replace(COMMAND_FILLER, '')
    .trim();
  return content || null;
}

function normalizeForComparison(content: string): string {
  return content
    .normalize('NFKC')
    .toLocaleLowerCase('de-DE')
    .replace(/\s+/gu, ' ')
    .replace(/[.!?]+$/gu, '')
    .trim();
}

export async function captureExplicitMemoryFromMessage(
  input: ExplicitMemoryCaptureInput,
  repository: MemoryCaptureRepository = memoryRepository,
): Promise<ExplicitMemoryCaptureResult> {
  if (!hasMemoryCapability(input.pal)) {
    return {captured: false, reason: 'capability_disabled'};
  }

  const content = parseExplicitMemoryCommand(input.message.text);
  if (!content) {
    return {captured: false, reason: 'not_explicit'};
  }

  const observedAt = input.message.createdAt ?? Date.now();
  const evidence = {
    sessionId: input.sessionId,
    messageId: input.message.id || undefined,
    observedAt,
  };
  const normalizedContent = normalizeForComparison(content);
  const memories = await repository.getMemoriesForPal(input.pal.id, [
    'candidate',
    'active',
  ]);
  const existing = memories.find(
    memory => normalizeForComparison(memory.content) === normalizedContent,
  );

  if (existing) {
    const reinforced = await repository.updateMemory(existing.id, {
      status: 'active',
      sourceType: 'explicit',
      importance: Math.max(existing.importance, 4),
      confidence: Math.max(existing.confidence, 1),
      repetitionCount: existing.repetitionCount + 1,
      lastSeenAt: observedAt,
      evidence: [...existing.evidence, evidence],
    });

    if (reinforced) {
      return {captured: true, action: 'reinforced', memory: reinforced};
    }
  }

  const created = await repository.createMemory({
    palId: input.pal.id,
    kind: 'knowledge',
    status: 'active',
    content,
    sourceType: 'explicit',
    importance: 4,
    confidence: 1,
    evidence: [evidence],
  });

  return {captured: true, action: 'created', memory: created};
}
