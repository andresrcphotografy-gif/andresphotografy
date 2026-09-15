import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Lock, LockOpen, X } from "lucide-react";
import {
  lockPhotographer,
  photographerStatus,
  unlockPhotographer,
} from "@/lib/photographer.functions";

/** ¿Este dispositivo tiene la clave del fotógrafo introducida? */
export function usePhotographer() {
  const status = useServerFn(photographerStatus);
  const { data } = useQuery({
    queryKey: ["photographer"],
    queryFn: () => status(),
    staleTime: 60_000,
  });
  return { unlocked: data?.unlocked === true };
}

export function PhotographerButton() {
  const { unlocked } = usePhotographer();
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const lock = useServerFn(lockPhotographer);

  const lockMutation = useMutation({
    mutationFn: () => lock(),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["photographer"] }),
  });

  return (
    <>
      <button
        type="button"
        onClick={() => (unlocked ? lockMutation.mutate() : setOpen(true))}
        aria-label={unlocked ? "Bloquear modo fotógrafo" : "Entrar como fotógrafo"}
        className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-medium uppercase tracking-widest transition-colors ${
          unlocked
            ? "border-turf/50 bg-turf/10 text-turf"
            : "border-border text-muted-foreground hover:text-turf"
        }`}
      >
        {unlocked ? <LockOpen className="size-3.5" /> : <Lock className="size-3.5" />}
        {unlocked ? "Fotógrafo" : "Soy Andrés"}
      </button>
      {open && <UnlockModal onClose={() => setOpen(false)} />}
    </>
  );
}

export function UnlockModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const unlock = useServerFn(unlockPhotographer);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => unlock({ data: { pin } }),
    onSuccess: (res) => {
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["photographer"] });
        onClose();
      } else {
        setError("Clave incorrecta. Inténtalo otra vez.");
      }
    },
    onError: () => setError("No se pudo comprobar la clave."),
  });

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Clave del fotógrafo"
        className="frost w-full max-w-sm rounded-3xl border border-border p-5"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (pin.trim()) mutation.mutate();
        }}
      >
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display text-lg font-semibold uppercase tracking-wide">
            <KeyRound className="size-4 text-turf" /> Tu clave
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
        <p className="mt-2 text-xs text-muted-foreground">
          Introduce tu clave para crear partidos, subir fotos y borrar
          contenido. Los visitantes no la necesitan.
        </p>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          autoFocus
          autoComplete="current-password"
          placeholder="••••••"
          className="mt-3 w-full rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm outline-none focus:border-turf"
        />
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        <button
          type="submit"
          disabled={!pin.trim() || mutation.isPending}
          className="mt-3 w-full rounded-xl bg-turf py-2.5 font-display text-sm font-semibold uppercase tracking-wide text-background disabled:opacity-40"
        >
          {mutation.isPending ? "Comprobando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
