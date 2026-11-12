alter table public.books
  add column is_active boolean not null default true;

update public.books
set is_active = false
where pillar in ('civilization', 'digital');

alter table public.books drop constraint if exists books_pillar_check;
alter table public.books drop constraint if exists books_subcategory_check;
alter table public.books drop constraint if exists books_subcategory_fkey;
alter table public.books drop column subcategory;

drop table public.subcategories;

update public.pillars set sort_order = 4 where id = 'civilization';
update public.pillars
set id = 'charts', label = 'Charts', detail = 'Books appearing on reading and audiobook charts', sort_order = 2
where id = 'digital';
update public.pillars
set id = 'classics', label = 'Classics', detail = 'Enduring books across ideas and literature', sort_order = 3
where id = 'civilization';

alter table public.books add constraint books_pillar_check
  check (pillar in ('screen', 'charts', 'classics'));

create index books_active_pillar_title_idx on public.books (pillar, title) where is_active;