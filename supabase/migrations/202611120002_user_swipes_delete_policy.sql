create policy "Users can delete their own swipes"
  on public.user_swipes for delete
  to authenticated
  using (user_id = (select auth.uid()));

grant delete on public.user_swipes to authenticated;