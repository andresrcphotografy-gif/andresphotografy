-- Solo el servidor (clave del fotógrafo) puede subir/borrar archivos del bucket privado.
drop policy if exists "Public upload photo files" on storage.objects;
drop policy if exists "Public delete photo files" on storage.objects;

-- Los visitantes ya no pueden borrar comentarios ni "me gusta" ajenos.
drop policy if exists "Public delete match_comments" on public.match_comments;
drop policy if exists "Public delete match_likes" on public.match_likes;

revoke delete on public.match_comments from anon, authenticated;
revoke delete on public.match_likes from anon, authenticated;
grant all on public.match_comments to service_role;
grant all on public.match_likes to service_role;
grant all on public.photos to service_role;
grant all on public.matches to service_role;
