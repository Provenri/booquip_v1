alter table public.book_adaptations
  add column tmdb_id bigint,
  add column tmdb_lookup_status text not null default 'pending'
    check (tmdb_lookup_status in ('pending', 'matched', 'not_found', 'ambiguous', 'year_mismatch')),
  add column tmdb_checked_at timestamptz;

create index book_adaptations_tmdb_pending_idx
  on public.book_adaptations (tmdb_lookup_status, id);