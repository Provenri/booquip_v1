alter table public.quip_trend_topics
  add column approx_traffic text check (approx_traffic is null or length(approx_traffic) <= 32);

create table public.quip_trend_news_items (
  id uuid primary key default gen_random_uuid(),
  trend_topic_id uuid not null references public.quip_trend_topics (id) on delete cascade,
  position smallint not null check (position between 1 and 3),
  headline text not null check (length(trim(headline)) between 1 and 300),
  snippet text check (snippet is null or length(snippet) <= 500),
  source_name text not null default '' check (length(source_name) <= 100),
  article_url text not null check (article_url ~ '^https://'),
  unique (trend_topic_id, position),
  unique (trend_topic_id, article_url)
);

create index quip_trend_news_topic_idx
  on public.quip_trend_news_items (trend_topic_id, position);

alter table public.quip_trend_news_items enable row level security;

create policy "News for unexpired Quip topics are readable"
  on public.quip_trend_news_items for select to anon, authenticated
  using (exists (
    select 1 from public.quip_trend_topics t
    where t.id = trend_topic_id and t.expires_at > now()
  ));

revoke all on public.quip_trend_news_items from public, anon, authenticated;
grant select on public.quip_trend_news_items to anon, authenticated;
grant select, insert, update, delete on public.quip_trend_news_items to service_role;