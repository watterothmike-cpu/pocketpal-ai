function normalizeMemoryContent(content: string): string {
  return content
    .normalize('NFKC')
    .toLocaleLowerCase('de-DE')
    .replace(/\s+/gu, ' ')
    .replace(/[.!?]+$/gu, '')
    .trim();
}

export function canonicalizeMemoryContent(content: string): string {
  const normalized = normalizeMemoryContent(content);

  const subordinateClause =
    /^(?:dass|das)\s+(\S+)\s+(.+)\s+(ist|sind|war|waren)$/u.exec(normalized);
  if (!subordinateClause) {
    return normalized;
  }

  const [, subject, predicate, verb] = subordinateClause;
  return `${subject} ${verb} ${predicate}`;
}

export function hasCanonicalMemoryWordOrder(content: string): boolean {
  return canonicalizeMemoryContent(content) === normalizeMemoryContent(content);
}
