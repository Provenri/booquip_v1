alter table public.curation_sources
  add column feed_etag text,
  add column feed_last_modified text;

drop function public.import_curation_posts(uuid, jsonb);

create function public.import_curation_posts(
  source_id uuid,
  posts jsonb,
  response_etag text default null,
  response_last_modified text default null,
  not_modified boolean default false
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  source public.curation_sources%rowtype;
  inserted integer := 0;
begin
  select * into source from public.curation_sources s where s.id = source_id for update;
  if not found or not source.enabled or source.approved_at is null then
    raise exception 'Source is not approved and enabled';
  end if;
  if source.last_imported_at > now() - interval '24 hours' then
    raise exception 'Source was already imported within the last 24 hours';
  end if;
  if posts is null or jsonb_typeof(posts) <> 'array' then
    raise exception 'Expected at most 20 metadata records';
  end if;
  if jsonb_array_length(posts) > 20 or not_modified is null then
    raise exception 'Invalid import payload';
  end if;
  if length(response_etag) > 1024 or length(response_last_modified) > 1024 or
    response_etag ~ E'[\r\n]' or response_last_modified ~ E'[\r\n]' then
    raise exception 'Invalid HTTP cache validator';
  end if;
  if not_modified then
    if jsonb_array_length(posts) <> 0 or (source.feed_etag is null and source.feed_last_modified is null) then
      raise exception 'Not-modified response requires cached validators and no posts';
    end if;
  else
    insert into public.curation_posts (source_id, title, canonical_url, published_at)
    select source.id, p.title, p.canonical_url, p.published_at
    from jsonb_to_recordset(posts) as p(title text, canonical_url text, published_at timestamptz)
    on conflict on constraint curation_posts_source_id_canonical_url_key do nothing;
    get diagnostics inserted = row_count;
  end if;
  update public.curation_sources set
    feed_etag = case when not_modified then coalesce(response_etag, source.feed_etag) else response_etag end,
    feed_last_modified = case when not_modified then coalesce(response_last_modified, source.feed_last_modified) else response_last_modified end,
    last_imported_at = now()
  where id = source.id;
  return inserted;
end;
$$;

revoke all on function public.import_curation_posts(uuid, jsonb, text, text, boolean) from public, anon, authenticated;
grant execute on function public.import_curation_posts(uuid, jsonb, text, text, boolean) to service_role;