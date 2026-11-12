import { supabase } from '@/lib/supabase';
import type { Book, BookAdaptation, Pillar, PillarInfo, Subcategory, SubcategoryId } from '@/lib/books';

export async function loadCatalog(): Promise<Book[]> {
  if (!supabase) return [];

  const [bookResult, adaptationResult] = await Promise.all([
    supabase
      .from('books')
      .select('id, title, author, published_year, isbn, pillar, subcategory, note, cover_color')
      .order('title', { ascending: true }),
    supabase
      .from('book_adaptations')
      .select('book_id, title, format, release_year, platform, sort_order')
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
    subcategory: row.subcategory as SubcategoryId,
    note: row.note,
    color: row.cover_color,
    adaptations: adaptationsByBook.get(row.id) ?? [],
  }));
}

export async function loadTaxonomy(): Promise<{ pillars: PillarInfo[]; subcategories: Subcategory[] }> {
  if (!supabase) return { pillars: [], subcategories: [] };

  const [pillarResult, subcategoryResult] = await Promise.all([
    supabase.from('pillars').select('id, label, detail, color').order('sort_order'),
    supabase.from('subcategories').select('id, pillar, label, short_label, description, color').order('sort_order'),
  ]);
  if (pillarResult.error) throw pillarResult.error;
  if (subcategoryResult.error) throw subcategoryResult.error;

  return {
    pillars: (pillarResult.data ?? []).map((row) => ({
      id: row.id as Pillar,
      label: row.label,
      detail: row.detail,
      color: row.color,
    })),
    subcategories: (subcategoryResult.data ?? []).map((row) => ({
      id: row.id as SubcategoryId,
      pillar: row.pillar as Pillar,
      label: row.label,
      shortLabel: row.short_label,
      description: row.description,
      color: row.color,
    })),
  };
}