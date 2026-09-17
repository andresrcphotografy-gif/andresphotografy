import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";

type GateSession = { unlocked?: boolean };

function sessionConfig() {
  return {
    password: process.env["SESSION_SECRET"]!,
    name: "ap-photographer",
    maxAge: 60 * 60 * 24 * 30,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "lax" as const,
      path: "/",
    },
  };
}

function pinMatches(input: string, expected: string) {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

async function requirePhotographer() {
  const session = await useSession<GateSession>(sessionConfig());
  if (!session.data.unlocked) throw new Error("PIN_REQUIRED");
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

export const photographerStatus = createServerFn({ method: "GET" }).handler(
  async () => {
    const session = await useSession<GateSession>(sessionConfig());
    return { unlocked: session.data.unlocked === true };
  },
);

export const unlockPhotographer = createServerFn({ method: "POST" })
  .inputValidator((data: { pin: string }) => ({ pin: String(data.pin ?? "") }))
  .handler(async ({ data }) => {
    const expected = process.env["PHOTOGRAPHER_PIN"];
    if (!expected) throw new Error("PHOTOGRAPHER_PIN no está configurada");
    if (!data.pin || !pinMatches(data.pin, expected)) {
      return { ok: false as const };
    }
    const session = await useSession<GateSession>(sessionConfig());
    await session.update({ unlocked: true });
    return { ok: true as const };
  });

export const lockPhotographer = createServerFn({ method: "POST" }).handler(
  async () => {
    const session = await useSession<GateSession>(sessionConfig());
    await session.clear();
    return { ok: true as const };
  },
);

/** Devuelve una URL firmada para que el navegador suba un archivo al bucket privado. */
export const createPhotoUploadUrl = createServerFn({ method: "POST" })
  .inputValidator((data: { matchId: string; fileName: string; kind?: string }) => ({
    matchId: String(data.matchId),
    fileName: String(data.fileName),
    kind: data.kind ? String(data.kind) : undefined,
  }))
  .handler(async ({ data }) => {
    await requirePhotographer();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: match, error: matchErr } = await supabaseAdmin
      .from("matches")
      .select("id")
      .eq("id", data.matchId)
      .maybeSingle();
    if (matchErr) throw matchErr;
    if (!match) throw new Error("Partido no encontrado");

    const name = safeName(data.fileName);
    const path = data.kind
      ? `${data.matchId}/_meta/${safeName(data.kind)}-${crypto.randomUUID()}-${name}`
      : `${data.matchId}/${crypto.randomUUID()}-${name}`;

    const { data: signed, error } = await supabaseAdmin.storage
      .from("photos")
      .createSignedUploadUrl(path);
    if (error) throw error;
    return { path: signed.path, token: signed.token };
  });

export const registerPhoto = createServerFn({ method: "POST" })
  .inputValidator((data: { matchId: string; path: string; fileName: string }) => ({
    matchId: String(data.matchId),
    path: String(data.path),
    fileName: String(data.fileName),
  }))
  .handler(async ({ data }) => {
    await requirePhotographer();
    if (!data.path.startsWith(`${data.matchId}/`)) {
      throw new Error("Ruta no válida");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("photos")
      .insert({
        match_id: data.matchId,
        storage_path: data.path,
        file_name: data.fileName,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true as const, id: row.id as string };
  });

/** Guarda los vectores de rostro (128 dimensiones) de una foto. */
export const saveFaces = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { photoId: string; matchId: string; descriptors: number[][] }) => ({
      photoId: String(data.photoId),
      matchId: String(data.matchId),
      descriptors: Array.isArray(data.descriptors) ? data.descriptors : [],
    }),
  )
  .handler(async ({ data }) => {
    await requirePhotographer();
    const rows = data.descriptors
      .filter((d) => Array.isArray(d) && d.length === 128)
      .map((d) => ({
        photo_id: data.photoId,
        match_id: data.matchId,
        embedding: JSON.stringify(d),
      }));
    if (rows.length === 0) return { ok: true as const, saved: 0 };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("face_embeddings").insert(rows);
    if (error) throw error;
    return { ok: true as const, saved: rows.length };
  });

/** Fotos del partido que aún no tienen rostros analizados. */
export const pendingFacePhotos = createServerFn({ method: "POST" })
  .inputValidator((data: { matchId: string }) => ({ matchId: String(data.matchId) }))
  .handler(async ({ data }) => {
    await requirePhotographer();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: photos, error }, { data: indexed }] = await Promise.all([
      supabaseAdmin
        .from("photos")
        .select("id, storage_path")
        .eq("match_id", data.matchId)
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("face_embeddings")
        .select("photo_id")
        .eq("match_id", data.matchId),
    ]);
    if (error) throw error;
    const done = new Set((indexed ?? []).map((r) => r.photo_id));
    return (photos ?? [])
      .filter((p) => !done.has(p.id))
      .map((p) => ({ id: p.id as string, storage_path: p.storage_path as string }));
  });

