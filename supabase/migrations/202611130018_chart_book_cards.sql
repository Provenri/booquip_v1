alter table public.books
  alter column published_year drop not null,
  alter column isbn drop not null,
  add column cover_url text check (cover_url is null or cover_url ~ '^https://');

alter table public.chart_entries
  add column published_year integer,
  add column short_take text,
  add column cover_url text check (cover_url is null or cover_url ~ '^https://');

alter table public.chart_entries
  drop constraint chart_entries_matched_by_check,
  add constraint chart_entries_matched_by_check
    check (matched_by in ('isbn', 'title_author', 'manual', 'source_item'));