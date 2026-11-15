import type { Book } from '@/lib/books';
import { supabase } from '@/lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { isRecord } from '@/supabase/functions/_shared/quip';
import { withAiTimeout } from '@/lib/aiRequest';

export async function getBookOnRamp(book: Book, signal?: AbortSignal) {
  if (!supabase) throw new Error('Connect Supabase to generate a book on-ramp.');
  const client = supabase;

  return withAiTimeout(async (requestSignal) => {
    const { data, error } = await client.functions.invoke('book-on-ramp', {
      body: {
        book: {
          title: book.title,
          author: book.author,
          year: book.year,
          note: book.note,
        },
      },
      signal: requestSignal,
    });

    if (error) {
      if (error instanceof FunctionsHttpError) {
        const body: unknown = await error.context.json();
        if (isRecord(body) && typeof body.error === 'string') throw new Error(body.error);
      }
      throw new Error(error.message || 'Could not generate the book on-ramp.');
    }
    if (typeof data?.onRamp !== 'string' || !data.onRamp.trim()) throw new Error('The on-ramp response was empty.');
    return data.onRamp.trim();
  }, 'Your 30-second read timed out. Check your connection and try again.', signal, 30_000);
}