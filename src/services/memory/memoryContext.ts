import {memoryRepository} from '../../repositories/MemoryRepository';
import type MemoryRepository from '../../repositories/MemoryRepository';
import type {PalMemoryData} from '../../types/memory';
import type {Pal} from '../../types/pal';
import {hasMemoryCapability} from '../../utils/pal-capabilities';
import {
  canonicalizeMemoryContent,
  hasCanonicalMemoryWordOrder,
} from './memoryNormalization';

type MemoryContextRepository = Pick<
  MemoryRepository,
  'getMemoriesForPal' | 'markMemoryUsed'
>;

export type MemoryTokenCounter = (text: string) => Promise<number>;

export interface BuildMemoryContextInput {
  pal: Pal;
  query: string;
  contextWindowTokens?: number;
  tokenBudget?: number;
  countTokens?: MemoryTokenCounter;
  now?: number;
}

export interface MemoryContextResult {
  text: string;
  memoryIds: string[];
  memoryContents: string[];
  tokenCount: number;
  tokenBudget: number;
  matchedMemoryCount: number;
  skippedForBudgetCount: number;
}

const MEMORY_HEADER = [
  'ABGERUFENE BENUTZER-FAKTEN:',
  'In Zitaten ich/mein/mir = aktueller Benutzer (in deiner Antwort: du/dein/dir).',
  'Pal ist nicht der Benutzer.',
  'Fakten direkt anwenden. Nicht behaupten, die Information fehle.',
].join('\n');

const CORE_KINDS = new Set<PalMemoryData['kind']>([
  'identity',
  'person',
  'preference',
]);

const STOP_WORDS = new Set([
  'aber',
  'als',
  'auch',
  'auf',
  'aus',
  'bei',
  'bin',
  'bis',
  'das',
  'dass',
  'der',
  'die',
  'ein',
  'eine',
  'einer',
  'eines',
  'er',
  'es',
  'für',
  'hat',
  'ich',
  'im',
  'in',
  'ist',
  'mal',
  'mein',
  'meine',
  'mit',
  'nicht',
  'noch',
  'oder',
  'sich',
  'sie',
  'sind',
  'und',
  'vom',
  'von',
  'war',
  'was',
  'wer',
  'wie',
  'wir',
  'wo',
  'zu',
  'zum',
  'zur',
  'the',
  'and',
  'are',
  'for',
  'from',
  'what',
  'who',
  'with',
]);

const emptyResult = (
  tokenBudget: number,
  matchedMemoryCount = 0,
  skippedForBudgetCount = 0,
): MemoryContextResult => ({
  text: '',
  memoryIds: [],
  memoryContents: [],
  tokenCount: 0,
  tokenBudget,
  matchedMemoryCount,
  skippedForBudgetCount,
});

export function deriveMemoryTokenBudget(contextWindowTokens = 2048): number {
  const safeContextWindow = Math.max(512, contextWindowTokens);
  return Math.max(96, Math.min(384, Math.floor(safeContextWindow * 0.08)));
}

function terms(value: string): Set<string> {
  const normalized = value.normalize('NFKC').toLocaleLowerCase('de-DE');
  const matches = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(
    matches.filter(term => term.length >= 2 && !STOP_WORDS.has(term)),
  );
}

function normalize(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('de-DE')
    .replace(/\s+/gu, ' ')
    .trim();
}

function rankMemory(
  memory: PalMemoryData,
  query: string,
  queryTerms: Set<string>,
  now: number,
): {eligible: boolean; score: number} {
  const memoryTerms = terms(`${memory.content} ${memory.keywords.join(' ')}`);
  const overlapCount = [...queryTerms].filter(term =>
    memoryTerms.has(term),
  ).length;
  const overlapRatio = queryTerms.size > 0 ? overlapCount / queryTerms.size : 0;
  const normalizedQuery = normalize(query);
  const normalizedContent = normalize(memory.content);
  const phraseMatch =
    normalizedQuery.length >= 4 &&
    normalizedContent.length >= 4 &&
    (normalizedQuery.includes(normalizedContent) ||
      normalizedContent.includes(normalizedQuery));
  const isCore = CORE_KINDS.has(memory.kind) && memory.importance >= 4;

  if (!isCore && overlapCount === 0 && !phraseMatch) {
    return {eligible: false, score: 0};
  }

  const ageDays = Math.max(0, now - memory.lastSeenAt) / 86_400_000;
  const recency = 1 / (1 + ageDays / 30);
  const repetition = Math.min(3, Math.log2(memory.repetitionCount + 1));
  const priorUse = Math.min(3, Math.log2(memory.useCount + 1));
  const score =
    overlapCount * 3 +
    overlapRatio * 4 +
    (phraseMatch ? 4 : 0) +
    (isCore ? 1.5 : 0) +
    memory.importance * 0.35 +
    repetition * 0.4 +
    priorUse * 0.15 +
    recency * 0.5;

  return {eligible: true, score};
}

