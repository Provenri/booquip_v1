export const QUIP_STANCES = [
  { id: 'pro', label: 'Pro' },
  { id: 'neutral', label: 'Neutral' },
  { id: 'cons', label: 'Cons' },
] as const;

export const QUIP_STYLES = [
  { id: 'natural', label: 'Natural' },
  { id: 'curious', label: 'Curious' },
  { id: 'reflective', label: 'Reflective' },
  { id: 'witty', label: 'Witty' },
  { id: 'challenging', label: 'Challenging' },
  { id: 'practical', label: 'Practical' },
  { id: 'empathetic', label: 'Empathetic' },
  { id: 'concise', label: 'Concise' },
] as const;

export const QUIP_RELEVANCE_LABELS = {
  high: 'High match',
  medium: 'Medium match',
  low: 'Low match',
  insufficient: 'Insufficient information',
} as const;

export type QuipStance = typeof QUIP_STANCES[number]['id'];
export type QuipStyle = typeof QUIP_STYLES[number]['id'];
export type SingleBookQuipStyle = 'natural' | 'curious' | 'witty';
export const SINGLE_BOOK_QUIP_STYLES: { id: SingleBookQuipStyle; label: string }[] = [
  { id: 'natural', label: 'Neutral' },
  { id: 'curious', label: 'Curious' },
  { id: 'witty', label: 'Witty' },
];
export type QuipRelevanceLevel = keyof typeof QUIP_RELEVANCE_LABELS;
export type QuipBookRelevance = { bookId: string; level: QuipRelevanceLevel };
export type QuipResult = { reply: string; relevance: QuipBookRelevance[] };
export const QUIP_IDEA_LIMIT = 200;
export const QUIP_CONCISE_LIMIT = 280;
export const QUIP_REPLY_LIMIT = 280;

export function parseSingleBookQuip(value: unknown): { reply: string } {
  if (!isRecord(value) || Object.keys(value).length !== 1 ||
    typeof value.reply !== 'string' || !value.reply.trim() || value.reply.trim().length > QUIP_REPLY_LIMIT) {
    throw new Error('The AI service returned an invalid Quip. Please generate again.');
  }
  return { reply: value.reply.trim() };
}

export function parseQuipIdea(value: unknown): string {
  if (!isRecord(value) || Object.keys(value).length !== 1 ||
    typeof value.idea !== 'string' || !value.idea.trim() || value.idea.trim().length > QUIP_IDEA_LIMIT) {
    throw new Error('The AI service returned an invalid idea. Please try again.');
  }
  return value.idea.trim();
}

export function isQuipStance(value: unknown): value is QuipStance {
  return QUIP_STANCES.some((option) => option.id === value);
}

export function isQuipStyle(value: unknown): value is QuipStyle {
  return QUIP_STYLES.some((option) => option.id === value);
}

export function isSingleBookQuipStyle(value: unknown): value is SingleBookQuipStyle {
  return SINGLE_BOOK_QUIP_STYLES.some((option) => option.id === value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRelevanceLevel(value: unknown): value is QuipRelevanceLevel {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(QUIP_RELEVANCE_LABELS, value);
}

export function parseQuipResult(value: unknown, bookIds: readonly string[], style: QuipStyle = 'natural'): QuipResult {
  const replyLimit = style === 'concise' ? QUIP_CONCISE_LIMIT : 600;
  if (!isRecord(value) || typeof value.reply !== 'string' || !value.reply.trim() || value.reply.trim().length > replyLimit) {
    throw new Error('The AI service returned an invalid Quip. Please generate again.');
  }
  const expectedIds = new Set(bookIds);
  if (!Array.isArray(value.relevance) || value.relevance.length !== expectedIds.size) {
    throw new Error('Book relevance was incomplete. Please generate again.');
  }
  const seen = new Set<string>();
  const relevance: QuipBookRelevance[] = [];
  for (const entry of value.relevance) {
    if (
      !isRecord(entry) || typeof entry.bookId !== 'string' || !expectedIds.has(entry.bookId) ||
      seen.has(entry.bookId) || !isRelevanceLevel(entry.level)
    ) {
      throw new Error('Book relevance was invalid. Please generate again.');
    }
    seen.add(entry.bookId);
    relevance.push({ bookId: entry.bookId, level: entry.level });
  }
  return { reply: value.reply.trim(), relevance };
}
