import type { QuipStance, QuipStyle } from '../supabase/functions/_shared/quip.ts';

export type QuipDraftInputs = {
  seed: string;
  trendTopicId: string | null;
  bookIds: readonly string[];
  stance: QuipStance;
  style: QuipStyle;
};

export function quipInputsMatch(previous: QuipDraftInputs | null, current: QuipDraftInputs): boolean {
  if (!previous || previous.seed !== current.seed || previous.trendTopicId !== current.trendTopicId ||
    previous.stance !== current.stance || previous.style !== current.style) return false;
  const previousIds = new Set(previous.bookIds);
  const currentIds = new Set(current.bookIds);
  return previousIds.size === currentIds.size && [...currentIds].every((id) => previousIds.has(id));
}

export function quipRefinementStatus(
  seed: string,
  variant: { book_id: string; reply: string },
  selectedBookId: string | null,
  canCraft: boolean,
): 'unavailable' | 'confirm' | 'ready' {
  if (!canCraft || !selectedBookId || variant.book_id !== selectedBookId || !variant.reply.trim()) return 'unavailable';
  return seed && seed !== variant.reply ? 'confirm' : 'ready';
}
