export const BOOK_ON_RAMP_CACHE_VERSION = 'v1';
export const BOOK_ON_RAMP_PROMPT = 'You are BooQuip’s book guide. In 2 or 3 short sentences and no more than 70 words, give a modern reader a 30-second on-ramp to the book. Base book details only on the supplied short take; do not invent plot points or claims. If the short take says no synopsis is available, do not infer plot, genre, or subject; offer a general question to guide a first reading instead. Mention the publication year only when one is supplied. Do not quote or imitate the book. Return plain text only.';

export function parseBookOnRamp(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 1200 ||
    value.trim().split(/\s+/u).length > 70) {
    throw new Error('The 30-second read is invalid or exceeds 70 words.');
  }
  return value.trim();
}