export const setMatchAssets = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      matchId: string;
      coverPath?: string | null;
      homeLogoPath?: string | null;
      awayLogoPath?: string | null;
    }) => data,
  )
  .handler(async ({ data }) => {
    await requirePhotographer();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("matches")
      .update({
        cover_path: data.coverPath ?? null,
        home_logo_path: data.homeLogoPath ?? null,
        away_logo_path: data.awayLogoPath ?? null,
      })
      .eq("id", data.matchId);
    if (error) throw error;
    return { ok: true as const };
  });

export const deletePhotoFn = createServerFn({ method: "POST" })
  .inputValidator((data: { photoId: string }) => ({ photoId: String(data.photoId) }))
  .handler(async ({ data }) => {
    await requirePhotographer();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: photo, error: readErr } = await supabaseAdmin
      .from("photos")
      .select("id, storage_path")
      .eq("id", data.photoId)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!photo) return { ok: true as const };

    await supabaseAdmin.storage.from("photos").remove([photo.storage_path]);
    const { error } = await supabaseAdmin.from("photos").delete().eq("id", photo.id);
    if (error) throw error;
    return { ok: true as const };
  });

export const deleteMatchFn = createServerFn({ method: "POST" })
  .inputValidator((data: { matchId: string }) => ({ matchId: String(data.matchId) }))
  .handler(async ({ data }) => {
    await requirePhotographer();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: photos } = await supabaseAdmin
      .from("photos")
      .select("storage_path")
      .eq("match_id", data.matchId);
    const paths = (photos ?? []).map((p) => p.storage_path);
    if (paths.length > 0) {
      await supabaseAdmin.storage.from("photos").remove(paths);
    }
    const { error } = await supabaseAdmin
      .from("matches")
      .delete()
      .eq("id", data.matchId);
    if (error) throw error;
    return { ok: true as const };
  });

export const deleteCommentFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => ({ id: String(data.id) }))
  .handler(async ({ data }) => {
    await requirePhotographer();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("match_comments")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });

/** Quita el "me gusta" solo de la fila que pertenece a este navegador. */
export const removeLike = createServerFn({ method: "POST" })
  .inputValidator((data: { matchId: string; clientId: string }) => ({
    matchId: String(data.matchId),
    clientId: String(data.clientId),
  }))
  .handler(async ({ data }) => {
    if (!data.clientId) throw new Error("clientId requerido");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("match_likes")
      .delete()
      .eq("match_id", data.matchId)
      .eq("client_id", data.clientId);
    if (error) throw error;
    return { ok: true as const };
  });

/** Guarda los dorsales y las etiquetas de una foto (solo el fotógrafo). */
export const setPhotoLabels = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { photoId: string; dorsals: number[]; tags: string[] }) => ({
      photoId: String(data.photoId),
      dorsals: Array.isArray(data.dorsals) ? data.dorsals : [],
      tags: Array.isArray(data.tags) ? data.tags : [],
    }),
  )
  .handler(async ({ data }) => {
    await requirePhotographer();
    const dorsals = Array.from(
      new Set(
        data.dorsals
          .map((n) => Math.trunc(Number(n)))
          .filter((n) => Number.isFinite(n) && n >= 1 && n <= 100),
      ),
    ).sort((a, b) => a - b);
    const tags = Array.from(
      new Set(data.tags.map((t) => String(t)).filter((t) => t.length > 0)),
    ).slice(0, 12);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("photos")
      .update({ dorsals, tags })
      .eq("id", data.photoId);
    if (error) throw error;
    return { ok: true as const, dorsals, tags };
  });
