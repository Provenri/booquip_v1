import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { isRecord, parseSingleBookQuip, QUIP_SEED_LIMIT, type QuipStance, type SingleBookQuipStyle } from '@/supabase/functions/_shared/quip';
import { withAiTimeout } from '@/lib/aiRequest';

export type QuipGenerationOptions = { stance: QuipStance; style: SingleBookQuipStyle; signal?: AbortSignal };

export async function generateTrendReply(
  trendText: string,
  trendTopicId: string | null,
  bookIds: string[],
  { stance, style, signal }: QuipGenerationOptions,
) {
  if (!supabase) throw new Error('Connect Supabase to draft a trend reply.');
  const client = supabase;
  if (bookIds.length !== 1) throw new Error('Select exactly one book to generate a Quip.');
  if (!trendText.trim() || trendText.length > QUIP_SEED_LIMIT) throw new Error(`Enter a thought of at most ${QUIP_SEED_LIMIT} characters.`);

  return withAiTimeout(async (requestSignal) => {
    const { data, error } = await client.functions.invoke('trend-interceptor', {
      body: {
        trendText,
        ...(trendTopicId ? { trendTopicId } : {}),
        bookIds,
        stance,
        style,
        workflow: 'single-book',
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
    return parseSingleBookQuip(data);
  }, 'Reply generation timed out. Check your connection and try again.', signal);
}
