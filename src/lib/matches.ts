import { supabase } from "@/integrations/supabase/client";

export interface Match {
  id: string;
  home_team: string;
  away_team: string;
  match_date: string | null;
  venue: string | null;
  created_at: string;
}

export interface Photo {
  id: string;
  match_id: string;
  storage_path: string;
  file_name: string;
  created_at: string;
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

export async function getCovers(matchIds: string[]) {
  if (matchIds.length === 0) return {} as Record<string, string>;
  const { data, error } = await supabase
    .from("photos")
    .select("match_id, storage_path, created_at")
    .in("match_id", matchIds)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const firstPath: Record<string, string> = {};
  for (const row of data ?? []) {
    if (!firstPath[row.match_id]) firstPath[row.match_id] = row.storage_path;
  }
  const paths = Object.values(firstPath);
  if (paths.length === 0) return {} as Record<string, string>;
  const { data: signed, error: signError } = await supabase.storage
    .from("photos")
    .createSignedUrls(paths, 3600);
  if (signError) throw signError;
  const byPath: Record<string, string> = {};
  for (const s of signed ?? []) {
    if (s.path && s.signedUrl) byPath[s.path] = s.signedUrl;
  }
  const covers: Record<string, string> = {};
  for (const [mid, p] of Object.entries(firstPath)) {
    if (byPath[p]) covers[mid] = byPath[p];
  }
  return covers;
}

export async function signPhotoUrls(paths: string[]) {
  if (paths.length === 0) return {} as Record<string, string>;
  const { data, error } = await supabase.storage
    .from("photos")
    .createSignedUrls(paths, 3600);
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const s of data ?? []) {
    if (s.path && s.signedUrl) map[s.path] = s.signedUrl;
  }
  return map;
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