function sanitizeMemoryContent(content: string): string {
  return content
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 480);
}

async function fallbackTokenCount(text: string): Promise<number> {
  // German text and punctuation often average fewer than four characters per
  // token. Three is deliberately conservative when no local tokenizer exists.
  return Math.ceil(text.length / 3);
}

export async function buildMemoryContext(
  input: BuildMemoryContextInput,
  repository: MemoryContextRepository = memoryRepository,
): Promise<MemoryContextResult> {
  const tokenBudget =
    input.tokenBudget ?? deriveMemoryTokenBudget(input.contextWindowTokens);
  if (!hasMemoryCapability(input.pal) || tokenBudget <= 0) {
    return emptyResult(Math.max(0, tokenBudget));
  }

  const memories = await repository.getMemoriesForPal(input.pal.id, ['active']);
  if (memories.length === 0) {
    return emptyResult(tokenBudget);
  }

  const now = input.now ?? Date.now();
  const queryTerms = terms(input.query);
  const rankedMatches = memories
    .map(memory => ({
      memory,
      ...rankMemory(memory, input.query, queryTerms, now),
    }))
    .filter(item => item.eligible)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.memory.importance - a.memory.importance ||
        b.memory.lastSeenAt - a.memory.lastSeenAt,
    )
    .slice(0, 12);

  if (rankedMatches.length === 0) {
    return emptyResult(tokenBudget);
  }

  const deduplicated = new Map<string, (typeof rankedMatches)[number]>();
  for (const item of rankedMatches) {
    const {memory} = item;
    const canonicalContent = canonicalizeMemoryContent(memory.content);
    if (!canonicalContent) {
      continue;
    }
    const existing = deduplicated.get(canonicalContent);
    if (
      !existing ||
      (!hasCanonicalMemoryWordOrder(existing.memory.content) &&
        hasCanonicalMemoryWordOrder(memory.content))
    ) {
      deduplicated.set(canonicalContent, item);
    }
  }
  const ranked = [...deduplicated.values()];

  const countTokens = input.countTokens ?? fallbackTokenCount;
  const lines: string[] = [];
  const memoryIds: string[] = [];
  const memoryContents: string[] = [];
  let tokenCount = 0;
  let skippedForBudgetCount = 0;

  for (const {memory} of ranked) {
    const content = sanitizeMemoryContent(memory.content);
    if (!content) {
      continue;
    }
    const candidateLines = [...lines, `- „${content}“`];
    const candidateText = `${MEMORY_HEADER}\n${candidateLines.join('\n')}`;
    const candidateTokens = await countTokens(candidateText);
    if (candidateTokens > tokenBudget) {
      skippedForBudgetCount += 1;
      continue;
    }

    lines.push(candidateLines[candidateLines.length - 1]);
    memoryIds.push(memory.id);
    memoryContents.push(content);
    tokenCount = candidateTokens;
    if (memoryIds.length >= 8) {
      break;
    }
  }

  if (lines.length === 0) {
    return emptyResult(
      tokenBudget,
      rankedMatches.length,
      skippedForBudgetCount,
    );
  }

  return {
    text: `${MEMORY_HEADER}\n${lines.join('\n')}`,
    memoryIds,
    memoryContents,
    tokenCount,
    tokenBudget,
    matchedMemoryCount: rankedMatches.length,
    skippedForBudgetCount,
  };
}

export async function markMemoryContextUsed(
  memoryIds: string[],
  usedAt: number = Date.now(),
  repository: MemoryContextRepository = memoryRepository,
): Promise<void> {
  // Keep the writes sequential. WatermelonDB serializes writers and each
  // increment must observe the count written by the previous retrieval.
  for (const memoryId of [...new Set(memoryIds)]) {
    await repository.markMemoryUsed(memoryId, usedAt);
  }
}
