create extension if not exists vector with schema extensions;

alter table public.matches
  add column if not exists cover_path text,
  add column if not exists home_logo_path text,
  add column if not exists away_logo_path text,
  add column if not exists kickoff_time time,
  add column if not exists status text not null default 'upcoming';

alter table public.matches
  drop constraint if exists matches_status_check;
alter table public.matches
  add constraint matches_status_check check (status in ('upcoming','live','finished'));

create table if not exists public.face_embeddings (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.photos(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  embedding extensions.vector(128) not null,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.face_embeddings to authenticated;
grant select, insert, delete on public.face_embeddings to anon;
grant all on public.face_embeddings to service_role;

alter table public.face_embeddings enable row level security;

drop policy if exists "Public read face_embeddings" on public.face_embeddings;
create policy "Public read face_embeddings" on public.face_embeddings
  for select to anon, authenticated using (true);
drop policy if exists "Public insert face_embeddings" on public.face_embeddings;
create policy "Public insert face_embeddings" on public.face_embeddings
  for insert to anon, authenticated with check (true);
drop policy if exists "Public delete face_embeddings" on public.face_embeddings;
create policy "Public delete face_embeddings" on public.face_embeddings
  for delete to anon, authenticated using (true);

create index if not exists face_embeddings_match_id_idx on public.face_embeddings (match_id);
create index if not exists face_embeddings_photo_id_idx on public.face_embeddings (photo_id);

create or replace function public.match_faces(
  query_embedding extensions.vector(128),
  similarity_threshold double precision default 0.55,
  match_limit integer default 100,
  p_match_id uuid default null
)
returns table (
  photo_id uuid,
  match_id uuid,
  storage_path text,
  file_name text,
  similarity double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select p.id as photo_id,
         p.match_id,
         p.storage_path,
         p.file_name,
         max(1 - (f.embedding <-> query_embedding)) as similarity
  from public.face_embeddings f
  join public.photos p on p.id = f.photo_id
  where (p_match_id is null or f.match_id = p_match_id)
    and (1 - (f.embedding <-> query_embedding)) >= similarity_threshold
  group by p.id, p.match_id, p.storage_path, p.file_name
  order by similarity desc
  limit match_limit
$$;

grant execute on function public.match_faces(extensions.vector(128), double precision, integer, uuid) to anon, authenticated, service_role;