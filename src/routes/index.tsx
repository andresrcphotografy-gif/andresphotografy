import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, MapPin, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  countPhotosByMatch,
  formatDate,
  getCovers,
  listMatches,
} from "@/lib/matches";
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

  const { data: matches = [], isLoading } = useQuery({
    queryKey: ["matches"],
    queryFn: listMatches,
  });

  const { data: counts = {} } = useQuery({
    queryKey: ["photo-counts"],
    queryFn: countPhotosByMatch,
  });

  const { data: covers = {} } = useQuery({
    queryKey: ["covers", matches.map((m) => m.id).join(",")],
    queryFn: () => getCovers(matches.map((m) => m.id)),
    enabled: matches.length > 0,
  });

  const deleteMatch = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("matches").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      queryClient.invalidateQueries({ queryKey: ["photo-counts"] });
    },
  });

  const totalPhotos = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="relative z-10 mx-auto max-w-2xl px-4 pb-28 pt-6">
      {/* Header */}
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
        <div className="rounded-xl border border-border bg-card/60 px-3 py-1.5 text-right">
          <div className="font-display text-lg font-semibold leading-none text-booking">
            {totalPhotos.toLocaleString("es-ES")}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Fotos
          </div>
        </div>
      </header>

      {/* Matches */}
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
          <ul className="space-y-3">
            {matches.map((m, i) => (
              <li
                key={m.id}
                className={i === 0 ? "animate-rise-1" : "animate-rise-2"}
              >
                <Link
                  to="/partido/$matchId"
                  params={{ matchId: m.id }}
                  className="frost group flex items-center gap-3 rounded-2xl border border-border p-3 transition-colors hover:border-turf/40"
                >
                  {covers[m.id] ? (
                    <img
                      src={covers[m.id]}
                      alt={`Foto del partido ${m.home_team} vs ${m.away_team}`}
                      className="size-16 shrink-0 rounded-xl object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-panel">
                      <Camera className="size-6 text-muted-foreground/50" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-base font-semibold leading-tight">
                      {m.home_team} <span className="text-turf">vs</span>{" "}
                      {m.away_team}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      {formatDate(m.match_date)}
                      {m.venue && (
                        <>
                          <span aria-hidden>·</span>
                          <MapPin className="size-3" />
                          <span className="truncate">{m.venue}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-display text-lg font-semibold leading-none text-turf">
                      {counts[m.id] ?? 0}
                    </div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      fotos
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={`Eliminar partido ${m.home_team} vs ${m.away_team}`}
                    className="shrink-0 rounded-lg p-2 text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (
                        window.confirm(
                          `¿Eliminar el partido ${m.home_team} vs ${m.away_team} y todas sus fotos?`,
                        )
                      ) {
                        deleteMatch.mutate(m.id);
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* FAB */}
      <div className="fixed inset-x-4 bottom-4 z-20 mx-auto max-w-2xl">
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

function NewMatchSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [date, setDate] = useState("");
  const [venue, setVenue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createMatch = useMutation({
    mutationFn: async () => {
      const { data, error: err } = await supabase
        .from("matches")
        .insert({
          home_team: home.trim(),
          away_team: away.trim(),
          match_date: date || null,
          venue: venue.trim() || null,
        })
        .select("id")
        .single();
      if (err) throw err;
      return data.id as string;
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
      className="fixed inset-0 z-30 flex items-end justify-center bg-background/70 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Nuevo partido"
        className="frost w-full max-w-md rounded-t-3xl border border-border p-5 sm:rounded-3xl"
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
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              Fecha del partido
            </span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm outline-none focus:border-turf"
            />
          </label>
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
