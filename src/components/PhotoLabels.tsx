import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2 } from "lucide-react";
import { PHOTO_TAGS, type Photo } from "@/lib/matches";
import { setPhotoLabels } from "@/lib/photographer.functions";

interface Props {
  photo: Photo;
  onSaved: () => void;
}

/** Editor de dorsales y etiquetas de una foto (solo para el fotógrafo). */
export function PhotoLabels({ photo, onSaved }: Props) {
  const save = useServerFn(setPhotoLabels);
  const [dorsals, setDorsals] = useState((photo.dorsals ?? []).join(", "));
  const [tags, setTags] = useState<string[]>(photo.tags ?? []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDorsals((photo.dorsals ?? []).join(", "));
    setTags(photo.tags ?? []);
    setSaved(false);
  }, [photo.id, photo.dorsals, photo.tags]);

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    const parsed = dorsals
      .split(/[^0-9]+/)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 100);
    try {
      await save({ data: { photoId: photo.id, dorsals: parsed, tags } });
      setSaved(true);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="border-t border-border bg-card/60 p-4"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="font-display text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Dorsales y etiquetas de esta foto
      </p>
      <input
        value={dorsals}
        onChange={(e) => {
          setDorsals(e.target.value);
          setSaved(false);
        }}
        placeholder="Dorsales, ej. 7, 10"
        aria-label="Dorsales de la foto"
        className="mt-2 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-turf"
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {PHOTO_TAGS.map((tag) => {
          const active = tags.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setSaved(false);
                setTags((t) =>
                  t.includes(tag) ? t.filter((x) => x !== tag) : [...t, tag],
                );
              }}
              className={`rounded-full border px-2.5 py-1 font-display text-[11px] font-semibold uppercase tracking-wide ${
                active
                  ? "border-turf bg-turf text-background"
                  : "border-border text-muted-foreground"
              }`}
            >
              {tag}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={saving}
        className="mt-3 inline-flex items-center gap-2 rounded-xl bg-turf px-4 py-2 font-display text-xs font-semibold uppercase tracking-wide text-background disabled:opacity-60"
      >
        {saving ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Guardando
          </>
        ) : saved ? (
          <>
            <Check className="size-4" /> Guardado
          </>
        ) : (
          "Guardar"
        )}
      </button>
    </div>
  );
}
