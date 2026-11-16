import type { Book } from '@/lib/books';
import { supabase } from '@/lib/supabase';
import { withAiTimeout } from '@/lib/aiRequest';
import { BOOK_ON_RAMP_CACHE_VERSION, parseBookOnRamp } from '@/supabase/functions/_shared/bookOnRamp';

export async function getBookOnRamp(book: Book, signal?: AbortSignal): Promise<string | null> {
  if (!supabase) throw new Error('Connect to load a 30-second read.');
  const client = supabase;
  return withAiTimeout(async (requestSignal) => {
    const { data, error } = await client.from('book_on_ramp_cache')
      .select('on_ramp')
      .eq('book_id', book.id)
      .eq('prompt_version', BOOK_ON_RAMP_CACHE_VERSION)
      .abortSignal(requestSignal)
      .maybeSingle();
    if (error) throw new Error(`Could not load the 30-second read: ${error.message}`);
    return data === null ? null : parseBookOnRamp(data.on_ramp);
  }, 'Your 30-second read timed out. Check your connection and try again.', signal, 30_000);
}
