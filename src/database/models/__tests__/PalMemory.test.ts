import PalMemory from '../PalMemory';

function makeMemory(raw: Record<string, any> = {}): PalMemory {
  const now = Date.parse('2026-08-20T12:00:00Z');
  const base: Record<string, any> = {
    id: 'memory-1',
    palId: 'sammy',
    kind: 'experience',
    status: 'active',
    content: 'Papa Bär hat Sammy bereits von Harry erzählt.',
    keywords: '["papa bär","harry"]',
    links: '[{"memoryId":"memory-2","relation":"person"}]',
    evidence:
      '[{"sessionId":"session-1","messageId":"message-1","observedAt":1787227200000}]',
    sourceType: 'explicit',
    importance: 4,
    confidence: 0.95,
    repetitionCount: 2,
    useCount: 1,
    lastSeenAt: now,
    lastUsedAt: now,
    createdAt: now,
    updatedAt: now,
    ...raw,
  };
  const instance = Object.create(PalMemory.prototype);
  for (const [key, value] of Object.entries(base)) {
    Object.defineProperty(instance, key, {
      value,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  }
  return instance as PalMemory;
}

describe('PalMemory', () => {
  it('round-trips JSON fields into a typed memory object', () => {
    const memory = makeMemory().toMemory();

    expect(memory.palId).toBe('sammy');
    expect(memory.keywords).toEqual(['papa bär', 'harry']);
    expect(memory.links).toEqual([{memoryId: 'memory-2', relation: 'person'}]);
    expect(memory.evidence).toEqual([
      {
        sessionId: 'session-1',
        messageId: 'message-1',
        observedAt: 1787227200000,
      },
    ]);
  });

  it('treats malformed or non-array JSON as an empty array', () => {
    const memory = makeMemory({
      keywords: '{bad',
      links: '{}',
      evidence: 'null',
    });

    expect(memory.keywordsArray).toEqual([]);
    expect(memory.linksArray).toEqual([]);
    expect(memory.evidenceArray).toEqual([]);
  });

  it('falls back to an empty array when serialization fails', () => {
    const circular: any[] = [];
    circular.push(circular);

    expect(PalMemory.stringifyArray(circular)).toBe('[]');
  });
});
