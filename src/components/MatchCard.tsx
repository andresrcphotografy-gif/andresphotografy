import { Link } from "@tanstack/react-router";
import { Camera, Clock, ImageIcon, MapPin, Shield, Trash2 } from "lucide-react";
import {
  formatDate,
  formatTime,
  statusLabel,
  type Match,
} from "@/lib/matches";

interface MatchCardProps {
  match: Match;
  photoCount: number;
  coverUrl?: string | undefined;
  homeLogoUrl?: string | undefined;
  awayLogoUrl?: string | undefined;
  onDelete?: (() => void) | undefined;
}

function statusStyles(status: string) {
  if (status === "live")
    return "bg-destructive/90 text-destructive-foreground animate-pulse";
  if (status === "finished") return "bg-muted text-muted-foreground";
  return "bg-booking text-background";
}

function TeamCrest({ url, name }: { url?: string | undefined; name: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
      {url ? (
        <img
          src={url}
          alt={`Escudo de ${name}`}
          className="size-12 rounded-full border border-white/20 bg-background/60 object-cover"
          loading="lazy"
        />
      ) : (
        <div className="grid size-12 place-items-center rounded-full border border-white/20 bg-background/60">
          <Shield className="size-5 text-turf" />
        </div>
      )}
      <span className="w-full truncate text-center font-display text-sm font-semibold uppercase leading-tight">
        {name}
      </span>
    </div>
  );
}

export function MatchCard({
  match,
  photoCount,
  coverUrl,
  homeLogoUrl,
  awayLogoUrl,
  onDelete,
}: MatchCardProps) {
  const time = formatTime(match.kickoff_time);

  return (
    <Link
      to="/partido/$matchId"
      params={{ matchId: match.id }}
      className="frost group block overflow-hidden rounded-2xl border border-border transition-colors hover:border-turf/50"
    >
      {/* Portada */}
      <div className="relative h-36 overflow-hidden bg-panel">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={`Portada del partido ${match.home_team} contra ${match.away_team}`}
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="grid size-full place-items-center">
            <Camera className="size-8 text-muted-foreground/40" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-background/10" />

        <span
          className={`absolute left-3 top-3 rounded-full px-2.5 py-1 font-display text-[10px] font-semibold uppercase tracking-widest ${statusStyles(match.status)}`}
        >
          {statusLabel(match.status)}
        </span>

        <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-background/70 px-2.5 py-1 text-[11px] font-medium text-turf backdrop-blur">
          <ImageIcon className="size-3" />
          {photoCount} {photoCount === 1 ? "foto" : "fotos"}
        </span>

        {onDelete && (
          <button
            type="button"
            aria-label={`Eliminar partido ${match.home_team} contra ${match.away_team}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete();
            }}
            className="absolute bottom-2 right-2 rounded-lg bg-background/60 p-2 text-muted-foreground backdrop-blur transition-colors hover:bg-destructive/20 hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>

      {/* Equipos */}
      <div className="px-4 pb-4">
        <div className="-mt-6 flex items-start gap-2">
          <TeamCrest url={homeLogoUrl} name={match.home_team} />
          <span className="mt-3 font-display text-base font-semibold uppercase text-booking">
            vs
          </span>
          <TeamCrest url={awayLogoUrl} name={match.away_team} />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{formatDate(match.match_date)}</span>
          {time && (
            <>
              <span aria-hidden>·</span>
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {time}
              </span>
            </>
          )}
          {match.venue && (
            <>
              <span aria-hidden>·</span>
              <span className="flex min-w-0 items-center gap-1">
                <MapPin className="size-3 shrink-0" />
                <span className="truncate">{match.venue}</span>
              </span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
