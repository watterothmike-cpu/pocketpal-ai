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

export function renderMemoryContentForModel(content: string): string {
  const trimmed = content.trim();
  const punctuation = /[.!?]$/u.exec(trimmed)?.[0] ?? '.';
  const sentence =
    punctuation === '.' && !trimmed.endsWith('.')
      ? trimmed
      : trimmed.slice(0, -1).trim();

  const possessivePredicate =
    /^(.+?)\s+(ist|sind|war|waren)\s+mein(?:e|er|en|em|es)?\s+(.+)$/iu.exec(
      sentence,
    );
  if (possessivePredicate) {
    const [, subject, verb, predicate] = possessivePredicate;
    return `${subject} ${verb} ${predicate} des aktuellen Benutzers${punctuation}`;
  }

  const leadingPossessive =
    /^mein(?:e|er|en|em|es)?\s+([\p{L}\p{N}-]+)\s+(.+)$/iu.exec(sentence);
  if (leadingPossessive) {
    const [, subject, predicate] = leadingPossessive;
    return `${subject} des aktuellen Benutzers ${predicate}${punctuation}`;
  }

  if (/^ich\b/iu.test(sentence)) {
    return `${sentence.replace(/^ich\b/iu, 'Der aktuelle Benutzer')}${punctuation}`;
  }

  return trimmed;
}
