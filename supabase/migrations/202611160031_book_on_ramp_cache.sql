create table public.book_on_ramp_cache (
  book_id text primary key references public.books (id) on delete cascade,
  on_ramp text not null check (length(btrim(on_ramp)) between 1 and 1200),
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  prompt_version text not null,
  model text not null,
  generated_at timestamptz not null default now()
);

alter table public.book_on_ramp_cache enable row level security;

create policy "Book on-ramps are readable by everyone"
  on public.book_on_ramp_cache for select
  to anon, authenticated
  using (true);

grant select on public.book_on_ramp_cache to anon, authenticated;
grant select, insert, update, delete on public.book_on_ramp_cache to service_role;

create function public.invalidate_book_on_ramp_on_source_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.title is distinct from new.title
    or old.author is distinct from new.author
    or old.published_year is distinct from new.published_year
    or old.note is distinct from new.note then
    delete from public.book_on_ramp_cache where book_id = old.id;
  end if;
  return new;
end;
$$;

revoke all on function public.invalidate_book_on_ramp_on_source_change() from public, anon, authenticated;

create trigger invalidate_book_on_ramp_after_source_change
  after update of title, author, published_year, note on public.books
  for each row execute function public.invalidate_book_on_ramp_on_source_change();

create function public.save_book_on_ramp_cache(
  p_book_id text,
  p_title text,
  p_author text,
  p_published_year integer,
  p_note text,
  p_on_ramp text,
  p_source_hash text,
  p_prompt_version text,
  p_model text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_book public.books%rowtype;
begin
  select * into current_book from public.books where id = p_book_id for update;
  if not found or current_book.title is distinct from p_title
    or current_book.author is distinct from p_author
    or current_book.published_year is distinct from p_published_year
    or current_book.note is distinct from p_note then
    raise exception 'Book source changed during 30-second read generation; retry.';
  end if;
  insert into public.book_on_ramp_cache (book_id, on_ramp, source_hash, prompt_version, model, generated_at)
  values (p_book_id, p_on_ramp, p_source_hash, p_prompt_version, p_model, now())
  on conflict (book_id) do update set
    on_ramp = excluded.on_ramp, source_hash = excluded.source_hash,
    prompt_version = excluded.prompt_version, model = excluded.model, generated_at = excluded.generated_at;
end;
$$;

revoke all on function public.save_book_on_ramp_cache(text, text, text, integer, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.save_book_on_ramp_cache(text, text, text, integer, text, text, text, text, text) to service_role;
