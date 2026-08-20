import {memoryRepository} from '../../repositories/MemoryRepository';
import type MemoryRepository from '../../repositories/MemoryRepository';
import type {MemoryKind, PalMemoryData} from '../../types/memory';
import type {Pal} from '../../types/pal';
import {hasMemoryCapability} from '../../utils/pal-capabilities';
import type {ExplicitMemoryMessage} from './explicitMemoryCapture';
import {
  parseExplicitForgetCommand,
  parseExplicitMemoryCommand,
} from './explicitMemoryCapture';

type ObservedMemoryRepository = Pick<
  MemoryRepository,
  'createMemory' | 'getMemoriesForPal' | 'updateMemory'
>;

export interface ObserveMemoryCandidateInput {
  pal: Pal;
  sessionId: string;
  message: ExplicitMemoryMessage;
}

export type ObservedMemoryResult =
  | {
      captured: false;
      reason: 'capability_disabled' | 'not_stable';
    }
  | {
      captured: true;
      action: 'candidate' | 'promoted' | 'reinforced';
      memory: PalMemoryData;
    };

interface StableObservation {
  content: string;
  kind: MemoryKind;
}

const TRANSIENT_LANGUAGE =
  /\b(?:aktuell|diesmal|gerade|gestern|gleich|heute|im\s+moment|jetzt|morgen|momentan)\b/iu;

const STABLE_PATTERNS: Array<{kind: MemoryKind; pattern: RegExp}> = [
  {
    kind: 'identity',
    pattern: /^(?:ich\s+heiße|mein\s+name\s+ist)\b/iu,
  },
  {
    kind: 'identity',
    pattern: /^(?:ich\s+wohne\s+in|ich\s+arbeite\s+(?:als|bei))\b/iu,
  },
  {
    kind: 'preference',
    pattern:
      /^(?:ich\s+(?:bevorzuge|liebe|mag)|mein(?:e|er|en|em|es)?\s+lieblings[\p{L}\p{N}-]*\s+ist)\b/iu,
  },
  {
    kind: 'person',
    pattern:
      /^mein(?:e|er|en|em|es)?\s+[\p{L}\p{N}-]+(?:\s+[\p{L}\p{N}-]+){0,3}\s+(?:heißt|ist)\b/iu,
  },
];

function normalizeForComparison(content: string): string {
  return content
    .normalize('NFKC')
    .toLocaleLowerCase('de-DE')
    .replace(/\s+/gu, ' ')
    .replace(/[.!?]+$/gu, '')
    .trim();
}

export function extractStableObservation(
  messageText: string,
): StableObservation | null {
  const content = messageText.normalize('NFKC').replace(/\s+/gu, ' ').trim();

  if (
    content.length < 8 ||
    content.length > 240 ||
    content.includes('?') ||
    /[\r\n]/u.test(messageText) ||
    TRANSIENT_LANGUAGE.test(content) ||
    parseExplicitMemoryCommand(content) ||
    parseExplicitForgetCommand(content)
  ) {
    return null;
  }

  const match = STABLE_PATTERNS.find(candidate =>
    candidate.pattern.test(content),
  );
  return match ? {content, kind: match.kind} : null;
}

export async function observeMemoryCandidateFromMessage(
  input: ObserveMemoryCandidateInput,
  repository: ObservedMemoryRepository = memoryRepository,
): Promise<ObservedMemoryResult> {
  if (!hasMemoryCapability(input.pal)) {
    return {captured: false, reason: 'capability_disabled'};
  }

  const observation = extractStableObservation(input.message.text);
  if (!observation) {
    return {captured: false, reason: 'not_stable'};
  }

  const observedAt = input.message.createdAt ?? Date.now();
  const evidence = {
    sessionId: input.sessionId,
    messageId: input.message.id || undefined,
    observedAt,
  };
  const normalizedContent = normalizeForComparison(observation.content);
  const memories = await repository.getMemoriesForPal(input.pal.id, [
    'candidate',
    'active',
  ]);
  const existing = memories.find(
    memory => normalizeForComparison(memory.content) === normalizedContent,
  );

  if (existing) {
    const repetitionCount = existing.repetitionCount + 1;
    const shouldPromote =
      existing.status === 'candidate' && repetitionCount >= 2;
    const preservesTrustedSource =
      existing.sourceType === 'explicit' || existing.sourceType === 'manual';
    const reinforced = await repository.updateMemory(existing.id, {
      status: shouldPromote ? 'active' : existing.status,
      sourceType: preservesTrustedSource
        ? existing.sourceType
        : shouldPromote
          ? 'repeated'
          : existing.sourceType,
      importance: shouldPromote
        ? Math.max(existing.importance, 3)
        : existing.importance,
      confidence: shouldPromote
        ? Math.max(existing.confidence, 0.75)
        : Math.min(
            preservesTrustedSource ? 1 : 0.95,
            existing.confidence + 0.05,
          ),
      repetitionCount,
      lastSeenAt: observedAt,
      evidence: [...existing.evidence, evidence],
    });

    if (reinforced) {
      return {
        captured: true,
        action: shouldPromote ? 'promoted' : 'reinforced',
        memory: reinforced,
      };
    }
  }

  const created = await repository.createMemory({
    palId: input.pal.id,
    kind: observation.kind,
    status: 'candidate',
    content: observation.content,
    sourceType: 'observed',
    importance: 2,
    confidence: 0.4,
    evidence: [evidence],
    lastSeenAt: observedAt,
  });

  return {captured: true, action: 'candidate', memory: created};
}
