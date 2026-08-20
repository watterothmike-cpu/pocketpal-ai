import {Model} from '@nozbe/watermelondb';
import {field, text} from '@nozbe/watermelondb/decorators';

import type {
  MemoryEvidence,
  MemoryKind,
  MemoryLink,
  MemorySourceType,
  MemoryStatus,
  PalMemoryData,
} from '../../types/memory';

export default class PalMemory extends Model {
  static table = 'pal_memories';

  @text('pal_id') palId!: string;
  @text('kind') kind!: MemoryKind;
  @text('status') status!: MemoryStatus;
  @text('content') content!: string;
  @text('keywords') keywords!: string;
  @text('links') links!: string;
  @text('evidence') evidence!: string;
  @text('source_type') sourceType!: MemorySourceType;
  @field('importance') importance!: number;
  @field('confidence') confidence!: number;
  @field('repetition_count') repetitionCount!: number;
  @field('use_count') useCount!: number;
  @field('last_seen_at') lastSeenAt!: number;
  @field('last_used_at') lastUsedAt?: number;
  @text('supersedes_id') supersedesId?: string;
  @field('created_at') createdAt!: number;
  @field('updated_at') updatedAt!: number;

  get keywordsArray(): string[] {
    return PalMemory.parseArray<string>(this.keywords);
  }

  get linksArray(): MemoryLink[] {
    return PalMemory.parseArray<MemoryLink>(this.links);
  }

  get evidenceArray(): MemoryEvidence[] {
    return PalMemory.parseArray<MemoryEvidence>(this.evidence);
  }

  toMemory(): PalMemoryData {
    return {
      id: this.id,
      palId: this.palId,
      kind: this.kind,
      status: this.status,
      content: this.content,
      keywords: this.keywordsArray,
      links: this.linksArray,
      evidence: this.evidenceArray,
      sourceType: this.sourceType,
      importance: this.importance,
      confidence: this.confidence,
      repetitionCount: this.repetitionCount,
      useCount: this.useCount,
      lastSeenAt: this.lastSeenAt,
      lastUsedAt: this.lastUsedAt,
      supersedesId: this.supersedesId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  static stringifyArray(value: unknown[]): string {
    try {
      return JSON.stringify(value);
    } catch {
      return '[]';
    }
  }

  private static parseArray<T>(value?: string): T[] {
    try {
      const parsed = JSON.parse(value || '[]');
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
}
