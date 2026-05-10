import { useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Check, Clock, Loader2, MapPin, X } from "lucide-react";
import { toast } from "sonner";
import { formatBusinessError } from "@/lib/business-errors";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  CONFIRMATION_COLOR,
  CONFIRMATION_LABEL,
  type PropositionRow,
} from "@/hooks/use-mes-propositions";

interface Props {
  rows: PropositionRow[];
  onChanged: () => void;
  emptyMessage?: string;
  /** Compact = layout mobile (texte plus petit, padding réduit) */
  compact?: boolean;
}

export function PropositionsList({ rows, onChanged, emptyMessage, compact }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [refusDialog, setRefusDialog] = useState<{ row: PropositionRow; motif: string } | null>(null);

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {emptyMessage ?? "Aucune proposition de mission."}
        </CardContent>
      </Card>
    );
  }

  const confirm = async (row: PropositionRow) => {
    setBusy(row.id);
    const { error } = await supabase
      .from("assignations")
      .update({ statut_confirmation: "confirmee" })
      .eq("id", row.id);
    setBusy(null);
    if (error) {
      toast.error(...formatBusinessError(error));
      return;
    }
    toast.success("Mission confirmée. Le chef est notifié.");
    onChanged();
  };

  const submitRefus = async () => {
    if (!refusDialog) return;
    if (!refusDialog.motif.trim()) {
      toast.error("Le motif est obligatoire.");
      return;
    }
    setBusy(refusDialog.row.id);
    const { error } = await supabase
      .from("assignations")
      .update({
        statut_confirmation: "refusee",
        motif_refus: refusDialog.motif.trim(),
      })
      .eq("id", refusDialog.row.id);
    setBusy(null);
    if (error) {
      toast.error(...formatBusinessError(error));
      return;
    }
    toast.success("Refus enregistré. Le chef est notifié.");
    setRefusDialog(null);
    onChanged();
  };

  return (
    <>
      <div className="space-y-2.5">
        {rows.map((r) => {
          const canDecide = r.statut_confirmation === "en_attente";
          return (
            <Card key={r.id} className="overflow-hidden">
              <CardContent className={cn("p-0", compact && "text-xs")}>
                <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-2">
                  <Badge variant="outline" className={cn("text-[10px]", CONFIRMATION_COLOR[r.statut_confirmation])}>
                    {r.statut_confirmation === "en_attente" && <Clock className="mr-1 h-3 w-3" />}
                    {r.statut_confirmation === "confirmee" && <Check className="mr-1 h-3 w-3" />}
                    {r.statut_confirmation === "refusee" && <X className="mr-1 h-3 w-3" />}
                    {CONFIRMATION_LABEL[r.statut_confirmation]}
                  </Badge>
                  <span className="text-[11px] font-semibold capitalize text-muted-foreground">
                    {format(new Date(r.date), "EEE d MMM yyyy", { locale: fr })}
                  </span>
                </div>

                <div className="space-y-1.5 px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <span
                      className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: r.metier?.couleur ?? "#94a3b8" }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">
                        {r.affaire?.numero ?? "—"}{" "}
                        <span className="font-normal text-muted-foreground">— {r.affaire?.nom ?? ""}</span>
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {r.metier?.libelle ?? "—"} ·{" "}
                        {r.demi_journee === "JOURNEE" ? "Journée" : r.demi_journee} · {r.heures}h
                        {r.affaire?.client && <> · {r.affaire.client}</>}
                      </p>
                      {r.affaire?.lieu && (
                        <p className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                          <MapPin className="h-3 w-3" /> {r.affaire.lieu}
                        </p>
                      )}
                      {r.notes && (
                        <p className="mt-1 text-[11px] italic text-muted-foreground">"{r.notes}"</p>
                      )}
                    </div>
                  </div>

                  {r.statut_confirmation === "refusee" && r.motif_refus && (
                    <p className="rounded bg-red-500/5 px-2 py-1 text-[11px] text-red-700 dark:text-red-400">
                      <strong>Ton motif :</strong> {r.motif_refus}
                    </p>
                  )}
                </div>

                {canDecide && (
                  <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setRefusDialog({ row: r, motif: "" })}
                      disabled={busy === r.id}
                      className="gap-1 text-red-700 hover:text-red-800 dark:text-red-400"
                    >
                      <X className="h-3.5 w-3.5" /> Refuser
                    </Button>
                    <Button size="sm" onClick={() => confirm(r)} disabled={busy === r.id} className="gap-1">
                      {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      Confirmer
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={refusDialog !== null} onOpenChange={(o) => !o && setRefusDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refuser la mission</DialogTitle>
            <DialogDescription>
              Le chef sera notifié de ton refus avec le motif. Cette action est définitive.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Motif (obligatoire)</Label>
            <Textarea
              rows={3}
              value={refusDialog?.motif ?? ""}
              onChange={(e) => setRefusDialog((d) => (d ? { ...d, motif: e.target.value } : d))}
              placeholder="Ex : pas disponible ce jour, mission ailleurs…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefusDialog(null)}>Annuler</Button>
            <Button variant="destructive" onClick={submitRefus} disabled={!refusDialog?.motif.trim()}>
              Confirmer le refus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
