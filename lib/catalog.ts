import { supabase } from '@/lib/supabase';
import type { Book, BookAdaptation, Pillar, PillarInfo } from '@/lib/books';

export type ChartListing = {
  id: string;
  sourceId: string;
  listName: string;
  marketCode: string;
  languageCode: string;
  chartKind: 'bestseller' | 'audio_bestseller' | 'reader_trend';
  chartDate: string;
  rank: number;
  title: string;
  author: string;
  sourceUrl: string;
  isbn13: string | null;
  bookId: string | null;
  termsUrl: string;
};

export type ChartData = { listings: ChartListing[] };

export const EMPTY_CHART_DATA: ChartData = { listings: [] };

export async function loadCatalog(): Promise<Book[]> {
  if (!supabase) return [];

  const [bookResult, adaptationResult] = await Promise.all([
    supabase
      .from('books')
      .select('id, title, author, published_year, isbn, pillar, note, cover_color, cover_url, is_active')
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
    coverUrl: row.cover_url,
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

export async function loadChartData(): Promise<ChartData> {
  if (!supabase) return EMPTY_CHART_DATA;

  const [sourceResult, entryResult] = await Promise.all([
    supabase
      .from('chart_sources')
      .select('id, market_code, language_code, list_name, chart_kind, terms_url')
      .eq('enabled', true),
    supabase
      .from('chart_entries')
      .select('id, source_id, chart_date, rank, title, author, source_url, isbn13, book_id')
      .order('chart_date', { ascending: false })
      .order('source_id', { ascending: true })
      .order('rank', { ascending: true })
      .limit(500),
  ]);
  if (sourceResult.error) throw sourceResult.error;
  if (entryResult.error) throw entryResult.error;

  const sources = new Map((sourceResult.data ?? []).map((source) => [source.id, source]));
  const latestDateBySource = new Map<string, string>();
  for (const entry of entryResult.data ?? []) {
    if (!sources.has(entry.source_id)) continue;
    const currentDate = latestDateBySource.get(entry.source_id);
    if (!currentDate || entry.chart_date > currentDate) latestDateBySource.set(entry.source_id, entry.chart_date);
  }

  const latestEntries = (entryResult.data ?? []).filter((entry) =>
    sources.has(entry.source_id) && latestDateBySource.get(entry.source_id) === entry.chart_date,
  );
  const listings: ChartListing[] = latestEntries.flatMap((entry) => {
    const source = sources.get(entry.source_id);
    if (!source) return [];
    return [{
      id: entry.id,
      sourceId: entry.source_id,
      listName: source.list_name,
      marketCode: source.market_code,
      languageCode: source.language_code,
      chartKind: source.chart_kind as ChartListing['chartKind'],
      chartDate: entry.chart_date,
      rank: entry.rank,
      title: entry.title,
      author: entry.author,
      sourceUrl: entry.source_url,
      isbn13: entry.isbn13,
      bookId: entry.book_id,
      termsUrl: source.terms_url,
    }];
  });

  return { listings };
}