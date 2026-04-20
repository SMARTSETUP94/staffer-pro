import { useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowLeftRight, ArrowRight, Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
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
  SWAP_STATUS_COLOR,
  SWAP_STATUS_LABEL,
  type SwapRequestRow,
} from "@/hooks/use-mes-swaps";

interface Props {
  rows: SwapRequestRow[];
  /** ID employé courant (utilisé pour /mes-swaps), null si vue chef */
  currentEmployeId: string | null;
  /** Si true, l'utilisateur peut valider/rejeter en tant que chef */
  chefMode?: boolean;
  onChanged: () => void;
  emptyMessage?: string;
}

export function SwapsList({
  rows,
  currentEmployeId,
  chefMode,
  onChanged,
  emptyMessage,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [decisionDialog, setDecisionDialog] = useState<
    | { swap: SwapRequestRow; mode: "refuse_collegue" | "reject_chef"; motif: string }
    | null
  >(null);

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          {emptyMessage ?? "Aucune demande d'échange."}
        </CardContent>
      </Card>
    );
  }

  type SwapPatch = {
    statut?: SwapRequestRow["statut"];
    collegue_decide_le?: string | null;
    collegue_motif?: string | null;
    chef_motif?: string | null;
  };

  const update = async (id: string, patch: SwapPatch): Promise<boolean> => {
    setBusy(id);
    const { error } = await supabase.from("swap_requests").update(patch).eq("id", id);
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return false;
    }
    onChanged();
    return true;
  };

  const accepterCollegue = async (s: SwapRequestRow) => {
    const ok = await update(s.id, { statut: "acceptee_collegue", collegue_decide_le: new Date().toISOString() });
    if (ok) toast.success("Échange accepté. En attente du chef.");
  };

  const validerChef = async (s: SwapRequestRow) => {
    const ok = await update(s.id, { statut: "validee_chef" });
    if (ok) toast.success("Échange validé et appliqué.");
  };

  const annuler = async (s: SwapRequestRow) => {
    const ok = await update(s.id, { statut: "annulee" });
    if (ok) toast.success("Demande annulée.");
  };

  const submitDecision = async () => {
    if (!decisionDialog) return;
    if (!decisionDialog.motif.trim()) {
      toast.error("Le motif est obligatoire.");
      return;
    }
    const { swap, mode, motif } = decisionDialog;
    const patch: SwapPatch =
      mode === "refuse_collegue"
        ? { statut: "refusee_collegue", collegue_motif: motif.trim(), collegue_decide_le: new Date().toISOString() }
        : { statut: "rejetee_chef", chef_motif: motif.trim() };
    const ok = await update(swap.id, patch);
    if (ok) {
      toast.success(mode === "refuse_collegue" ? "Échange refusé." : "Échange rejeté.");
      setDecisionDialog(null);
    }
  };

  return (
    <>
      <div className="space-y-3">
        {rows.map((s) => {
          const isFromMe = currentEmployeId === s.from_employe_id;
          const isToMe = currentEmployeId === s.to_employe_id;
          const canAcceptAsCollegue = isToMe && s.statut === "proposee";
          const canCancel = isFromMe && s.statut === "proposee";
          const canValidateAsChef = chefMode && s.statut === "acceptee_collegue";
          const direction =
            s.type === "delegation" ? (
              <ArrowRight className="h-3.5 w-3.5" />
            ) : (
              <ArrowLeftRight className="h-3.5 w-3.5" />
            );

          return (
            <Card key={s.id} className="overflow-hidden">
              <CardContent className="p-0">
                <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2.5 text-xs">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="gap-1 text-[10px]">
                      {direction}
                      {s.type === "delegation" ? "Délégation" : "Échange"}
                    </Badge>
                    <Badge variant="outline" className={cn("text-[10px]", SWAP_STATUS_COLOR[s.statut])}>
                      {SWAP_STATUS_LABEL[s.statut]}
                    </Badge>
                  </div>
                  <span className="text-muted-foreground">
                    {format(new Date(s.created_at), "d MMM yyyy 'à' HH:mm", { locale: fr })}
                  </span>
                </div>

                <div className="grid gap-3 p-4 md:grid-cols-2">
                  <SlotCard
                    title={`De ${s.from_employe?.prenom ?? "?"} ${s.from_employe?.nom ?? ""}`}
                    date={s.from_assignation?.date}
                    demi={s.from_assignation?.demi_journee}
                    heures={s.from_assignation?.heures}
                    affaireNumero={s.from_assignation?.affaire?.numero}
                    affaireNom={s.from_assignation?.affaire?.nom}
                    metierLibelle={s.from_assignation?.metier?.libelle}
                    metierCouleur={s.from_assignation?.metier?.couleur}
                  />
                  {s.type === "echange" && s.to_assignation ? (
                    <SlotCard
                      title={`De ${s.to_employe?.prenom ?? "?"} ${s.to_employe?.nom ?? ""}`}
                      date={s.to_assignation.date}
                      demi={s.to_assignation.demi_journee}
                      heures={s.to_assignation.heures}
                      affaireNumero={s.to_assignation.affaire?.numero}
                      affaireNom={s.to_assignation.affaire?.nom}
                      metierLibelle={s.to_assignation.metier?.libelle}
                      metierCouleur={s.to_assignation.metier?.couleur}
                    />
                  ) : (
                    <div className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                      Délégation pour <strong>{s.to_employe?.prenom} {s.to_employe?.nom}</strong> (sans contrepartie).
                    </div>
                  )}
                </div>

                {(s.motif_demande || s.collegue_motif || s.chef_motif) && (
                  <div className="space-y-1 border-t border-border bg-muted/20 px-4 py-2 text-[11px]">
                    {s.motif_demande && (
                      <p>
                        <strong>Motif demande :</strong> {s.motif_demande}
                      </p>
                    )}
                    {s.collegue_motif && (
                      <p className="text-red-700 dark:text-red-400">
                        <strong>Refus collègue :</strong> {s.collegue_motif}
                      </p>
                    )}
                    {s.chef_motif && (
                      <p className="text-red-700 dark:text-red-400">
                        <strong>Décision chef :</strong> {s.chef_motif}
                      </p>
                    )}
                  </div>
                )}

                {(canAcceptAsCollegue || canCancel || canValidateAsChef) && (
                  <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-2.5">
                    {canCancel && (
                      <Button size="sm" variant="ghost" onClick={() => annuler(s)} disabled={busy === s.id}>
                        Annuler ma demande
                      </Button>
                    )}
                    {canAcceptAsCollegue && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setDecisionDialog({ swap: s, mode: "refuse_collegue", motif: "" })}
                          disabled={busy === s.id}
                          className="gap-1 text-red-700 hover:text-red-800 dark:text-red-400"
                        >
                          <X className="h-3.5 w-3.5" /> Refuser
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => accepterCollegue(s)}
                          disabled={busy === s.id}
                          className="gap-1"
                        >
                          {busy === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          Accepter
                        </Button>
                      </>
                    )}
                    {canValidateAsChef && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setDecisionDialog({ swap: s, mode: "reject_chef", motif: "" })}
                          disabled={busy === s.id}
                          className="gap-1 text-red-700 hover:text-red-800 dark:text-red-400"
                        >
                          <X className="h-3.5 w-3.5" /> Rejeter
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => validerChef(s)}
                          disabled={busy === s.id}
                          className="gap-1"
                        >
                          {busy === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          Valider et appliquer
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog
        open={decisionDialog !== null}
        onOpenChange={(o) => !o && setDecisionDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decisionDialog?.mode === "refuse_collegue" ? "Refuser l'échange" : "Rejeter l'échange"}
            </DialogTitle>
            <DialogDescription>
              {decisionDialog?.mode === "refuse_collegue"
                ? "Le collègue qui a proposé l'échange sera notifié de votre refus."
                : "Les deux employés seront notifiés du rejet."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Motif (obligatoire)</Label>
            <Textarea
              rows={3}
              value={decisionDialog?.motif ?? ""}
              onChange={(e) =>
                setDecisionDialog((d) => (d ? { ...d, motif: e.target.value } : d))
              }
              placeholder="Ex : conflit avec une autre mission, indisponible…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecisionDialog(null)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={submitDecision}
              disabled={!decisionDialog?.motif.trim()}
            >
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SlotCard({
  title,
  date,
  demi,
  heures,
  affaireNumero,
  affaireNom,
  metierLibelle,
  metierCouleur,
}: {
  title: string;
  date?: string;
  demi?: string;
  heures?: number;
  affaireNumero?: string;
  affaireNom?: string;
  metierLibelle?: string;
  metierCouleur?: string;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="mt-1 text-sm font-bold">
        {date ? format(new Date(date), "EEE d MMM", { locale: fr }) : "—"}
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          ({demi === "JOURNEE" ? "Journée" : demi}) · {heures}h
        </span>
      </div>
      <div className="mt-1 text-sm font-semibold">
        {affaireNumero ?? "—"} <span className="font-normal text-muted-foreground">— {affaireNom ?? ""}</span>
      </div>
      {metierLibelle && (
        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: metierCouleur ?? "#94a3b8" }}
          />
          {metierLibelle}
        </div>
      )}
    </div>
  );
}
