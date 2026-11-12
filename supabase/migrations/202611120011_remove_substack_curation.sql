drop function if exists public.import_curation_posts(uuid, jsonb, text, text, boolean);
drop function if exists public.import_curation_posts(uuid, jsonb);
drop function if exists public.acquire_curation_import(uuid, uuid);

drop table if exists public.curation_candidates cascade;
drop table if exists public.curation_posts cascade;
drop table if exists public.curation_sources cascade;
drop table if exists public.curation_curators cascade;

alter table public.books drop constraint if exists books_subcategory_check;

update public.subcategories
set id = 'essays-online-culture',
    label = 'Essays & Online Culture',
    short_label = 'Essays',
    description = 'Essay collections and books exploring contemporary online culture.'
where id = 'substack-longform-pioneers';

alter table public.books add constraint books_subcategory_check check (
  (pillar = 'screen' and subcategory in ('launchpad', 'oscar-gold-standard', 'streaming-universe')) or
  (pillar = 'civilization' and subcategory in ('blueprints-of-power', 'scientific-paradigm-shifts', 'forbidden-shelves')) or
  (pillar = 'digital' and subcategory in ('essays-online-culture', 'algorithmic-blockbusters'))
);