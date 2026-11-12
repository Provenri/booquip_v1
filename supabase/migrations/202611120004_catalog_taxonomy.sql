create table public.pillars (
  id text primary key,
  label text not null,
  detail text not null,
  color text not null,
  sort_order integer not null unique check (sort_order > 0)
);

create table public.subcategories (
  id text primary key,
  pillar text not null references public.pillars (id) on update cascade on delete restrict,
  label text not null,
  short_label text not null,
  description text not null,
  color text not null,
  sort_order integer not null unique check (sort_order > 0)
);

insert into public.pillars (id, label, detail, color, sort_order)
values
  ('screen', 'Screen', 'Stories made for the screen', '#d97452', 1),
  ('civilization', 'Civilization', 'Ideas that shaped our world', '#477d6c', 2),
  ('digital', 'Digital', 'Books finding a new audience', '#6177a2', 3)
on conflict (id) do update set
  label = excluded.label,
  detail = excluded.detail,
  color = excluded.color,
  sort_order = excluded.sort_order;

insert into public.subcategories (id, pillar, label, short_label, description, color, sort_order)
values
  ('launchpad', 'screen', 'The Launchpad', 'Launchpad', 'Books with screen adaptations on the horizon.', '#d97452', 1),
  ('oscar-gold-standard', 'screen', 'Oscar Gold Standard', 'Oscar Gold', 'Books behind award-winning films.', '#bd5d48', 2),
  ('streaming-universe', 'screen', 'Streaming Universe', 'Streaming', 'Stories expanded into multi-season television.', '#ed9b67', 3),
  ('blueprints-of-power', 'civilization', 'Blueprints of Power', 'Power', 'Political and social ideas that shape how we live.', '#477d6c', 4),
  ('scientific-paradigm-shifts', 'civilization', 'Scientific Paradigm Shifts', 'Science', 'Books that changed how we understand the world.', '#67917a', 5),
  ('forbidden-shelves', 'civilization', 'The Forbidden Shelves', 'Forbidden', 'Challenged and banned books that still provoke debate.', '#829e79', 6),
  ('substack-longform-pioneers', 'digital', 'Substack & Longform Pioneers', 'Longform', 'Digital essays and long-form writing gathered into books.', '#6177a2', 7),
  ('algorithmic-blockbusters', 'digital', 'Algorithmic Blockbusters', 'BookTok', 'Reader-driven hits taking off across online communities.', '#778fb5', 8)
on conflict (id) do update set
  pillar = excluded.pillar,
  label = excluded.label,
  short_label = excluded.short_label,
  description = excluded.description,
  color = excluded.color,
  sort_order = excluded.sort_order;

alter table public.books
  add constraint books_pillar_fkey foreign key (pillar)
  references public.pillars (id) on update cascade on delete restrict;

alter table public.books
  add constraint books_subcategory_fkey foreign key (subcategory)
  references public.subcategories (id) on update cascade on delete restrict;

alter table public.pillars enable row level security;
alter table public.subcategories enable row level security;

create policy "Pillars are readable by everyone"
  on public.pillars for select
  to anon, authenticated
  using (true);

create policy "Subcategories are readable by everyone"
  on public.subcategories for select
  to anon, authenticated
  using (true);

grant select on public.pillars to anon, authenticated;
grant select on public.subcategories to anon, authenticated;