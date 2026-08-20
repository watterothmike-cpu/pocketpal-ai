import type {PalMemoryData} from '../../../types/memory';
import type {Pal} from '../../../types/pal';
import {
  extractStableObservation,
  observeMemoryCandidateFromMessage,
} from '../observedMemory';

const sammy = {
  id: 'sammy',
  capabilities: {memory: true},
} as Pal;

function makeMemory(raw: Partial<PalMemoryData> = {}): PalMemoryData {
  return {
    id: 'memory-1',
    palId: 'sammy',
    kind: 'preference',
    status: 'candidate',
    content: 'Ich mag starken Kaffee.',
    keywords: [],
    links: [],
    evidence: [],
    sourceType: 'observed',
    importance: 2,
    confidence: 0.4,
    repetitionCount: 1,
    useCount: 0,
    lastSeenAt: 100,
    createdAt: 100,
    updatedAt: 100,
    ...raw,
  };
}

function makeRepository(memories: PalMemoryData[] = []) {
  return {
    getMemoriesForPal: jest.fn().mockResolvedValue(memories),
    createMemory: jest
      .fn()
      .mockImplementation(async input => makeMemory({...input, id: 'created'})),
    updateMemory: jest
      .fn()
      .mockImplementation(async (id, update) =>
        makeMemory({id, ...update, updatedAt: 600}),
      ),
  };
}

describe('extractStableObservation', () => {
  it.each([
    ['Ich heiße Mike.', 'identity'],
    ['Ich wohne in Berlin.', 'identity'],
    ['Ich mag starken Kaffee.', 'preference'],
    ['Mein Hund heißt Milow.', 'person'],
  ])('recognizes conservative stable statements', (text, kind) => {
    expect(extractStableObservation(text)).toEqual({content: text, kind});
  });

  it.each([
    'Heute mag ich Kaffee.',
    'Ich mag gerade keinen Kaffee.',
    'Mag ich Kaffee?',
    'Das war ein langer Tag.',
    'Merk dir: Ich mag Kaffee.',
    'Vergiss: Ich mag Kaffee.',
  ])('rejects transient, uncertain, or explicit-command text', text => {
    expect(extractStableObservation(text)).toBeNull();
  });
});

describe('observeMemoryCandidateFromMessage', () => {
  const input = {
    pal: sammy,
    sessionId: 'session-1',
    message: {
      id: 'message-1',
      text: 'Ich mag starken Kaffee.',
      createdAt: 500,
    },
  };

  it('does nothing when persistent memory is disabled', async () => {
    const repository = makeRepository();

    const result = await observeMemoryCandidateFromMessage(
      {...input, pal: {...sammy, capabilities: {memory: false}}},
      repository,
    );

    expect(result).toEqual({
      captured: false,
      reason: 'capability_disabled',
    });
    expect(repository.getMemoriesForPal).not.toHaveBeenCalled();
  });

  it('stores a first stable observation only as a candidate', async () => {
    const repository = makeRepository();

    const result = await observeMemoryCandidateFromMessage(input, repository);

    expect(result).toEqual(
      expect.objectContaining({captured: true, action: 'candidate'}),
    );
    expect(repository.createMemory).toHaveBeenCalledWith({
      palId: 'sammy',
      kind: 'preference',
      status: 'candidate',
      content: 'Ich mag starken Kaffee.',
      sourceType: 'observed',
      importance: 2,
      confidence: 0.4,
      evidence: [
        {
          sessionId: 'session-1',
          messageId: 'message-1',
          observedAt: 500,
        },
      ],
      lastSeenAt: 500,
    });
  });

  it('promotes an exact repeated observation to active memory', async () => {
    const existing = makeMemory({
      evidence: [
        {sessionId: 'session-0', messageId: 'message-0', observedAt: 100},
      ],
    });
    const repository = makeRepository([existing]);

    const result = await observeMemoryCandidateFromMessage(input, repository);

    expect(result).toEqual(
      expect.objectContaining({captured: true, action: 'promoted'}),
    );
    expect(repository.createMemory).not.toHaveBeenCalled();
    expect(repository.updateMemory).toHaveBeenCalledWith('memory-1', {
      status: 'active',
      sourceType: 'repeated',
      importance: 3,
      confidence: 0.75,
      repetitionCount: 2,
      lastSeenAt: 500,
      evidence: [
        {sessionId: 'session-0', messageId: 'message-0', observedAt: 100},
        {
          sessionId: 'session-1',
          messageId: 'message-1',
          observedAt: 500,
        },
      ],
    });
  });

  it('reinforces trusted active memory without downgrading its source', async () => {
    const repository = makeRepository([
      makeMemory({
        status: 'active',
        sourceType: 'explicit',
        importance: 4,
        confidence: 1,
      }),
    ]);

    const result = await observeMemoryCandidateFromMessage(input, repository);

    expect(result).toEqual(
      expect.objectContaining({captured: true, action: 'reinforced'}),
    );
    expect(repository.updateMemory).toHaveBeenCalledWith(
      'memory-1',
      expect.objectContaining({
        status: 'active',
        sourceType: 'explicit',
        importance: 4,
        confidence: 1,
        repetitionCount: 2,
      }),
    );
  });
});
