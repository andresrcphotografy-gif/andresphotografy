import { supabase } from "@/integrations/supabase/client";
import {
  createPhotoUploadUrl,
  deleteCommentFn,
  removeLike,
} from "@/lib/photographer.functions";

export type MatchStatus = "upcoming" | "live" | "finished";

export interface Match {
  id: string;
  home_team: string;
  away_team: string;
  match_date: string | null;
  kickoff_time: string | null;
  venue: string | null;
  status: string;
  cover_path: string | null;
  home_logo_path: string | null;
  away_logo_path: string | null;
  created_at: string;
}

export interface Photo {
  id: string;
  match_id: string;
  storage_path: string;
  file_name: string;
  created_at: string;
}

export interface FaceMatch {
  photo_id: string;
  match_id: string;
  storage_path: string;
  file_name: string;
  similarity: number;
}

export async function listMatches() {
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .order("match_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Match[];
}

export async function getMatch(matchId: string) {
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .maybeSingle();
  if (error) throw error;
  return (data as Match | null) ?? null;
}

export async function listPhotos(matchId: string) {
  const { data, error } = await supabase
    .from("photos")
    .select("*")
    .eq("match_id", matchId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as Photo[];
}

export async function countPhotosByMatch() {
  const { data, error } = await supabase.from("photos").select("match_id");
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.match_id] = (counts[row.match_id] ?? 0) + 1;
  }
  return counts;
}

export async function signPhotoUrls(paths: string[]) {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  if (unique.length === 0) return {} as Record<string, string>;
  const { data, error } = await supabase.storage
    .from("photos")
    .createSignedUrls(unique, 3600);
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const s of data ?? []) {
    if (s.path && s.signedUrl) map[s.path] = s.signedUrl;
  }
  return map;
}

/** Portada de cada partido: la subida por el fotógrafo o, si no hay, su primera foto. */
export async function getCovers(matches: Match[]) {
  if (matches.length === 0) return {} as Record<string, string>;
  const chosen: Record<string, string> = {};
  const missing: string[] = [];
  for (const m of matches) {
    if (m.cover_path) chosen[m.id] = m.cover_path;
    else missing.push(m.id);
  }
  if (missing.length > 0) {
    const { data, error } = await supabase
      .from("photos")
      .select("match_id, storage_path, created_at")
      .in("match_id", missing)
      .order("created_at", { ascending: true });
    if (error) throw error;
    for (const row of data ?? []) {
      if (!chosen[row.match_id]) chosen[row.match_id] = row.storage_path;
    }
  }
  const byPath = await signPhotoUrls(Object.values(chosen));
  const covers: Record<string, string> = {};
  for (const [id, path] of Object.entries(chosen)) {
    if (byPath[path]) covers[id] = byPath[path];
  }
  return covers;
}

/** URLs firmadas de los escudos de todos los partidos. */
export async function getLogos(matches: Match[]) {
  const paths = matches.flatMap((m) =>
    [m.home_logo_path, m.away_logo_path].filter(Boolean as never as (v: string | null) => v is string),
  );
  const byPath = await signPhotoUrls(paths);
  const logos: Record<string, { home?: string | undefined; away?: string | undefined }> = {};
  for (const m of matches) {
    logos[m.id] = {
      home: m.home_logo_path ? byPath[m.home_logo_path] : undefined,
      away: m.away_logo_path ? byPath[m.away_logo_path] : undefined,
    };
  }
  return logos;
}

export async function uploadMatchAsset(
  matchId: string,
  kind: "portada" | "escudo-local" | "escudo-visitante",
  file: File,
) {
  const { path, token } = await createPhotoUploadUrl({
    data: { matchId, fileName: file.name, kind },
  });
  const { error } = await supabase.storage
    .from("photos")
    .uploadToSignedUrl(path, token, file, { contentType: file.type });
  if (error) throw error;
  return path;
}

/** Guarda un vector de 128 dimensiones por cada rostro encontrado en una foto. */
export async function saveFaceEmbeddings(
  photoId: string,
  matchId: string,
  descriptors: number[][],
) {
  if (descriptors.length === 0) return;
  const rows = descriptors.map((d) => ({
    photo_id: photoId,
    match_id: matchId,
    embedding: JSON.stringify(d),
  }));
  const { error } = await supabase.from("face_embeddings").insert(rows);
  if (error) throw error;
}

export async function searchFaces(descriptor: number[], matchId: string) {
  const { data, error } = await supabase.rpc("match_faces", {
    query_embedding: JSON.stringify(descriptor),
    similarity_threshold: 0.55,
    match_limit: 100,
    p_match_id: matchId,
  });
  if (error) throw error;
  return (data ?? []) as FaceMatch[];
}

// ---------- Me gusta ----------

export interface MatchComment {
  id: string;
  match_id: string;
  author_name: string;
  content: string;
  created_at: string;
}

/** Identificador anónimo y persistente de este navegador para los "me gusta". */
export function getClientId() {
  const KEY = "ap-client-id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

export async function getLikesByMatch() {
  const { data, error } = await supabase
    .from("match_likes")
    .select("match_id, client_id");
  if (error) throw error;
  const counts: Record<string, number> = {};
  const mine: Record<string, boolean> = {};
  const clientId = getClientId();
  for (const row of data ?? []) {
    counts[row.match_id] = (counts[row.match_id] ?? 0) + 1;
    if (row.client_id === clientId) mine[row.match_id] = true;
  }
  return { counts, mine };
}

export async function toggleLike(matchId: string, liked: boolean) {
  const clientId = getClientId();
  if (liked) {
    await removeLike({ data: { matchId, clientId } });
  } else {
    const { error } = await supabase
      .from("match_likes")
      .insert({ match_id: matchId, client_id: clientId });
    if (error) throw error;
  }
}

// ---------- Comentarios ----------

export async function listComments(matchId: string) {
  const { data, error } = await supabase
    .from("match_comments")
    .select("*")
    .eq("match_id", matchId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as MatchComment[];
}

export async function countCommentsByMatch() {
  const { data, error } = await supabase
    .from("match_comments")
    .select("match_id");
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.match_id] = (counts[row.match_id] ?? 0) + 1;
  }
  return counts;
}

export async function addComment(
  matchId: string,
  authorName: string,
  content: string,
) {
  const { error } = await supabase.from("match_comments").insert({
    match_id: matchId,
    author_name: authorName.trim(),
    content: content.trim(),
  });
  if (error) throw error;
}

/** Solo el fotógrafo (con su clave) puede borrar comentarios. */
export async function deleteComment(id: string) {
  await deleteCommentFn({ data: { id } });
}

export function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(iso: string | null) {
  if (!iso) return "Sin fecha";
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatTime(time: string | null) {
  if (!time) return null;
  return time.slice(0, 5);
}

export function statusLabel(status: string) {
  if (status === "live") return "En vivo";
  if (status === "finished") return "Finalizado";
  return "Próximo";
}
