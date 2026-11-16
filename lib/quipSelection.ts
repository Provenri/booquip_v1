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
