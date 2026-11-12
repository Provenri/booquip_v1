create table public.curation_curators (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now()
);

alter table public.curation_curators enable row level security;
revoke all on public.curation_curators from public, anon, authenticated;
grant select, insert, update, delete on public.curation_curators to service_role;

alter table public.curation_sources
  add column fetch_lock_until timestamptz,
  add column fetch_lock_token uuid;

create function public.acquire_curation_import(source_id uuid, lease_token uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  source public.curation_sources%rowtype;
begin
  select * into source from public.curation_sources s where s.id = source_id for update;
  if not found or not source.enabled or source.approved_at is null then
    raise exception 'Source is not approved and enabled';
  end if;
  if lease_token is null then
    raise exception 'Import lease token is required';
  end if;
  if source.last_imported_at > now() - interval '24 hours' then
    raise exception 'Source was already imported within the last 24 hours';
  end if;
  if source.fetch_lock_until > now() then
    raise exception 'Another import is in progress';
  end if;
  update public.curation_sources set fetch_lock_until = now() + interval '2 minutes', fetch_lock_token = lease_token
  where id = source.id;
end;
$$;

revoke all on function public.acquire_curation_import(uuid, uuid) from public, anon, authenticated;
grant execute on function public.acquire_curation_import(uuid, uuid) to service_role;