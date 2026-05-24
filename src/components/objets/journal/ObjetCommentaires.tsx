/**
 * Lot 8.4 MVP — Fil de commentaires d'un objet.
 *
 * Lecture + ajout via les SF `getObjetCommentaires` / `addObjetCommentaire`.
 * Suppression via `deleteObjetCommentaire` (RLS : auteur ou admin).
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Send, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  addObjetCommentaire,
  deleteObjetCommentaire,
  getObjetCommentaires,
} from "@/server/objet-commentaires.functions";

interface Props {
  objetId: string;
  affaireId: string;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function ObjetCommentaires({ objetId, affaireId }: Props) {
  const qc = useQueryClient();
  const [text, setText] = useState("");

  const fetchList = useServerFn(getObjetCommentaires);
  const addFn = useServerFn(addObjetCommentaire);
  const delFn = useServerFn(deleteObjetCommentaire);

  const list = useQuery({
    queryKey: ["objet-commentaires", objetId],
    queryFn: () => fetchList({ data: { objetId } }),
    staleTime: 15_000,
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["objet-commentaires", objetId] });

  const addMut = useMutation({
    mutationFn: (content: string) =>
      addFn({ data: { objetId, affaireId, content } }),
    onSuccess: () => {
      setText("");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const onSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    addMut.mutate(trimmed);
  };

  return (
    <Card data-testid="objet-commentaires">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Commentaires</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ajouter un commentaire…"
            rows={2}
            maxLength={2000}
            disabled={addMut.isPending}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={onSubmit}
              disabled={addMut.isPending || !text.trim()}
              data-testid="commentaire-submit"
            >
              <Send className="mr-1.5 h-4 w-4" />
              Publier
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {list.isLoading ? (
            <>
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </>
          ) : list.isError ? (
            <p className="text-xs text-destructive">Erreur de chargement.</p>
          ) : !list.data || list.data.commentaires.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aucun commentaire.</p>
          ) : (
            list.data.commentaires.map((c) => (
              <div
                key={c.id}
                className="rounded-md border bg-muted/30 p-3 text-sm"
              >
                <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span>{fmtDate(c.created_at)}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    onClick={() => delMut.mutate(c.id)}
                    disabled={delMut.isPending}
                    aria-label="Supprimer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="whitespace-pre-wrap">{c.content}</p>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
