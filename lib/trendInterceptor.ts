import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { isRecord, parseQuipIdea, parseQuipResult, type QuipStance, type QuipStyle } from '@/supabase/functions/_shared/quip';
import { withAiTimeout } from '@/lib/aiRequest';

export type QuipGenerationOptions = { stance: QuipStance; style: QuipStyle; signal?: AbortSignal };

export async function generateTrendReply(
  trendText: string,
  trendTopicId: string | null,
  bookIds: string[],
  { stance, style, signal }: QuipGenerationOptions,
) {
  if (!supabase) throw new Error('Connect Supabase to draft a trend reply.');
  const client = supabase;
  if (bookIds.length === 0) throw new Error('Select at least one source book to generate a Quip.');

  return withAiTimeout(async (requestSignal) => {
    const { data, error } = await client.functions.invoke('trend-interceptor', {
      body: {
        trendText,
        ...(trendTopicId ? { trendTopicId } : {}),
        bookIds,
        stance,
        style,
        includeRelevance: true,
      },
      signal: requestSignal,
    });

    if (error) {
      if (error instanceof FunctionsHttpError) {
        const body: unknown = await error.context.json();
        if (isRecord(body) && typeof body.error === 'string') throw new Error(body.error);
      }
      throw new Error(error.message || 'Could not draft a trend reply.');
    }
    return parseQuipResult(data, bookIds, style);
  }, 'Reply generation timed out. Check your connection and try again.', signal);
}

export async function generateQuipIdea(bookIds: string[], signal?: AbortSignal): Promise<string> {
  if (!supabase) throw new Error('Connect Supabase to suggest a Quip idea.');
  const client = supabase;
  if (bookIds.length === 0) throw new Error('Select at least one Quip-enabled book to suggest an idea.');
  return withAiTimeout(async (requestSignal) => {
    const { data, error } = await client.functions.invoke('trend-interceptor', {
      body: { mode: 'idea', bookIds },
      signal: requestSignal,
    });
    if (error) {
      if (error instanceof FunctionsHttpError) {
        const body: unknown = await error.context.json();
        if (isRecord(body) && typeof body.error === 'string') throw new Error(body.error);
      }
      throw new Error(error.message || 'Could not suggest a Quip idea.');
    }
    return parseQuipIdea(data);
  }, 'Idea generation timed out. Check your connection and try again.', signal);
}