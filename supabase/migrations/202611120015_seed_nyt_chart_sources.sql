alter table public.openlibrary_book_links
  add column last_checked_at timestamptz;

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
values
  (
    'nyt-us-hardcover-fiction',
    'nyt',
    'US',
    'en',
    'hardcover-fiction',
    'New York Times Hardcover Fiction',
    'bestseller',
    'https://api.nytimes.com/svc/books/v3/lists/current/hardcover-fiction.json',
    'https://developer.nytimes.com/docs/books-product/1/overview',
    false
  ),
  (
    'nyt-us-hardcover-nonfiction',
    'nyt',
    'US',
    'en',
    'hardcover-nonfiction',
    'New York Times Hardcover Nonfiction',
    'bestseller',
    'https://api.nytimes.com/svc/books/v3/lists/current/hardcover-nonfiction.json',
    'https://developer.nytimes.com/docs/books-product/1/overview',
    false
  )
on conflict (id) do nothing;