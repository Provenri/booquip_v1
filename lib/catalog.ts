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

export type OpenLibraryActivity = {
  snapshotDate: string;
  ratingsCount: number;
  ratingsAverage: number | null;
  ratingsCountChange: number | null;
  previousSnapshotDate: string | null;
  workUrl: string;
  editionUrl: string | null;
};

export type ChartData = {
  listings: ChartListing[];
  activityByBookId: Record<string, OpenLibraryActivity>;
};

export const EMPTY_CHART_DATA: ChartData = { listings: [], activityByBookId: {} };

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

  const bookIds = [...new Set(listings.flatMap((listing) => listing.bookId ? [listing.bookId] : []))];
  if (bookIds.length === 0) return { listings, activityByBookId: {} };

  const [snapshotResult, linkResult] = await Promise.all([
    supabase
      .from('openlibrary_activity_snapshots')
      .select('book_id, snapshot_date, ratings_count, ratings_average')
      .in('book_id', bookIds)
      .order('snapshot_date', { ascending: false }),
    supabase
      .from('openlibrary_book_links')
      .select('book_id, work_key, edition_key')
      .in('book_id', bookIds),
  ]);
  if (snapshotResult.error) throw snapshotResult.error;
  if (linkResult.error) throw linkResult.error;

  const snapshotsByBook = new Map<string, Array<{ date: string; count: number; average: number | null }>>();
  for (const snapshot of snapshotResult.data ?? []) {
    const records = snapshotsByBook.get(snapshot.book_id) ?? [];
    records.push({
      date: snapshot.snapshot_date,
      count: snapshot.ratings_count,
      average: snapshot.ratings_average === null ? null : Number(snapshot.ratings_average),
    });
    snapshotsByBook.set(snapshot.book_id, records);
  }
  const linksByBook = new Map((linkResult.data ?? []).map((link) => [link.book_id, link]));
  const activityByBookId: Record<string, OpenLibraryActivity> = {};
  for (const [bookId, snapshots] of snapshotsByBook) {
    const link = linksByBook.get(bookId);
    const latest = snapshots[0];
    if (!link || !latest) continue;
    const previous = snapshots[1];
    activityByBookId[bookId] = {
      snapshotDate: latest.date,
      ratingsCount: latest.count,
      ratingsAverage: latest.average,
      ratingsCountChange: previous ? latest.count - previous.count : null,
      previousSnapshotDate: previous?.date ?? null,
      workUrl: `https://openlibrary.org${link.work_key}`,
      editionUrl: link.edition_key ? `https://openlibrary.org${link.edition_key}` : null,
    };
  }

  return { listings, activityByBookId };
}