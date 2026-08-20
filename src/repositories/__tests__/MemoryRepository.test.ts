export {};

const mockFind = jest.fn();
const mockFetch = jest.fn();
const mockCreate = jest.fn();
const mockWrite = jest.fn();
const mockQuery = jest.fn(() => ({fetch: mockFetch}));

jest.mock('../../database', () => ({
  database: {
    write: (callback: () => Promise<any>) => mockWrite(callback),
    collections: {
      get: () => ({
        find: (id: string) => mockFind(id),
        query: (..._clauses: any[]) => mockQuery(),
        create: (creator: (record: any) => void) => mockCreate(creator),
      }),
    },
  },
}));

jest.unmock('../MemoryRepository');

const {memoryRepository} = jest.requireActual('../MemoryRepository');

function makeRecord(raw: Record<string, any> = {}) {
  const record: Record<string, any> = {
    id: 'memory-1',
    palId: 'sammy',
    kind: 'experience',
    status: 'active',
    content: 'Harry ist Papa Bär bekannt.',
    keywords: '[]',
    links: '[]',
    evidence: '[]',
    sourceType: 'explicit',
    importance: 3,
    confidence: 0.5,
    repetitionCount: 1,
    useCount: 0,
    lastSeenAt: 100,
    createdAt: 100,
    updatedAt: 100,
    ...raw,
  };
  record.toMemory = () => ({
    id: record.id,
    palId: record.palId,
    kind: record.kind,
    status: record.status,
    content: record.content,
    keywords: JSON.parse(record.keywords),
    links: JSON.parse(record.links),
    evidence: JSON.parse(record.evidence),
    sourceType: record.sourceType,
    importance: record.importance,
    confidence: record.confidence,
    repetitionCount: record.repetitionCount,
    useCount: record.useCount,
    lastSeenAt: record.lastSeenAt,
    lastUsedAt: record.lastUsedAt,
    supersedesId: record.supersedesId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
  record.update = async (mutator: (target: any) => void) => {
    mutator(record);
    return record;
  };
  return record;
}

describe('MemoryRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWrite.mockImplementation(async (callback: () => Promise<any>) =>
      callback(),
    );
  });

  it('creates an explicit memory as active with bounded scores', async () => {
    const record = makeRecord();
    mockCreate.mockImplementation(async creator => {
      creator(record);
      return record;
    });

    const created = await memoryRepository.createMemory({
      palId: ' sammy ',
      kind: 'experience',
      content: '  Harry ist Papa Bär bekannt.  ',
      sourceType: 'explicit',
      importance: 99,
      confidence: -1,
      keywords: ['harry'],
    });

    expect(created.palId).toBe('sammy');
    expect(created.content).toBe('Harry ist Papa Bär bekannt.');
    expect(created.status).toBe('active');
    expect(created.importance).toBe(5);
    expect(created.confidence).toBe(0);
    expect(created.keywords).toEqual(['harry']);
  });

  it('rejects empty memory content before touching the database', async () => {
    await expect(
      memoryRepository.createMemory({
        palId: 'sammy',
        kind: 'knowledge',
        content: '   ',
        sourceType: 'explicit',
      }),
    ).rejects.toThrow('must not be empty');

    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('sorts active memories by importance and then recency', async () => {
    mockFetch.mockResolvedValue([
      makeRecord({id: 'low', importance: 2, lastSeenAt: 300}),
      makeRecord({id: 'older-high', importance: 4, lastSeenAt: 100}),
      makeRecord({id: 'newer-high', importance: 4, lastSeenAt: 200}),
    ]);

    const memories = await memoryRepository.getMemoriesForPal('sammy');

    expect(memories.map((memory: any) => memory.id)).toEqual([
      'newer-high',
      'older-high',
      'low',
    ]);
  });

  it('marks a memory as used without changing its content', async () => {
    const record = makeRecord({useCount: 2});
    mockFind.mockResolvedValue(record);

    const updated = await memoryRepository.markMemoryUsed('memory-1', 500);

    expect(updated.useCount).toBe(3);
    expect(updated.lastUsedAt).toBe(500);
    expect(updated.content).toBe('Harry ist Papa Bär bekannt.');
  });

  it('does not lose overlapping use-count increments', async () => {
    const record = makeRecord({useCount: 2});
    mockFind.mockResolvedValue(record);

    await Promise.all([
      memoryRepository.markMemoryUsed('memory-1', 500),
      memoryRepository.markMemoryUsed('memory-1', 600),
    ]);

    expect(record.useCount).toBe(4);
    expect(record.lastUsedAt).toBe(600);
  });
});
