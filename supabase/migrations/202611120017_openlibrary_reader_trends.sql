alter table public.chart_sources
  drop constraint chart_sources_market_code_check,
  add constraint chart_sources_market_code_check
    check (market_code = 'GLOBAL' or market_code ~ '^[A-Z]{2}$'),
  drop constraint chart_sources_chart_kind_check,
  add constraint chart_sources_chart_kind_check
    check (chart_kind in ('bestseller', 'audio_bestseller', 'reader_trend'));

insert into public.chart_sources (
  id,
  provider,
  market_code,
  language_code,
  list_id,
  list_name,
  chart_kind,
  source_url,
  terms_url,
  enabled
)
values (
  'openlibrary-global-weekly-trending',
  'openlibrary',
  'GLOBAL',
  'und',
  'weekly',
  'Open Library Weekly Trending',
  'reader_trend',
  'https://openlibrary.org/trending/weekly.json',
  'https://openlibrary.org/developers/api',
  true
)
on conflict (id) do nothing;