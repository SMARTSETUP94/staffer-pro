/**
 * v0.44.1 — Liste de validation objets fabrication (sous-tab "Objets" de l'Atelier).
 * Extrait depuis l'ancien `mobile.chef.a-valider.tsx`.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Check } from "lucide-react";
import { useChefAValider, type ObjetAValider } from "@/hooks/use-chef-a-valider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function ValiderObjetsList() {
  const { objets, isLoading, refetch } = useChefAValider();

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (objets.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
          <Check className="h-8 w-8 text-emerald-500" />
          <p className="text-sm">Aucun objet à valider.</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {objets.map((o) => (
        <ObjetRow key={o.id} objet={o} onChanged={refetch} />
      ))}
    </div>
  );
}

function ObjetRow({ objet, onChanged }: { objet: ObjetAValider; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const statutLabel = {
    a_faire: "À faire",
    en_cours: "En cours",
    bloque: "Bloqué",
    fini: "Terminé",
  }[objet.statut_chef];

  return (
    <Card>
      <CardContent className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[11px] text-muted-foreground">
              {objet.affaire_numero} • {objet.reference}
            </div>
            <div className="text-sm font-semibold leading-tight">{objet.nom}</div>
            <div className="text-xs text-muted-foreground">
              Qté {objet.quantite} •{" "}
              <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                {statutLabel}
              </Badge>
            </div>
            {objet.commentaire_chef && (
              <div className="mt-1 text-xs italic text-muted-foreground">« {objet.commentaire_chef} »</div>
            )}
          </div>
          <Link
            to="/affaires/$affaireId/fabrication"
            params={{ affaireId: objet.affaire_id }}
            className="text-xs text-primary underline"
          >
            Détail
          </Link>
        </div>
        <Button size="sm" className="w-full" onClick={() => setOpen(true)}>
          <Check className="mr-1 h-4 w-4" /> Valider l'objet
        </Button>
      </CardContent>
      <ValidateObjetDialog open={open} onOpenChange={setOpen} objet={objet} onDone={onChanged} />
    </Card>
  );
}

function ValidateObjetDialog({
  open,
  onOpenChange,
  objet,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  objet: ObjetAValider;
  onDone: () => void;
}) {
  const [statut, setStatut] = useState<ObjetAValider["statut_chef"]>("fini");
  const [commentaire, setCommentaire] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const { error: updErr } = await supabase
        .from("fabrication_objets")
        .update({
          statut_chef: statut,
          commentaire_chef: commentaire || null,
          statut_chef_updated_at: new Date().toISOString(),
        })
        .eq("id", objet.id);
      if (updErr) throw updErr;
      toast.success("Objet mis à jour");
      onOpenChange(false);
      onDone();
    } catch {
      toast.error("Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Valider l'objet</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded border bg-muted/50 p-2 text-xs">
            <div className="font-mono">{objet.reference}</div>
            <div className="font-semibold">{objet.nom}</div>
            <div className="text-muted-foreground">
              {objet.affaire_numero} — {objet.affaire_nom}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold">Nouveau statut</label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["a_faire", "À faire"],
                  ["en_cours", "En cours"],
                  ["bloque", "Bloqué"],
                  ["fini", "Terminé"],
                ] as const
              ).map(([v, l]) => (
                <Button
                  key={v}
                  type="button"
                  size="sm"
                  variant={statut === v ? "default" : "outline"}
                  onClick={() => setStatut(v)}
                >
                  {l}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold">Commentaire (optionnel)</label>
            <Textarea
              placeholder="Note sur l'objet…"
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={busy}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
