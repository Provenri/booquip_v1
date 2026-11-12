import type { Book } from '@/lib/books';
import { supabase } from '@/lib/supabase';

export async function getBookOnRamp(book: Book) {
  if (!supabase) throw new Error('Connect Supabase to generate a book on-ramp.');

  const { data, error } = await supabase.functions.invoke('book-on-ramp', {
    body: {
      book: {
        title: book.title,
        author: book.author,
        year: book.year,
        note: book.note,
      },
    },
  });

  if (error) throw new Error(error.message || 'Could not generate the book on-ramp.');
  if (typeof data?.onRamp !== 'string') throw new Error('The on-ramp response was empty.');
  return data.onRamp;
}