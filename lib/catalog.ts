import { supabase } from '@/lib/supabase';
import type { Book, BookAdaptation, Pillar, PillarInfo } from '@/lib/books';

export async function loadCatalog(): Promise<Book[]> {
  if (!supabase) return [];

  const [bookResult, adaptationResult] = await Promise.all([
    supabase
      .from('books')
      .select('id, title, author, published_year, isbn, pillar, note, cover_color, is_active')
      .order('title', { ascending: true }),
    supabase
      .from('book_adaptations')
      .select('book_id, title, format, release_year, platform, sort_order, tmdb_id, tmdb_cast, tmdb_lookup_status')
      .order('book_id', { ascending: true })
      .order('sort_order', { ascending: true }),
  ]);
  if (bookResult.error) throw bookResult.error;
  if (adaptationResult.error) throw adaptationResult.error;

  const adaptationsByBook = new Map<string, BookAdaptation[]>();
  for (const adaptation of adaptationResult.data ?? []) {
    const records = adaptationsByBook.get(adaptation.book_id) ?? [];
    records.push({
      title: adaptation.title,
      format: adaptation.format as BookAdaptation['format'],
      releaseYear: adaptation.release_year,
      platform: adaptation.platform,
      tmdbId: adaptation.tmdb_id,
      castMembers: adaptation.tmdb_cast,
      tmdbLookupStatus: adaptation.tmdb_lookup_status as BookAdaptation['tmdbLookupStatus'],
    });
    adaptationsByBook.set(adaptation.book_id, records);
  }

  return (bookResult.data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    author: row.author,
    year: row.published_year,
    isbn: row.isbn,
    pillar: row.pillar as Pillar,
    note: row.note,
    color: row.cover_color,
    adaptations: adaptationsByBook.get(row.id) ?? [],
    isActive: row.is_active,
  }));
}

export async function loadPillars(): Promise<PillarInfo[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('pillars').select('id, label, detail, color').order('sort_order');
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as Pillar,
    label: row.label,
    detail: row.detail,
    color: row.color,
  }));
}