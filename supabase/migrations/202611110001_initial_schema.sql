create table public.books (
  id text primary key,
  title text not null,
  author text not null,
  published_year integer not null,
  isbn text not null,
  pillar text not null check (pillar in ('screen', 'civilization', 'digital')),
  note text not null,
  cover_color text not null,
  created_at timestamptz not null default now()
);

insert into public.books (id, title, author, published_year, isbn, pillar, note, cover_color)
values
  ('dune', 'Dune', 'Frank Herbert', 1965, '9780441172719', 'screen', 'A young heir steps into a struggle over the most valuable resource in the universe.', '#d8a56a'),
  ('handmaids-tale', 'The Handmaid''s Tale', 'Margaret Atwood', 1985, '9780385490818', 'screen', 'A personal account of life under a regime that has turned reproduction into state power.', '#b6534c'),
  ('dawn-of-everything', 'The Dawn of Everything', 'David Graeber & David Wengrow', 2021, '9780374157357', 'civilization', 'An expansive challenge to familiar stories about the origins of inequality and society.', '#8a9b79'),
  ('sapiens', 'Sapiens', 'Yuval Noah Harari', 2011, '9780062316097', 'civilization', 'A sweeping account of how shared stories helped humans organize at scale.', '#d0a45f'),
  ('fifth-season', 'The Fifth Season', 'N. K. Jemisin', 2015, '9780316229296', 'digital', 'On a world in ecological collapse, three lives converge around a hidden power.', '#7d718e'),
  ('tomorrow-tomorrow-tomorrow', 'Tomorrow, and Tomorrow, and Tomorrow', 'Gabrielle Zevin', 2022, '9780593321201', 'digital', 'Two longtime friends build games together and keep finding new ways to begin again.', '#5d8a84')
on conflict (id) do nothing;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  tier text not null default 'free' check (tier in ('free', 'pro')),
  created_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table public.user_swipes (
  user_id uuid not null references auth.users (id) on delete cascade,
  book_id text not null references public.books (id) on delete cascade,
  state text not null check (state in ('tbr', 'read', 'frozen')),
  freeze_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id),
  constraint user_swipes_freeze_state_check check (
    (state = 'frozen' and freeze_until is not null) or
    (state <> 'frozen' and freeze_until is null)
  )
);

create index user_swipes_user_state_idx on public.user_swipes (user_id, state);
create index user_swipes_frozen_until_idx on public.user_swipes (freeze_until)
  where state = 'frozen';

alter table public.books enable row level security;
alter table public.profiles enable row level security;
alter table public.user_swipes enable row level security;

create policy "Books are readable by everyone"
  on public.books for select
  to anon, authenticated
  using (true);

create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

create policy "Users can read their own swipes"
  on public.user_swipes for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can create their own swipes"
  on public.user_swipes for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "Users can update their own swipes"
  on public.user_swipes for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select on public.books to anon, authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update on public.user_swipes to authenticated;