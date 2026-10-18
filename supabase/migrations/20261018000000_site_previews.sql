-- Site previews: the project's live site, its Netlify site, and an uploaded screenshot.
-- The Netlify token never reaches the database; the `netlify` Edge Function reads it
-- from function secrets and looks sites up by netlify_site_id.

alter table public.projects
  add column site_url text check (site_url is null or site_url ~* '^https://'),
  add column netlify_site_id uuid,
  add column screenshot_path text,
  -- Screenshots live under the owner's folder, so a path can't point at another user's file.
  add constraint screenshot_in_owner_folder
    check (screenshot_path is null or split_part(screenshot_path, '/', 1) = user_id::text);

-- One private bucket. Objects are named <user id>/<project id>/<timestamp>; each user
-- reads and writes only their own folder, and the app shows them through signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-screenshots', 'project-screenshots', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy screenshots_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'project-screenshots' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy screenshots_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'project-screenshots' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy screenshots_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'project-screenshots' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'project-screenshots' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy screenshots_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'project-screenshots' and (storage.foldername(name))[1] = (select auth.uid())::text);
