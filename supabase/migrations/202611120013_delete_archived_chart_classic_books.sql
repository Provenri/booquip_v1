delete from public.books
where pillar in ('charts', 'classics')
  and is_active = false;