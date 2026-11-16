create table public.quip_book_drafts (
  book_id text not null references public.books (id) on delete cascade,
  stance text not null check (stance in ('pro', 'neutral', 'cons')),
  style text not null check (style in ('natural', 'curious', 'witty')),
  topic text not null check (length(btrim(topic)) between 3 and 120),
  topic_reason text not null check (length(btrim(topic_reason)) between 10 and 240),
  reply text not null check (length(btrim(reply)) between 1 and 280),
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  prompt_version text not null,
  model text not null,
  generated_at timestamptz not null default now(),
  primary key (book_id, stance, style)
);

alter table public.quip_book_drafts enable row level security;

create policy "Authenticated users can read ready-made Quips"
  on public.quip_book_drafts for select
  to authenticated
  using (true);

grant select on public.quip_book_drafts to authenticated;
grant select, insert, update, delete on public.quip_book_drafts to service_role;

create function public.invalidate_quip_book_drafts_on_summary_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.title is distinct from new.title
    or old.author is distinct from new.author
    or old.note is distinct from new.note then
    delete from public.quip_book_drafts where book_id = old.id;
  end if;
  return new;
end;
$$;

revoke all on function public.invalidate_quip_book_drafts_on_summary_change() from public, anon, authenticated;

create trigger invalidate_quip_book_drafts_after_book_summary_change
  after update of title, author, note on public.books
  for each row execute function public.invalidate_quip_book_drafts_on_summary_change();
