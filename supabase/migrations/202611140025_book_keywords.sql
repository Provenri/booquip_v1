alter table public.books
  add column keywords text[],
  add column keywords_attempted_at timestamptz,
  add constraint books_keywords_three check (
    keywords is null or (
      cardinality(keywords) = 3
      and array_position(keywords, null) is null
      and length(trim(keywords[1])) between 1 and 32
      and length(trim(keywords[2])) between 1 and 32
      and length(trim(keywords[3])) between 1 and 32
    )
  );

create function public.reset_book_keywords_on_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.title is distinct from old.title
    or new.author is distinct from old.author
    or new.note is distinct from old.note then
    new.keywords := null;
    new.keywords_attempted_at := null;
  end if;
  return new;
end;
$$;

create trigger reset_book_keywords_on_change
  before update of title, author, note on public.books
  for each row execute function public.reset_book_keywords_on_change();
