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
  MapPin,
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
  registerPhoto,
} from "@/lib/photographer.functions";
import {
  PhotographerButton,
  usePhotographer,
} from "@/components/PhotographerGate";
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

  const { unlocked } = usePhotographer();
  const getUploadUrl = useServerFn(createPhotoUploadUrl);
  const savePhoto = useServerFn(registerPhoto);
  const removePhoto = useServerFn(deletePhotoFn);

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

  const total = photos.length;
  const current = index !== null ? photos[index] : undefined;

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
          await savePhoto({ data: { matchId, path, fileName: file.name } });
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
    [matchId, queryClient, upload.running, getUploadUrl, savePhoto],
  );

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

        {loadingPhotos ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Cargando fotos…
          </p>
        ) : total === 0 ? (
          <div className="frost rounded-2xl border border-dashed border-border p-10 text-center">
            <Camera className="mx-auto size-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">
              Este partido aún no tiene fotos.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photos.map((p, i) =>
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
        </div>
      )}
    </div>
  );
}
