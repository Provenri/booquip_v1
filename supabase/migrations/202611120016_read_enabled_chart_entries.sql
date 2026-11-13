drop policy if exists "Matched entries from enabled charts are readable" on public.chart_entries;

create policy "Entries from enabled charts are readable"
  on public.chart_entries for select to anon, authenticated
  using (exists (
    select 1 from public.chart_sources s where s.id = source_id and s.enabled
  ));