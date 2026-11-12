alter table public.book_adaptations
  add column tmdb_cast text[] not null default '{}',
  add column tmdb_cast_checked_at timestamptz;