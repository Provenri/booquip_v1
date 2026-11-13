create table public.chart_sources (
  id text primary key,
  provider text not null check (length(trim(provider)) > 0),
  market_code text not null check (market_code ~ '^[A-Z]{2}$'),
  language_code text not null check (length(language_code) between 2 and 12),
  list_id text not null,
  list_name text not null,
  chart_kind text not null check (chart_kind in ('bestseller', 'audio_bestseller')),
  source_url text not null check (source_url ~ '^https://'),
  terms_url text not null check (terms_url ~ '^https://'),
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  unique (provider, market_code, list_id)
);

create table public.chart_entries (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.chart_sources (id) on delete restrict,
  chart_date date not null,
  rank integer not null check (rank > 0),
  title text not null,
  author text not null default '',
  isbn13 text,
  source_item_id text,
  source_url text not null check (source_url ~ '^https://'),
  entry_key text not null unique,
  book_id text references public.books (id) on delete set null,
  match_status text not null default 'pending' check (match_status in ('pending', 'matched', 'needs_review', 'no_match')),
  matched_by text check (matched_by in ('isbn', 'title_author', 'manual')),
  created_at timestamptz not null default now(),
  unique (source_id, chart_date, rank),
  check ((match_status = 'matched' and book_id is not null and matched_by is not null) or
    (match_status <> 'matched' and matched_by is null))
);

create index chart_entries_book_date_idx on public.chart_entries (book_id, chart_date desc) where match_status = 'matched';
create index chart_entries_market_date_idx on public.chart_entries (source_id, chart_date desc, rank);
create index chart_entries_review_idx on public.chart_entries (match_status, chart_date desc) where match_status <> 'matched';

create table public.openlibrary_book_links (
  book_id text primary key references public.books (id) on delete cascade,
  work_key text not null check (work_key ~ '^/works/OL[0-9]+W$'),
  edition_key text check (edition_key is null or edition_key ~ '^/books/OL[0-9]+M$'),
  matched_by text not null check (matched_by in ('isbn', 'manual')),
  verified_at timestamptz not null default now()
);

create table public.openlibrary_activity_snapshots (
  book_id text not null references public.books (id) on delete cascade,
  snapshot_date date not null,
  ratings_count integer not null check (ratings_count >= 0),
  ratings_average numeric(3, 2) check (ratings_average is null or (ratings_average >= 0 and ratings_average <= 5)),
  source_url text not null check (source_url ~ '^https://openlibrary[.]org/works/OL[0-9]+W/ratings[.]json$'),
  primary key (book_id, snapshot_date)
);

create index openlibrary_snapshots_date_idx on public.openlibrary_activity_snapshots (snapshot_date desc);

alter table public.chart_sources enable row level security;
alter table public.chart_entries enable row level security;
alter table public.openlibrary_book_links enable row level security;
alter table public.openlibrary_activity_snapshots enable row level security;

create policy "Enabled chart sources are readable"
  on public.chart_sources for select to anon, authenticated using (enabled);
create policy "Matched entries from enabled charts are readable"
  on public.chart_entries for select to anon, authenticated
  using (match_status = 'matched' and exists (
    select 1 from public.chart_sources s where s.id = source_id and s.enabled
  ) and exists (
    select 1 from public.books b where b.id = book_id and b.is_active
  ));
create policy "Open Library links are readable"
  on public.openlibrary_book_links for select to anon, authenticated using (true);
create policy "Open Library snapshots are readable"
  on public.openlibrary_activity_snapshots for select to anon, authenticated using (true);

revoke all on public.chart_sources, public.chart_entries, public.openlibrary_book_links, public.openlibrary_activity_snapshots from public, anon, authenticated;
grant select on public.chart_sources, public.chart_entries, public.openlibrary_book_links, public.openlibrary_activity_snapshots to anon, authenticated;
grant select, insert, update, delete on public.chart_sources, public.chart_entries, public.openlibrary_book_links, public.openlibrary_activity_snapshots to service_role;