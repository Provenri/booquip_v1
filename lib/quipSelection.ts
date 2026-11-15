import type { QuipStance, QuipStyle } from '../supabase/functions/_shared/quip.ts';

export function reconcileQuipSelection(selected: string[], previousSources: readonly string[], nextSources: readonly string[]): string[] {
  const available = new Set(nextSources);
  const previous = new Set(previousSources);
  const next = [...selected.filter((id) => available.has(id)), ...nextSources.filter((id) => !previous.has(id))];
  return next.length === selected.length && next.every((id, index) => id === selected[index]) ? selected : next;
}

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
