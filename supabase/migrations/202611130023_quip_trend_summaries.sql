alter table public.quip_trend_topics
  add column summary text check (summary is null or length(trim(summary)) between 1 and 240);
