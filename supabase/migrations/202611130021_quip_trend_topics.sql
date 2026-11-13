create table public.quip_trend_topics (
  id uuid primary key default gen_random_uuid(),
  country_code text not null check (country_code in ('US', 'UK')),
  topic text not null check (length(trim(topic)) between 1 and 200),
  published_at timestamptz not null,
  source_url text not null check (source_url ~ '^https://'),
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (country_code, topic, published_at)
);

create index quip_trend_topics_country_date_idx
  on public.quip_trend_topics (country_code, published_at desc);

alter table public.quip_trend_topics enable row level security;

create policy "Unexpired Quip topics are readable"
  on public.quip_trend_topics for select to anon, authenticated
  using (expires_at > now());

revoke all on public.quip_trend_topics from public, anon, authenticated;
grant select on public.quip_trend_topics to anon, authenticated;
grant select, insert, update, delete on public.quip_trend_topics to service_role;