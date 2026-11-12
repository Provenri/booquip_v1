create table public.curation_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  feed_url text not null unique check (feed_url ~ '^https://[a-z0-9-]+[.]substack[.]com/feed$'),
  terms_url text not null check (terms_url ~ '^https://'),
  approved_by text,
  approved_at timestamptz,
  enabled boolean not null default false,
  last_imported_at timestamptz,
  created_at timestamptz not null default now(),
  check (not enabled or (approved_at is not null and length(trim(coalesce(approved_by, ''))) > 0))
);

create table public.curation_posts (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.curation_sources (id) on delete cascade,
  title text not null check (length(title) between 1 and 500),
  canonical_url text not null check (canonical_url ~ '^https://'),
  published_at timestamptz,
  imported_at timestamptz not null default now(),
  unique (source_id, canonical_url)
);

create table public.curation_candidates (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.curation_posts (id) on delete cascade,
  book_id text references public.books (id) on delete set null,
  proposed_title text not null check (length(trim(proposed_title)) > 0),
  proposed_author text not null check (length(trim(proposed_author)) > 0),
  proposed_shelf text not null check (proposed_shelf in ('substack-longform-pioneers', 'algorithmic-blockbusters')),
  evidence_type text not null check (evidence_type in ('digital_origin', 'recommendation', 'digital_traction')),
  evidence_url text not null check (evidence_url ~ '^https://'),
  rationale text not null check (length(trim(rationale)) > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'needs_evidence')),
  reviewed_by text,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  check (status not in ('approved', 'rejected') or
    (reviewed_at is not null and length(trim(coalesce(reviewed_by, ''))) > 0 and length(trim(coalesce(review_notes, ''))) > 0)),
  check (status <> 'approved' or evidence_type <> 'recommendation')
);

alter table public.curation_sources enable row level security;
alter table public.curation_posts enable row level security;
alter table public.curation_candidates enable row level security;
revoke all on public.curation_sources, public.curation_posts, public.curation_candidates from public, anon, authenticated;
grant select, insert, update, delete on public.curation_sources, public.curation_posts, public.curation_candidates to service_role;

create function public.import_curation_posts(source_id uuid, posts jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  source public.curation_sources%rowtype;
  inserted integer;
begin
  select * into source from public.curation_sources s where s.id = source_id for update;
  if not found or not source.enabled or source.approved_at is null then
    raise exception 'Source is not approved and enabled';
  end if;
  if source.last_imported_at > now() - interval '24 hours' then
    raise exception 'Source was already imported within the last 24 hours';
  end if;
  if jsonb_typeof(posts) <> 'array' or jsonb_array_length(posts) > 20 then
    raise exception 'Expected at most 20 metadata records';
  end if;
  insert into public.curation_posts (source_id, title, canonical_url, published_at)
  select source.id, p.title, p.canonical_url, p.published_at
  from jsonb_to_recordset(posts) as p(title text, canonical_url text, published_at timestamptz)
  on conflict on constraint curation_posts_source_id_canonical_url_key do nothing;
  get diagnostics inserted = row_count;
  update public.curation_sources set last_imported_at = now() where id = source.id;
  return inserted;
end;
$$;

revoke all on function public.import_curation_posts(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.import_curation_posts(uuid, jsonb) to service_role;