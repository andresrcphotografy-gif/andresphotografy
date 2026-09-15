import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, ImagePlus, Plus, Shield, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MatchCard } from "@/components/MatchCard";
import {
  countCommentsByMatch,
  countPhotosByMatch,
  getCovers,
  getLikesByMatch,
  getLogos,
  listMatches,
  toggleLike,
  uploadMatchAsset,
} from "@/lib/matches";
import {
  PhotographerButton,
  usePhotographer,
} from "@/components/PhotographerGate";
import { deleteMatchFn, setMatchAssets } from "@/lib/photographer.functions";
import logoMark from "@/assets/logo-mark.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Andres Photografy — Tus partidos" },
      {
        name: "description",
        content:
          "Organiza las fotos de tus partidos de fútbol por carpetas con los equipos. Sube paquetes enteros de fotos, gratis.",
      },
      { property: "og:title", content: "Andres Photografy — Tus partidos" },
      {
        property: "og:description",
        content:
          "Organiza las fotos de tus partidos de fútbol por carpetas con los equipos. Sube paquetes enteros de fotos, gratis.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const { unlocked } = usePhotographer();

  const { data: matches = [], isLoading, error } = useQuery({
    queryKey: ["matches"],
    queryFn: listMatches,
  });

  const { data: counts = {} } = useQuery({
    queryKey: ["photo-counts"],
    queryFn: countPhotosByMatch,
  });

  const { data: commentCounts = {} } = useQuery({
    queryKey: ["comment-counts"],
    queryFn: countCommentsByMatch,
  });

  const { data: likes = { counts: {}, mine: {} } } = useQuery({
    queryKey: ["likes"],
    queryFn: getLikesByMatch,
  });

  const likeMutation = useMutation({
    mutationFn: ({ id, liked }: { id: string; liked: boolean }) =>
      toggleLike(id, liked),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["likes"] }),
  });

  const matchKey = matches.map((m) => m.id).join(",");

  const { data: covers = {} } = useQuery({
    queryKey: ["covers", matchKey],
    queryFn: () => getCovers(matches),
    enabled: matches.length > 0,
  });

  const { data: logos = {} } = useQuery({
    queryKey: ["logos", matchKey],
    queryFn: () => getLogos(matches),
    enabled: matches.length > 0,
  });

  const deleteMatch = useMutation({
    mutationFn: async (id: string) => {
      await deleteMatchFn({ data: { matchId: id } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      queryClient.invalidateQueries({ queryKey: ["photo-counts"] });
    },
  });

  const totalPhotos = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="relative z-10 mx-auto max-w-3xl px-4 pb-28 pt-6">
      <header className="animate-rise flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src={logoMark}
            alt="Logo de Andres Photografy"
            className="size-11"
            width={44}
            height={44}
          />
          <div>
            <h1 className="font-display text-xl font-semibold uppercase leading-none tracking-tight">
              Andres<span className="text-turf">photografy</span>
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Fotografía deportiva de fútbol
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PhotographerButton />
          <div className="rounded-xl border border-border bg-card/60 px-3 py-1.5 text-right">
            <div className="font-display text-lg font-semibold leading-none text-booking">
              {totalPhotos.toLocaleString("es-ES")}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Fotos
            </div>
          </div>
        </div>
      </header>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-base font-semibold uppercase tracking-wide">
            Partidos
          </h2>
          <span className="text-xs text-muted-foreground">
            {matches.length} {matches.length === 1 ? "carpeta" : "carpetas"}
          </span>
        </div>

        {isLoading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Cargando partidos…
          </p>
        ) : error ? (
          <p className="py-12 text-center text-sm text-destructive">
            No pudimos cargar tus partidos. Revisa tu conexión e inténtalo de
            nuevo.
          </p>
        ) : matches.length === 0 ? (
          <div className="animate-rise-1 frost rounded-2xl border border-dashed border-turf/40 p-10 text-center">
            <Camera className="mx-auto size-10 text-turf" />
            <p className="mt-3 font-display text-lg font-semibold uppercase">
              Aún no hay partidos
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Crea tu primer partido y sube el paquete de fotos completo.
            </p>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {matches.map((m, i) => (
              <li key={m.id} className={i === 0 ? "animate-rise-1" : "animate-rise-2"}>
                <MatchCard
                  match={m}
                  photoCount={counts[m.id] ?? 0}
                  coverUrl={covers[m.id]}
                  homeLogoUrl={logos[m.id]?.home}
                  awayLogoUrl={logos[m.id]?.away}
                  likeCount={likes.counts[m.id] ?? 0}
                  liked={likes.mine[m.id] ?? false}
                  commentCount={commentCounts[m.id] ?? 0}
                  onToggleLike={() =>
                    likeMutation.mutate({
                      id: m.id,
                      liked: likes.mine[m.id] ?? false,
                    })
                  }
                  onDelete={
                    unlocked
                      ? () => {
                          if (
                            window.confirm(
                              `¿Eliminar el partido ${m.home_team} vs ${m.away_team} y todas sus fotos?`,
                            )
                          ) {
                            deleteMatch.mutate(m.id);
                          }
                        }
                      : undefined
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div
        className={`fixed inset-x-4 bottom-4 z-20 mx-auto max-w-3xl ${unlocked ? "" : "hidden"}`}
      >
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-booking py-3.5 font-display text-base font-semibold uppercase tracking-wide text-background shadow-[0_8px_24px_oklch(0.83_0.16_90/0.28)] transition-transform active:scale-95"
        >
          <Plus className="size-5" /> Nuevo partido
        </button>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          100% gratis · sin pagos ni suscripciones
        </p>
      </div>

      {showForm && <NewMatchSheet onClose={() => setShowForm(false)} />}
    </div>
  );
}

function ImagePicker({
  label,
  file,
  onPick,
  round,
}: {
  label: string;
  file: File | null;
  onPick: (f: File | null) => void;
  round?: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(null);

  return (
    <label className="flex cursor-pointer flex-col items-center gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <div
        className={`grid size-16 place-items-center overflow-hidden border border-dashed border-turf/40 bg-turf/5 ${round ? "rounded-full" : "rounded-xl"}`}
      >
        {preview ? (
          <img src={preview} alt="" className="size-full object-cover" />
        ) : round ? (
          <Shield className="size-5 text-turf/70" />
        ) : (
          <ImagePlus className="size-5 text-turf/70" />
        )}
      </div>
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          onPick(f);
          setPreview(f ? URL.createObjectURL(f) : null);
        }}
      />
      {file && (
        <span className="max-w-20 truncate text-[10px] text-turf">
          {file.name}
        </span>
      )}
    </label>
  );
}

function NewMatchSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [venue, setVenue] = useState("");
  const [status, setStatus] = useState("upcoming");
  const [cover, setCover] = useState<File | null>(null);
  const [homeLogo, setHomeLogo] = useState<File | null>(null);
  const [awayLogo, setAwayLogo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createMatch = useMutation({
    mutationFn: async () => {
      const { data, error: err } = await supabase
        .from("matches")
        .insert({
          home_team: home.trim(),
          away_team: away.trim(),
          match_date: date || null,
          kickoff_time: time || null,
          venue: venue.trim() || null,
          status,
        })
        .select("id")
        .single();
      if (err) throw err;
      const id = data.id as string;

      const cover_path = cover
        ? await uploadMatchAsset(id, "portada", cover)
        : null;
      const home_logo_path = homeLogo
        ? await uploadMatchAsset(id, "escudo-local", homeLogo)
        : null;
      const away_logo_path = awayLogo
        ? await uploadMatchAsset(id, "escudo-visitante", awayLogo)
        : null;
      if (cover_path || home_logo_path || away_logo_path) {
        const { error: upErr } = await supabase
          .from("matches")
          .update({ cover_path, home_logo_path, away_logo_path })
          .eq("id", id);
        if (upErr) throw upErr;
      }
      return id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      onClose();
      router.navigate({ to: "/partido/$matchId", params: { matchId: id } });
    },
    onError: () => setError("No se pudo crear el partido. Inténtalo de nuevo."),
  });

  const valid = home.trim().length > 0 && away.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center overflow-y-auto bg-background/70 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Nuevo partido"
        className="frost my-auto w-full max-w-md rounded-t-3xl border border-border p-5 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold uppercase tracking-wide">
            Nuevo partido
          </h3>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X className="size-5" />
          </button>
        </div>

        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (valid) createMatch.mutate();
          }}
        >
          <div className="flex items-center gap-2">
            <label className="flex-1">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                Equipo local
              </span>
              <input
                value={home}
                onChange={(e) => setHome(e.target.value)}
                placeholder="Tigres FC"
                autoFocus
                className="w-full rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/50 focus:border-turf"
              />
            </label>
            <span className="mt-6 font-display text-sm font-semibold uppercase text-booking">
              vs
            </span>
            <label className="flex-1">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                Equipo visitante
              </span>
              <input
                value={away}
                onChange={(e) => setAway(e.target.value)}
                placeholder="Cóndor SC"
                className="w-full rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/50 focus:border-turf"
              />
            </label>
          </div>

          <div className="flex items-start justify-center gap-6 py-1">
            <ImagePicker label="Escudo local" file={homeLogo} onPick={setHomeLogo} round />
            <ImagePicker label="Portada" file={cover} onPick={setCover} />
            <ImagePicker
              label="Escudo visita"
              file={awayLogo}
              onPick={setAwayLogo}
              round
            />
          </div>

          <div className="flex gap-2">
            <label className="flex-1">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                Fecha
              </span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm outline-none focus:border-turf"
              />
            </label>
            <label className="w-28">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                Hora
              </span>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm outline-none focus:border-turf"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              Estadio (opcional)
            </span>
            <input
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="Estadio La Cumbre"
              className="w-full rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/50 focus:border-turf"
            />
          </label>

          <div className="flex gap-2">
            {[
              { value: "upcoming", label: "Próximo" },
              { value: "live", label: "En vivo" },
              { value: "finished", label: "Finalizado" },
            ].map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setStatus(s.value)}
                className={`flex-1 rounded-xl border py-2 font-display text-xs font-semibold uppercase tracking-wide transition-colors ${
                  status === s.value
                    ? "border-turf bg-turf/15 text-turf"
                    : "border-border text-muted-foreground"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={!valid || createMatch.isPending}
            className="w-full rounded-xl bg-turf py-3 font-display text-sm font-semibold uppercase tracking-wide text-background transition-transform enabled:active:scale-95 disabled:opacity-40"
          >
            {createMatch.isPending ? "Creando…" : "Crear partido"}
          </button>
        </form>
      </div>
    </div>
  );
}
