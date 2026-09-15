import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Send, Trash2 } from "lucide-react";
import {
  addComment,
  deleteComment,
  formatDateTime,
  listComments,
} from "@/lib/matches";
import { usePhotographer } from "@/components/PhotographerGate";

export function MatchComments({ matchId }: { matchId: string }) {
  const queryClient = useQueryClient();
  const { unlocked } = usePhotographer();
  const [name, setName] = useState(
    () => localStorage.getItem("ap-author-name") ?? "",
  );
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ["comments", matchId],
    queryFn: () => listComments(matchId),
  });

  const addMutation = useMutation({
    mutationFn: () => addComment(matchId, name, content),
    onSuccess: () => {
      localStorage.setItem("ap-author-name", name.trim());
      setContent("");
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["comments", matchId] });
      queryClient.invalidateQueries({ queryKey: ["comment-counts"] });
    },
    onError: () =>
      setError("No se pudo publicar el comentario. Inténtalo de nuevo."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteComment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", matchId] });
      queryClient.invalidateQueries({ queryKey: ["comment-counts"] });
    },
  });

  const valid = name.trim().length > 0 && content.trim().length > 0;

  return (
    <section className="animate-rise-2 mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wide">
          <MessageCircle className="size-4 text-booking" />
          Comentarios
        </h2>
        <span className="text-xs text-muted-foreground">
          {comments.length}{" "}
          {comments.length === 1 ? "comentario" : "comentarios"}
        </span>
      </div>

      <form
        className="frost rounded-2xl border border-border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !addMutation.isPending) addMutation.mutate();
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tu nombre (ej. Mamá de Diego)"
          maxLength={60}
          className="w-full rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/50 focus:border-turf"
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Escribe un comentario sobre el partido…"
          rows={3}
          maxLength={500}
          className="mt-2 w-full resize-none rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/50 focus:border-turf"
        />
        {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
        <button
          type="submit"
          disabled={!valid || addMutation.isPending}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-turf py-2.5 font-display text-sm font-semibold uppercase tracking-wide text-background transition-transform enabled:active:scale-95 disabled:opacity-40"
        >
          <Send className="size-4" />
          {addMutation.isPending ? "Publicando…" : "Publicar comentario"}
        </button>
      </form>

      <div className="mt-4 space-y-2.5">
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Cargando comentarios…
          </p>
        ) : comments.length === 0 ? (
          <p className="frost rounded-2xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            Aún no hay comentarios. ¡Sé el primero en escribir!
          </p>
        ) : (
          comments.map((c) => (
            <article
              key={c.id}
              className="frost group rounded-2xl border border-border p-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate font-display text-sm font-semibold uppercase tracking-wide text-turf">
                  {c.author_name}
                </p>
                <div className="flex shrink-0 items-center gap-1">
                  <time className="text-[11px] text-muted-foreground">
                    {formatDateTime(c.created_at)}
                  </time>
                  <button
                    type="button"
                    aria-label={`Eliminar comentario de ${c.author_name}`}
                    onClick={() => {
                      if (window.confirm("¿Eliminar este comentario?")) {
                        deleteMutation.mutate(c.id);
                      }
                    }}
                    className="rounded-lg p-1.5 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {c.content}
              </p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
