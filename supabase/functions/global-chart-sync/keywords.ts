export function validKeywords(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length !== 3 ||
    !value.every((word) => typeof word === 'string' &&
      /^[\p{L}\p{N}]+(?:[ -][\p{L}\p{N}]+)*$/u.test(word.trim()) &&
      word.trim().length <= 32)) return null;
  const keywords = value.map((word: string) => word.trim());
  return new Set(keywords.map((word) => word.toLowerCase())).size === 3 ? keywords : null;
}
