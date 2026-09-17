import { Search, X } from "lucide-react";
import { PHOTO_TAGS } from "@/lib/matches";

interface Props {
  dorsal: string;
  onDorsalChange: (v: string) => void;
  tags: string[];
  onToggleTag: (tag: string) => void;
  hasFilters: boolean;
  onClear: () => void;
}

/** Barra de búsqueda por dorsal + chips de etiquetas, arriba de la galería. */
export function GalleryFilters({
  dorsal,
  onDorsalChange,
  tags,
  onToggleTag,
  hasFilters,
  onClear,
}: Props) {
  return (
    <div className="frost rounded-2xl border border-border p-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            value={dorsal}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") return onDorsalChange("");
              const n = Math.trunc(Number(v));
              if (!Number.isFinite(n)) return;
              onDorsalChange(String(Math.min(100, Math.max(1, n))));
            }}
            placeholder="Busca tu dorsal (1 - 100)"
            aria-label="Buscar por dorsal"
            className="w-full rounded-xl border border-border bg-background/60 py-2.5 pl-9 pr-9 text-sm outline-none transition-colors focus:border-turf"
          />
          {dorsal !== "" && (
            <button
              type="button"
              aria-label="Quitar dorsal"
              onClick={() => onDorsalChange("")}
              className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        {hasFilters && (
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 rounded-xl border border-turf/40 bg-turf/10 px-3 py-2.5 font-display text-[11px] font-semibold uppercase tracking-wide text-turf"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {PHOTO_TAGS.map((tag) => {
          const active = tags.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={active}
              onClick={() => onToggleTag(tag)}
              className={`rounded-full border px-3 py-1.5 font-display text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                active
                  ? "border-turf bg-turf text-background"
                  : "border-border bg-card/60 text-muted-foreground hover:border-turf/50 hover:text-turf"
              }`}
            >
              {tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}
