begin;

do $$
declare
  table_name text;
  role_name text;
  operation text;
begin
  foreach table_name in array array['curation_sources', 'curation_posts', 'curation_candidates'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || table_name)::regclass) then
      raise exception 'RLS missing for %', table_name;
    end if;
    foreach role_name in array array['anon', 'authenticated'] loop
      foreach operation in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
        if has_table_privilege(role_name, 'public.' || table_name, operation) then
          raise exception 'Unexpected % access for % to %', operation, role_name, table_name;
        end if;
      end loop;
    end loop;
  end loop;
  foreach role_name in array array['anon', 'authenticated'] loop
    if has_function_privilege(role_name, 'public.import_curation_posts(uuid,jsonb)', 'EXECUTE') then
      raise exception 'Unexpected importer access for %', role_name;
    end if;
  end loop;
end;
$$;

set local role service_role;

do $$
declare
  source_uuid uuid;
  post_uuid uuid;
  candidate_uuid uuid;
  inserted integer;
  fixture jsonb := '[{"title":"Curation fixture", "canonical_url":"https://booquip-validation.substack.com/p/fixture", "published_at":null}]'::jsonb;
begin
  insert into public.curation_sources (name, feed_url, terms_url)
  values ('Rollback-only fixture', 'https://booquip-validation.substack.com/feed', 'https://booquip-validation.substack.com/terms')
  returning id into source_uuid;

  begin
    perform public.import_curation_posts(source_uuid, fixture);
    raise exception 'Unapproved import unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'Source is not approved and enabled' then raise; end if;
  end;

  begin
    update public.curation_sources set enabled = true, approved_at = now() where id = source_uuid;
    raise exception 'Missing reviewer unexpectedly accepted';
  exception when check_violation then null;
  end;
  update public.curation_sources set enabled = true, approved_at = now(), approved_by = 'Validation fixture' where id = source_uuid;

  inserted := public.import_curation_posts(source_uuid, fixture);
  if inserted <> 1 then raise exception 'Expected one imported fixture'; end if;
  begin
    perform public.import_curation_posts(source_uuid, fixture);
    raise exception 'Cooldown unexpectedly bypassed';
  exception when raise_exception then
    if sqlerrm <> 'Source was already imported within the last 24 hours' then raise; end if;
  end;
  update public.curation_sources set last_imported_at = now() - interval '25 hours' where id = source_uuid;
  inserted := public.import_curation_posts(source_uuid, fixture);
  if inserted <> 0 then raise exception 'Duplicate fixture inserted'; end if;

  select id into post_uuid from public.curation_posts where source_id = source_uuid;
  insert into public.curation_candidates (post_id, proposed_title, proposed_author, proposed_shelf, evidence_type, evidence_url, rationale)
  values (post_uuid, 'Fixture book', 'Fixture author', 'substack-longform-pioneers', 'recommendation',
    'https://booquip-validation.substack.com/p/fixture', 'Test only; not a factual classification')
  returning id into candidate_uuid;
  begin
    update public.curation_candidates set status = 'approved', reviewed_by = 'Validation', reviewed_at = now(), review_notes = 'Test' where id = candidate_uuid;
    raise exception 'Recommendation approved as classification';
  exception when check_violation then null;
  end;
  begin
    update public.curation_candidates set evidence_type = 'digital_origin', status = 'approved' where id = candidate_uuid;
    raise exception 'Approval without review unexpectedly accepted';
  exception when check_violation then null;
  end;
  update public.curation_candidates set evidence_type = 'digital_origin', status = 'approved',
    reviewed_by = 'Validation', reviewed_at = now(), review_notes = 'Rollback-only test' where id = candidate_uuid;
end;
$$;

rollback;