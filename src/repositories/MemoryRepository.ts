import {Q} from '@nozbe/watermelondb';

import {database} from '../database';
import PalMemory from '../database/models/PalMemory';
import type {
  CreatePalMemoryInput,
  MemoryStatus,
  PalMemoryData,
  UpdatePalMemoryInput,
} from '../types/memory';

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

class MemoryRepository {
  async getMemoryById(id: string): Promise<PalMemoryData | null> {
    try {
      const memory = await database.collections
        .get<PalMemory>('pal_memories')
        .find(id);
      return memory.toMemory();
    } catch {
      return null;
    }
  }

  async getMemoriesForPal(
    palId: string,
    statuses: MemoryStatus[] = ['active'],
  ): Promise<PalMemoryData[]> {
    const clauses = [Q.where('pal_id', palId)];
    if (statuses.length > 0) {
      clauses.push(Q.where('status', Q.oneOf(statuses)));
    }

    const memories = await database.collections
      .get<PalMemory>('pal_memories')
      .query(...clauses)
      .fetch();

    return memories
      .map(memory => memory.toMemory())
      .sort(
        (a, b) => b.importance - a.importance || b.lastSeenAt - a.lastSeenAt,
      );
  }

  async createMemory(input: CreatePalMemoryInput): Promise<PalMemoryData> {
    const palId = input.palId.trim();
    const content = input.content.trim();
    if (!palId) {
      throw new Error('Memory requires a Pal id');
    }
    if (!content) {
      throw new Error('Memory content must not be empty');
    }

    const now = Date.now();
    const memory = await database.write(() =>
      database.collections.get<PalMemory>('pal_memories').create(record => {
        record.palId = palId;
        record.kind = input.kind;
        record.status =
          input.status ??
          (input.sourceType === 'explicit' || input.sourceType === 'manual'
            ? 'active'
            : 'candidate');
        record.content = content;
        record.keywords = PalMemory.stringifyArray(input.keywords ?? []);
        record.links = PalMemory.stringifyArray(input.links ?? []);
        record.evidence = PalMemory.stringifyArray(input.evidence ?? []);
        record.sourceType = input.sourceType;
        record.importance = clamp(input.importance ?? 3, 1, 5);
        record.confidence = clamp(input.confidence ?? 0.5, 0, 1);
        record.repetitionCount = Math.max(1, input.repetitionCount ?? 1);
        record.useCount = 0;
        record.lastSeenAt = input.lastSeenAt ?? now;
        record.supersedesId = input.supersedesId;
        record.createdAt = now;
        record.updatedAt = now;
      }),
    );

    return memory.toMemory();
  }

  async updateMemory(
    id: string,
    update: UpdatePalMemoryInput,
  ): Promise<PalMemoryData | null> {
    const memory = await database.collections
      .get<PalMemory>('pal_memories')
      .find(id)
      .catch(() => null);
    if (!memory) {
      return null;
    }

    await database.write(() =>
      memory.update(record => {
        if (update.kind !== undefined) record.kind = update.kind;
        if (update.status !== undefined) record.status = update.status;
        if (update.content !== undefined) {
          const content = update.content.trim();
          if (!content) throw new Error('Memory content must not be empty');
          record.content = content;
        }
        if (update.keywords !== undefined) {
          record.keywords = PalMemory.stringifyArray(update.keywords);
        }
        if (update.links !== undefined) {
          record.links = PalMemory.stringifyArray(update.links);
        }
        if (update.evidence !== undefined) {
          record.evidence = PalMemory.stringifyArray(update.evidence);
        }
        if (update.sourceType !== undefined) {
          record.sourceType = update.sourceType;
        }
        if (update.importance !== undefined) {
          record.importance = clamp(update.importance, 1, 5);
        }
        if (update.confidence !== undefined) {
          record.confidence = clamp(update.confidence, 0, 1);
        }
        if (update.repetitionCount !== undefined) {
          record.repetitionCount = Math.max(1, update.repetitionCount);
        }
        if (update.useCount !== undefined) {
          record.useCount = Math.max(0, update.useCount);
        }
        if (update.lastSeenAt !== undefined) {
          record.lastSeenAt = update.lastSeenAt;
        }
        if (update.lastUsedAt !== undefined) {
          record.lastUsedAt = update.lastUsedAt;
        }
        if (update.supersedesId !== undefined) {
          record.supersedesId = update.supersedesId;
        }
        record.updatedAt = Date.now();
      }),
    );

    return memory.toMemory();
  }

  async markMemoryUsed(id: string, usedAt: number = Date.now()) {
    const memory = await database.collections
      .get<PalMemory>('pal_memories')
      .find(id)
      .catch(() => null);
    if (!memory) {
      return null;
    }

    // Increment inside WatermelonDB's serialized writer. Two overlapping
    // retrievals must not overwrite each other with the same stale count.
    await database.write(() =>
      memory.update(record => {
        record.useCount += 1;
        record.lastUsedAt = usedAt;
        record.updatedAt = Date.now();
      }),
    );

    return memory.toMemory();
  }
}

export const memoryRepository = new MemoryRepository();
export default MemoryRepository;
