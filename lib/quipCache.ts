import { supabase } from '@/lib/supabase';
import { withAiTimeout } from '@/lib/aiRequest';
import {
  parseStoredQuipCache,
  QUIP_CACHE_PROMPT_VERSION,
  type StoredQuipCacheVariant,
} from '@/supabase/functions/_shared/quipCache';

export async function loadQuipBookDrafts(bookId: string, signal?: AbortSignal): Promise<StoredQuipCacheVariant[]> {
  if (!supabase) throw new Error('Connect to load ready-made Quips.');
  const client = supabase;
  return withAiTimeout(async (requestSignal) => {
    const { data, error } = await client
    .from('quip_book_drafts')
    .select('book_id,stance,style,topic,topic_reason,reply,source_hash,prompt_version,model,generated_at')
    .eq('book_id', bookId)
    .eq('prompt_version', QUIP_CACHE_PROMPT_VERSION)
    .order('stance', { ascending: true })
    .order('style', { ascending: true })
    .abortSignal(requestSignal);
    if (error) throw new Error(error.message || 'Could not load ready-made Quips.');
    return parseStoredQuipCache(data);
  }, 'Loading ready-made Quips timed out. Please try again.', signal, 15_000);
}
