insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'book-covers',
  'book-covers',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Book covers cannot be uploaded by clients"
  on storage.objects as restrictive for insert to anon, authenticated
  with check (bucket_id <> 'book-covers');

create policy "Book covers cannot be changed by clients"
  on storage.objects as restrictive for update to anon, authenticated
  using (bucket_id <> 'book-covers')
  with check (bucket_id <> 'book-covers');

create policy "Book covers cannot be deleted by clients"
  on storage.objects as restrictive for delete to anon, authenticated
  using (bucket_id <> 'book-covers');
