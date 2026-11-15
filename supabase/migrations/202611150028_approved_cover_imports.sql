alter table public.books
  add column cover_source_url text,
  add column hosted_cover_url text check (hosted_cover_url is null or hosted_cover_url ~ '^https://');

update public.books set cover_source_url = cover_url;

create function public.preserve_hosted_book_cover()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.hosted_cover_url is not null then
    if new.cover_url is distinct from new.hosted_cover_url then
      new.cover_source_url := new.cover_url;
    end if;
    new.cover_url := new.hosted_cover_url;
  else
    if tg_op = 'UPDATE' then
      if old.hosted_cover_url is not null and new.cover_url = old.hosted_cover_url then
        new.cover_url := old.cover_source_url;
      end if;
    end if;
    new.cover_source_url := new.cover_url;
  end if;
  return new;
end;
$$;

create trigger preserve_hosted_book_cover
before insert or update of cover_url, hosted_cover_url on public.books
for each row execute function public.preserve_hosted_book_cover();

create table public.book_cover_imports (
  book_id text primary key references public.books (id) on delete cascade,
  source_url text not null check (source_url ~ '^https://'),
  approved_for_rehosting boolean not null default false,
  permission_reference text,
  status text not null default 'pending' check (status in ('pending', 'published', 'failed')),
  attempted_at timestamptz,
  published_at timestamptz,
  original_cover_url text,
  object_path text,
  public_url text,
  checksum text,
  last_error text,
  check (not approved_for_rehosting or
    (permission_reference is not null and length(trim(permission_reference)) > 0))
);

alter table public.book_cover_imports enable row level security;
revoke all on public.book_cover_imports from public, anon, authenticated;
grant select, insert, update, delete on public.book_cover_imports to service_role;

create function public.queue_book_cover_import()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source text := coalesce(new.cover_source_url,
    case when new.isbn is not null then 'https://covers.openlibrary.org/b/isbn/' || new.isbn || '-L.jpg' end);
begin
  if source ~ '^https://' then
    insert into public.book_cover_imports (book_id, source_url)
    values (new.id, source) on conflict (book_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger queue_book_cover_import
after insert or update of cover_url, cover_source_url, isbn on public.books
for each row execute function public.queue_book_cover_import();

insert into public.book_cover_imports (book_id, source_url)
select id, coalesce(cover_source_url, 'https://covers.openlibrary.org/b/isbn/' || isbn || '-L.jpg')
from public.books where cover_source_url is not null or isbn is not null;

create function public.reset_book_cover_import()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if row(new.source_url, new.approved_for_rehosting, new.permission_reference)
      is distinct from row(old.source_url, old.approved_for_rehosting, old.permission_reference) then
    new.status := 'pending';
    new.attempted_at := null;
    new.published_at := null;
    new.original_cover_url := null;
    new.object_path := null;
    new.public_url := null;
    new.checksum := null;
    new.last_error := null;
  end if;
  return new;
end;
$$;

create trigger reset_book_cover_import
before update on public.book_cover_imports
for each row execute function public.reset_book_cover_import();

create function public.publish_approved_book_cover(
  p_book_id text,
  p_source_url text,
  p_permission_reference text,
  p_attempted_at timestamptz,
  p_original_cover_url text,
  p_object_path text,
  p_public_url text,
  p_checksum text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  approval public.book_cover_imports%rowtype;
  current_book public.books%rowtype;
begin
  select * into approval from public.book_cover_imports
  where book_id = p_book_id for update;
  if not found or not approval.approved_for_rehosting
      or approval.status = 'published'
      or approval.attempted_at is null
      or approval.source_url is distinct from p_source_url
      or approval.permission_reference is distinct from p_permission_reference
      or approval.attempted_at is distinct from p_attempted_at then
    raise exception 'Cover approval or import attempt changed; publication cancelled';
  end if;
  if p_checksum is null or p_checksum !~ '^[a-f0-9]{64}$'
      or p_object_path is distinct from p_book_id || '/' || p_checksum || '.jpg'
      or p_public_url is null or p_public_url !~ '^https://'
      or right(p_public_url, length('/storage/v1/object/public/book-covers/' || p_object_path))
        <> '/storage/v1/object/public/book-covers/' || p_object_path then
    raise exception 'Invalid hosted cover path';
  end if;
  if not exists (
    select 1 from storage.objects where bucket_id = 'book-covers' and name = p_object_path
  ) then
    raise exception 'Uploaded cover is missing';
  end if;
  select * into current_book from public.books where id = p_book_id for update;
  if not found or current_book.cover_url is distinct from p_original_cover_url then
    raise exception 'Catalog cover changed during import; publication cancelled';
  end if;
  update public.books
  set cover_url = p_public_url,
      hosted_cover_url = p_public_url
  where id = p_book_id;
  update public.book_cover_imports
  set status = 'published', published_at = now(), original_cover_url = p_original_cover_url,
      object_path = p_object_path, public_url = p_public_url, checksum = p_checksum, last_error = null
  where book_id = p_book_id;
end;
$$;

revoke all on function public.publish_approved_book_cover(text, text, text, timestamptz, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.publish_approved_book_cover(text, text, text, timestamptz, text, text, text, text)
  to service_role;
