import type {PalMemoryData} from '../../../types/memory';
import type {Pal} from '../../../types/pal';
import {
  applyExplicitMemoryCommandFromMessage,
  captureExplicitMemoryFromMessage,
  parseExplicitForgetCommand,
  parseExplicitMemoryCommand,
} from '../explicitMemoryCapture';

const sammy = {
  id: 'sammy',
  capabilities: {memory: true},
} as Pal;

const message = {
  id: 'message-1',
  text: 'Merk dir: Harry kennt Papa Bär.',
  createdAt: 500,
};

function makeMemory(raw: Partial<PalMemoryData> = {}): PalMemoryData {
  return {
    id: 'memory-1',
    palId: 'sammy',
    kind: 'knowledge',
    status: 'active',
    content: 'Harry kennt Papa Bär.',
    keywords: [],
    links: [],
    evidence: [],
    sourceType: 'explicit',
    importance: 4,
    confidence: 1,
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

describe('parseExplicitMemoryCommand', () => {
  it.each([
    ['Merk dir: Harry kennt Papa Bär.', 'Harry kennt Papa Bär.'],
    [
      'Bitte merke dir, dass Mike auch Papa Bär ist.',
      'dass Mike auch Papa Bär ist.',
    ],
    ['  MERK DIR MAL — Milow ist ein Hund.  ', 'Milow ist ein Hund.'],
  ])('extracts explicit German memory commands', (input, expected) => {
    expect(parseExplicitMemoryCommand(input)).toBe(expected);
  });

  it.each(['Ich kann mir das nicht merken.', 'Merk dir', 'Bitte merke dir:'])(
    'rejects text without an explicit memory payload',
    input => {
      expect(parseExplicitMemoryCommand(input)).toBeNull();
    },
  );
});

describe('parseExplicitForgetCommand', () => {
  it('extracts an explicit forget command', () => {
    expect(parseExplicitForgetCommand('Vergiss: Harry kennt Papa Bär.')).toBe(
      'Harry kennt Papa Bär.',
    );
  });

  it('rejects an empty forget command', () => {
    expect(parseExplicitForgetCommand('Bitte vergiss:')).toBeNull();
  });
});

describe('captureExplicitMemoryFromMessage', () => {
  it('does nothing when persistent memory is disabled for the Pal', async () => {
    const repository = makeRepository();

    const result = await captureExplicitMemoryFromMessage(
      {
        pal: {...sammy, capabilities: {memory: false}},
        sessionId: 'session-1',
        message,
      },
      repository,
    );

    expect(result).toEqual({
      captured: false,
      reason: 'capability_disabled',
    });
    expect(repository.getMemoriesForPal).not.toHaveBeenCalled();
  });

  it('creates a durable active memory with message evidence', async () => {
    const repository = makeRepository();

    const result = await captureExplicitMemoryFromMessage(
      {pal: sammy, sessionId: 'session-1', message},
      repository,
    );

    expect(result).toEqual(
      expect.objectContaining({captured: true, action: 'created'}),
    );
    expect(repository.createMemory).toHaveBeenCalledWith({
      palId: 'sammy',
      kind: 'knowledge',
      status: 'active',
      content: 'Harry kennt Papa Bär.',
      sourceType: 'explicit',
      importance: 4,
      confidence: 1,
      evidence: [
        {
          sessionId: 'session-1',
          messageId: 'message-1',
          observedAt: 500,
        },
      ],
    });
  });

  it('reinforces an equivalent memory instead of creating a duplicate', async () => {
    const existing = makeMemory({
      content: 'harry kennt papa bär',
      importance: 2,
      confidence: 0.6,
      repetitionCount: 3,
      evidence: [
        {sessionId: 'session-0', messageId: 'message-0', observedAt: 100},
      ],
    });
    const repository = makeRepository([existing]);

    const result = await captureExplicitMemoryFromMessage(
      {pal: sammy, sessionId: 'session-1', message},
      repository,
    );

    expect(result).toEqual(
      expect.objectContaining({captured: true, action: 'reinforced'}),
    );
    expect(repository.createMemory).not.toHaveBeenCalled();
    expect(repository.updateMemory).toHaveBeenCalledWith('memory-1', {
      status: 'active',
      sourceType: 'explicit',
      importance: 4,
      confidence: 1,
      repetitionCount: 4,
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

  it('reinforces a direct fact when the command uses a subordinate clause', async () => {
    const existing = makeMemory({content: 'Harry ist mein Freund.'});
    const repository = makeRepository([existing]);

    const result = await captureExplicitMemoryFromMessage(
      {
        pal: sammy,
        sessionId: 'session-1',
        message: {...message, text: 'Merk dir, dass Harry mein Freund ist.'},
      },
      repository,
    );

    expect(result).toEqual(
      expect.objectContaining({captured: true, action: 'reinforced'}),
    );
    expect(repository.createMemory).not.toHaveBeenCalled();
    expect(repository.updateMemory).toHaveBeenCalledWith(
      'memory-1',
      expect.objectContaining({repetitionCount: 2}),
    );
  });
});

describe('applyExplicitMemoryCommandFromMessage', () => {
  it('archives an exact active memory instead of deleting its history', async () => {
    const existing = makeMemory();
    const repository = makeRepository([existing]);

    const result = await applyExplicitMemoryCommandFromMessage(
      {
        pal: sammy,
        sessionId: 'session-2',
        message: {...message, text: 'Vergiss: harry kennt papa bär'},
      },
      repository,
    );

    expect(result).toEqual(
      expect.objectContaining({handled: true, action: 'archived'}),
    );
    expect(repository.updateMemory).toHaveBeenCalledWith('memory-1', {
      status: 'archived',
      lastSeenAt: 500,
    });
  });

  it('does not guess when a forget command has no exact match', async () => {
    const repository = makeRepository([makeMemory()]);

    const result = await applyExplicitMemoryCommandFromMessage(
      {
        pal: sammy,
        sessionId: 'session-2',
        message: {...message, text: 'Vergiss: irgendetwas über Harry'},
      },
      repository,
    );

    expect(result).toEqual({
      handled: true,
      action: 'not_found',
      memories: [],
    });
    expect(repository.updateMemory).not.toHaveBeenCalled();
  });
});
