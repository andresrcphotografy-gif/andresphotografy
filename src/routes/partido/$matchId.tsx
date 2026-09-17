import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Camera,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Loader2,
  MapPin,
  ScanFace,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  formatDate,
  listPhotos,
  signPhotoUrls,
  type Match,
} from "@/lib/matches";
import {
  createPhotoUploadUrl,
  deletePhotoFn,
  pendingFacePhotos,
  registerPhoto,
  saveFaces,
} from "@/lib/photographer.functions";
import {
  PhotographerButton,
  usePhotographer,
} from "@/components/PhotographerGate";
import { SelfieSearchModal } from "@/components/SelfieSearchModal";
import { GalleryFilters } from "@/components/GalleryFilters";
import { PhotoLabels } from "@/components/PhotoLabels";
import { descriptorsFromBlob } from "@/lib/face";
import logoMark from "@/assets/logo-mark.png";
import { MatchComments } from "@/components/MatchComments";

export const Route = createFileRoute("/partido/$matchId")({
  head: () => ({
    meta: [
      { title: "Partido — Andres Photografy" },
      {
        name: "description",
        content:
          "Sube el paquete completo de fotos del partido y revisa la galería.",
      },
      { property: "og:title", content: "Partido — Andres Photografy" },
      {
        property: "og:description",
        content:
          "Sube el paquete completo de fotos del partido y revisa la galería.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MatchPage,
});

interface UploadState {
  total: number;
  done: number;
  running: boolean;
}

function MatchPage() {
  const { matchId } = Route.useParams();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [upload, setUpload] = useState<UploadState>({
    total: 0,
    done: 0,
    running: false,
  });
  const [index, setIndex] = useState<number | null>(null);
  const touchStartX = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSelfie, setShowSelfie] = useState(false);
  const [filterIds, setFilterIds] = useState<string[] | null>(null);
  const [dorsalQuery, setDorsalQuery] = useState("");
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [indexing, setIndexing] = useState<{
    total: number;
    done: number;
    running: boolean;
  }>({ total: 0, done: 0, running: false });

  const { unlocked } = usePhotographer();
  const getUploadUrl = useServerFn(createPhotoUploadUrl);
  const savePhoto = useServerFn(registerPhoto);
  const removePhoto = useServerFn(deletePhotoFn);
  const storeFaces = useServerFn(saveFaces);
  const listPending = useServerFn(pendingFacePhotos);

  const { data: match, isLoading: loadingMatch } = useQuery({
    queryKey: ["match", matchId],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from("matches")
        .select("*")
        .eq("id", matchId)
        .single();
      if (err) throw err;
      return data as Match;
    },
  });

  const { data: photos = [], isLoading: loadingPhotos } = useQuery({
    queryKey: ["photos", matchId],
    queryFn: () => listPhotos(matchId),
  });

  const { data: urls = {} } = useQuery({
    queryKey: ["photo-urls", matchId, photos.length],
    queryFn: () => signPhotoUrls(photos.map((p) => p.storage_path)),
    enabled: photos.length > 0,
  });

  const faceSet = filterIds === null ? null : new Set(filterIds);
  const dorsalNumber = dorsalQuery === "" ? null : Number(dorsalQuery);
  const visible = photos.filter((p) => {
    if (faceSet && !faceSet.has(p.id)) return false;
    if (dorsalNumber !== null && !(p.dorsals ?? []).includes(dorsalNumber))
      return false;
    if (tagFilters.length > 0) {
      const t = p.tags ?? [];
      if (!tagFilters.every((tag) => t.includes(tag))) return false;
    }
    return true;
  });
  const total = visible.length;
  const current = index !== null ? visible[index] : undefined;
  const hasLabelFilters = dorsalQuery !== "" || tagFilters.length > 0;
  const hasAnyFilter = hasLabelFilters || filterIds !== null;

  const clearFilters = () => {
    setDorsalQuery("");
    setTagFilters([]);
    setFilterIds(null);
    setIndex(null);
  };

  const step = useCallback(
    (dir: 1 | -1) => {
      setIndex((i) => {
        if (i === null || total === 0) return i;
        return (i + dir + total) % total;
      });
    },
    [total],
  );

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "Escape") setIndex(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, step]);

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const images = Array.from(files).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (images.length === 0 || upload.running) return;
      setError(null);
      setUpload({ total: images.length, done: 0, running: true });

      let done = 0;
      const failed: string[] = [];
      for (const file of images) {
        try {
          const { path, token } = await getUploadUrl({
            data: { matchId, fileName: file.name },
          });
          const { error: upErr } = await supabase.storage
            .from("photos")
            .uploadToSignedUrl(path, token, file, { contentType: file.type });
          if (upErr) throw upErr;
          const { id } = await savePhoto({
            data: { matchId, path, fileName: file.name },
          });
          // Analiza los rostros de la foto para la búsqueda con selfie.
          try {
            const descriptors = await descriptorsFromBlob(file);
            if (descriptors.length > 0) {
              await storeFaces({ data: { photoId: id, matchId, descriptors } });
            }
          } catch {
            // Si el análisis falla, la foto ya está subida.
          }
        } catch {
          failed.push(file.name);
        }
        done += 1;
        setUpload({ total: images.length, done, running: true });
      }

      setUpload({ total: images.length, done, running: false });
      if (failed.length > 0) {
        setError(
          `${failed.length} ${failed.length === 1 ? "foto no se pudo subir" : "fotos no se pudieron subir"}.`,
        );
      }
      queryClient.invalidateQueries({ queryKey: ["photos", matchId] });
      queryClient.invalidateQueries({ queryKey: ["photo-counts"] });
      queryClient.invalidateQueries({ queryKey: ["covers"] });
    },
    [matchId, queryClient, upload.running, getUploadUrl, savePhoto, storeFaces],
  );

  /** Analiza los rostros de las fotos que ya estaban subidas. */
  const indexExisting = useCallback(async () => {
    if (indexing.running) return;
    setError(null);
    setIndexing({ total: 0, done: 0, running: true });
    try {
      const pending = await listPending({ data: { matchId } });
      if (pending.length === 0) {
        setIndexing({ total: 0, done: 0, running: false });
        setError("Todas las fotos ya están analizadas.");
        return;
      }
      const signed = await signPhotoUrls(pending.map((p) => p.storage_path));
      let done = 0;
      setIndexing({ total: pending.length, done: 0, running: true });
      for (const p of pending) {
        const url = signed[p.storage_path];
        if (url) {
          try {
            const blob = await (await fetch(url)).blob();
            const descriptors = await descriptorsFromBlob(blob);
            if (descriptors.length > 0) {
              await storeFaces({
                data: { photoId: p.id, matchId, descriptors },
              });
            }
          } catch {
            // Sigue con la siguiente foto.
          }
        }
        done += 1;
        setIndexing({ total: pending.length, done, running: true });
      }
      setIndexing({ total: pending.length, done, running: false });
    } catch {
      setIndexing({ total: 0, done: 0, running: false });
      setError("No se pudo analizar los rostros. Inténtalo otra vez.");
    }
  }, [indexing.running, listPending, matchId, storeFaces]);

  const deletePhoto = async (photoId: string) => {
    try {
      await removePhoto({ data: { photoId } });
    } catch {
      setError("No se pudo eliminar la foto.");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["photos", matchId] });
    queryClient.invalidateQueries({ queryKey: ["photo-counts"] });
    queryClient.invalidateQueries({ queryKey: ["covers"] });
    setIndex(null);
  };

  if (loadingMatch) {
    return (
      <div className="relative z-10 grid min-h-screen place-items-center">
        <p className="text-sm text-muted-foreground">Cargando partido…</p>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="relative z-10 grid min-h-screen place-items-center px-4 text-center">
        <div>
          <p className="font-display text-xl font-semibold uppercase">
            Partido no encontrado
          </p>
          <Link
            to="/"
            className="mt-4 inline-block rounded-xl bg-turf px-4 py-2 font-display text-sm font-semibold uppercase text-background"
          >
            Volver
          </Link>
        </div>
      </div>
    );
  }

  const progress =
    upload.total > 0 ? Math.round((upload.done / upload.total) * 100) : 0;

  return (
    <div className="relative z-10 mx-auto max-w-2xl px-4 pb-16 pt-6">
      {/* Header */}
      <header className="animate-rise">
        <div className="flex items-center justify-between gap-2">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-turf"
          >
            <ArrowLeft className="size-4" /> Todos los partidos
          </Link>
          <PhotographerButton />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <img
            src={logoMark}
            alt="Logo de Andres Photografy"
            className="size-10"
            width={40}
            height={40}
          />
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-semibold uppercase leading-tight tracking-tight">
              {match.home_team} <span className="text-turf">vs</span>{" "}
              {match.away_team}
            </h1>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              {formatDate(match.match_date)}
              {match.venue && (
                <>
                  <span aria-hidden>·</span>
                  <MapPin className="size-3" />
                  {match.venue}
                </>
              )}
              <span aria-hidden>·</span>
              <span className="text-turf">
                {total} {total === 1 ? "foto" : "fotos"}
              </span>
            </p>
          </div>
        </div>
      </header>

      {/* Dropzone (solo con la clave del fotógrafo) */}
      {unlocked && (
        <section className="animate-rise-1 mt-5">
          <div
            role="button"
            tabIndex={0}
            aria-label="Subir paquete de fotos"
            onClick={() => fileInput.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") fileInput.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              uploadFiles(e.dataTransfer.files);
            }}
            className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
              dragging
                ? "border-turf bg-turf/10"
                : "border-turf/40 bg-turf/5 hover:border-turf/70"
            }`}
          >
            <div className="mx-auto grid size-12 place-items-center rounded-xl bg-turf/15">
              <Upload className="size-6 text-turf" />
            </div>
            <p className="mt-3 font-display text-base font-semibold uppercase tracking-wide">
              Suelta aquí todo el paquete
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              JPG · PNG · selecciona todas las fotos del partido de una vez
            </p>
            <span className="mt-4 inline-flex items-center gap-2 rounded-xl border border-turf/40 bg-turf/10 px-5 py-2.5 font-display text-sm font-semibold uppercase tracking-wide text-turf">
              <ImagePlus className="size-4" /> Elegir fotos
            </span>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) uploadFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {(upload.running || upload.done > 0) && upload.total > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {upload.running
                    ? `Subiendo paquete · ${upload.done} de ${upload.total}`
                    : `Paquete subido · ${upload.done} de ${upload.total}`}
                </span>
                <span className="font-medium text-turf">{progress}%</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-pitch to-turf transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </section>
      )}

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      {/* Búsqueda con selfie */}
      {photos.length > 0 && (
        <section className="animate-rise-1 mt-5">
          <button
            type="button"
            onClick={() => setShowSelfie(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-turf py-3.5 font-display text-sm font-semibold uppercase tracking-wide text-background shadow-[0_8px_24px_oklch(0.72_0.16_155/0.25)] transition-transform active:scale-95"
          >
            <ScanFace className="size-5" /> Buscar mis fotos con selfie
          </button>
          {filterIds !== null && (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-turf/30 bg-turf/10 px-3 py-2">
              <p className="text-xs text-turf">
                {filterIds.length === 0
                  ? "No encontramos fotos con esa cara."
                  : `Mostrando ${filterIds.length} ${filterIds.length === 1 ? "foto" : "fotos"} donde apareces.`}
              </p>
              <button
                type="button"
                onClick={() => {
                  setFilterIds(null);
                  setIndex(null);
                }}
                className="shrink-0 rounded-lg border border-turf/40 px-2.5 py-1 font-display text-[11px] font-semibold uppercase tracking-wide text-turf"
              >
                Ver todas
              </button>
            </div>
          )}

          {unlocked && (
            <div className="mt-2">
              <button
                type="button"
                onClick={indexExisting}
                disabled={indexing.running}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card/60 py-2.5 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground disabled:opacity-60"
              >
                {indexing.running ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Analizando
                    rostros · {indexing.done} de {indexing.total}
                  </>
                ) : (
                  <>
                    <ScanFace className="size-4" /> Analizar rostros de las
                    fotos ya subidas
                  </>
                )}
              </button>
            </div>
          )}
        </section>
      )}

      {/* Gallery */}
      <section className="animate-rise-2 mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide">
            Galería
          </h2>
          <span className="text-xs text-muted-foreground">
            {total} {total === 1 ? "imagen" : "imágenes"}
          </span>
        </div>

        {photos.length > 0 && (
          <div className="mb-3">
            <GalleryFilters
              dorsal={dorsalQuery}
              onDorsalChange={(v) => {
                setDorsalQuery(v);
                setIndex(null);
              }}
              tags={tagFilters}
              onToggleTag={(tag) => {
                setIndex(null);
                setTagFilters((t) =>
                  t.includes(tag) ? t.filter((x) => x !== tag) : [...t, tag],
                );
              }}
              hasFilters={hasAnyFilter}
              onClear={clearFilters}
            />
          </div>
        )}

        {loadingPhotos ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Cargando fotos…
          </p>
        ) : total === 0 ? (
          <div className="frost rounded-2xl border border-dashed border-border p-10 text-center">
            <Camera className="mx-auto size-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">
              {photos.length === 0
                ? "Este partido aún no tiene fotos."
                : dorsalQuery !== ""
                  ? `No se encontraron fotos para el dorsal #${dorsalQuery} en este partido.`
                  : tagFilters.length > 0
                    ? `No hay fotos de ${tagFilters.join(" + ")} en este partido.`
                    : "No encontramos fotos con esa cara. Prueba con otro selfie."}
            </p>
            {hasAnyFilter && (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-3 inline-flex rounded-xl border border-turf/40 bg-turf/10 px-4 py-2 font-display text-[11px] font-semibold uppercase tracking-wide text-turf"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {visible.map((p, i) =>
              urls[p.storage_path] ? (
                <button
                  key={p.id}
                  type="button"
                  aria-label={`Ver foto ${i + 1} de ${total}`}
                  onClick={() => setIndex(i)}
                  className="group relative aspect-square overflow-hidden rounded-xl bg-panel"
                >
                  <img
                    src={urls[p.storage_path]}
                    alt={p.file_name}
                    loading="lazy"
                    className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  {(p.dorsals ?? []).length > 0 && (
                    <span className="absolute left-1 top-1 flex flex-wrap gap-1">
                      {(p.dorsals ?? []).slice(0, 3).map((d) => (
                        <span
                          key={d}
                          className="rounded-md bg-background/80 px-1.5 py-0.5 font-display text-[10px] font-semibold text-turf backdrop-blur"
                        >
                          #{d}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              ) : (
                <div
                  key={p.id}
                  className="aspect-square animate-pulse rounded-xl bg-panel"
                />
              ),
            )}
          </div>
        )}
      </section>

      {/* Comentarios */}
      <MatchComments matchId={matchId} />

      {/* Visor con paso de fotos */}
      {current && urls[current.storage_path] && (
        <div
          className="fixed inset-0 z-40 flex flex-col bg-background/95 backdrop-blur"
          role="dialog"
          aria-modal="true"
          aria-label={current.file_name}
          onClick={() => setIndex(null)}
          onTouchStart={(e) => {
            touchStartX.current = e.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            const start = touchStartX.current;
            const end = e.changedTouches[0]?.clientX ?? null;
            touchStartX.current = null;
            if (start === null || end === null) return;
            const dx = end - start;
            if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
          }}
        >
          <div className="flex items-center justify-between p-4">
            <p className="truncate text-sm text-muted-foreground">
              {(index ?? 0) + 1} / {total} · {current.file_name}
            </p>
            <div className="flex items-center gap-2">
              {unlocked && (
                <button
                  type="button"
                  aria-label="Eliminar foto"
                  className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm("¿Eliminar esta foto?")) {
                      deletePhoto(current.id);
                    }
                  }}
                >
                  <Trash2 className="size-5" />
                </button>
              )}
              <button
                type="button"
                aria-label="Cerrar"
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
                onClick={() => setIndex(null)}
              >
                <X className="size-5" />
              </button>
            </div>
          </div>
          <div className="relative grid flex-1 place-items-center overflow-hidden p-4">
            <img
              src={urls[current.storage_path]}
              alt={current.file_name}
              className="max-h-full max-w-full rounded-xl object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            {total > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Foto anterior"
                  onClick={(e) => {
                    e.stopPropagation();
                    step(-1);
                  }}
                  className="absolute left-2 grid size-11 place-items-center rounded-full border border-border bg-card/80 text-foreground transition-colors hover:text-turf"
                >
                  <ChevronLeft className="size-6" />
                </button>
                <button
                  type="button"
                  aria-label="Foto siguiente"
                  onClick={(e) => {
                    e.stopPropagation();
                    step(1);
                  }}
                  className="absolute right-2 grid size-11 place-items-center rounded-full border border-border bg-card/80 text-foreground transition-colors hover:text-turf"
                >
                  <ChevronRight className="size-6" />
                </button>
              </>
            )}
          </div>
          {((current.dorsals ?? []).length > 0 ||
            (current.tags ?? []).length > 0) && (
            <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3">
              {(current.dorsals ?? []).map((d) => (
                <span
                  key={`d-${d}`}
                  className="rounded-md border border-turf/40 bg-turf/10 px-2 py-0.5 font-display text-[11px] font-semibold text-turf"
                >
                  #{d}
                </span>
              ))}
              {(current.tags ?? []).map((t) => (
                <span
                  key={`t-${t}`}
                  className="rounded-full border border-border bg-card/60 px-2.5 py-0.5 text-[11px] text-muted-foreground"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
          {unlocked && (
            <PhotoLabels
              photo={current}
              onSaved={() => {
                queryClient.invalidateQueries({
                  queryKey: ["photos", matchId],
                });
              }}
            />
          )}
        </div>
      )}

      {showSelfie && (
        <SelfieSearchModal
          matchId={matchId}
          onClose={() => setShowSelfie(false)}
          onResults={(ids) => {
            setFilterIds(ids);
            setIndex(null);
          }}
        />
      )}
    </div>
  );
}
