/**
 * v0.44.1 — Liste de validation heures équipe.
 * Extrait depuis l'ancien `mobile.chef.a-valider.tsx` pour être réutilisé
 * dans le sous-tab "Valider" de `/mobile/chef/equipe`.
 *
 * Comportement identique : valider / corriger / rejeter, audit côté DB.
 */
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Check, X, Pencil, AlertTriangle } from "lucide-react";
import { useChefAValider, type HeureAValider } from "@/hooks/use-chef-a-valider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

export function ValiderHeuresList() {
  const { heures, isLoading, refetch } = useChefAValider();

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (heures.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
          <Check className="h-8 w-8 text-emerald-500" />
          <p className="text-sm">Aucune heure en attente.</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {heures.map((h) => (
        <HeureRow key={h.id} heure={h} onChanged={refetch} />
      ))}
    </div>
  );
}

function HeureRow({ heure, onChanged }: { heure: HeureAValider; onChanged: () => void }) {
  const [busy, setBusy] = useState<"validate" | "correct" | "reject" | null>(null);
  const [correctOpen, setCorrectOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  const dateLabel = format(parseISO(heure.date), "EEE d MMM", { locale: fr });

  async function validate() {
    setBusy("validate");
    const { error } = await supabase
      .from("heures_saisies")
      .update({ statut: "valide", valide_le: new Date().toISOString() })
      .eq("id", heure.id);
    setBusy(null);
    if (error) {
      toast.error("Erreur");
      return;
    }
    toast.success("Heures validées", { description: `${heure.employe_nom} • ${dateLabel}` });
    onChanged();
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[11px] text-muted-foreground">{heure.affaire_numero}</div>
            <div className="text-sm font-semibold leading-tight">{heure.employe_nom}</div>
            <div className="text-xs text-muted-foreground">
              {dateLabel} •{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {heure.heures_reelles ?? 0}h
              </span>
              {heure.heure_debut && heure.heure_fin && (
                <> ({heure.heure_debut.slice(0, 5)}–{heure.heure_fin.slice(0, 5)})</>
              )}
            </div>
            {heure.commentaire && (
              <div className="mt-1 text-xs italic text-muted-foreground">« {heure.commentaire} »</div>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={validate}
            disabled={busy !== null}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700"
          >
            <Check className="mr-1 h-4 w-4" /> Valider
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCorrectOpen(true)} disabled={busy !== null}>
            <Pencil className="mr-1 h-4 w-4" /> Corriger
          </Button>
          <Button size="sm" variant="outline" onClick={() => setRejectOpen(true)} disabled={busy !== null}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>

      <CorrectHeureDialog open={correctOpen} onOpenChange={setCorrectOpen} heure={heure} onDone={onChanged} />
      <RejectHeureDialog open={rejectOpen} onOpenChange={setRejectOpen} heure={heure} onDone={onChanged} />
    </Card>
  );
}

function CorrectHeureDialog({
  open,
  onOpenChange,
  heure,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  heure: HeureAValider;
  onDone: () => void;
}) {
  const [valeur, setValeur] = useState(String(heure.heures_reelles ?? 0));
  const [commentaire, setCommentaire] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const num = Number(valeur);
    if (!Number.isFinite(num) || num < 0 || num > 24) {
      toast.error("Valeur invalide", { description: "Entre 0 et 24h." });
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("heures_saisies")
      .update({
        heures_reelles: num,
        statut: "valide",
        valide_le: new Date().toISOString(),
        commentaire: commentaire || heure.commentaire,
      })
      .eq("id", heure.id);
    setBusy(false);
    if (error) {
      toast.error("Erreur");
      return;
    }
    toast.success("Heures corrigées et validées");
    onOpenChange(false);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Corriger les heures</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded border bg-muted/50 p-2 text-xs">
            <div className="font-semibold">{heure.employe_nom}</div>
            <div className="text-muted-foreground">
              {heure.affaire_numero} • {format(parseISO(heure.date), "EEE d MMM", { locale: fr })}
            </div>
            <div>
              Valeur déclarée :{" "}
              <span className="font-semibold tabular-nums">{heure.heures_reelles ?? 0}h</span>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold">Heures corrigées</label>
            <Input
              type="number"
              min={0}
              max={24}
              step={0.25}
              value={valeur}
              onChange={(e) => setValeur(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold">Commentaire (optionnel)</label>
            <Textarea
              placeholder="Raison de la correction…"
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              rows={2}
            />
          </div>
          <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <AlertTriangle className="mr-1 inline h-3 w-3" />
            La correction est tracée dans l'audit (qui, quand, valeur avant/après).
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={busy}>
            Corriger et valider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectHeureDialog({
  open,
  onOpenChange,
  heure,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  heure: HeureAValider;
  onDone: () => void;
}) {
  const [motif, setMotif] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!motif.trim()) {
      toast.error("Motif requis");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("heures_saisies")
      .update({ statut: "rejete", motif_rejet: motif, rejete_le: new Date().toISOString() })
      .eq("id", heure.id);
    setBusy(false);
    if (error) {
      toast.error("Erreur");
      return;
    }
    toast.success("Heures rejetées");
    onOpenChange(false);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rejeter ces heures</DialogTitle>
        </DialogHeader>
        <Textarea
          placeholder="Motif du rejet (visible par l'employé)…"
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          rows={3}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Annuler
          </Button>
          <Button variant="destructive" onClick={submit} disabled={busy}>
            Rejeter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
