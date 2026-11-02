import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const SUPPRESSION_REFUSEE = "Un devis validé, envoyé ou signé ne se supprime pas : utilisez « Marquer refusé » ou « Nouvelle version ».";

/** Seuls les brouillons et les devis à valider peuvent être supprimés. */
export const devisSupprimable = (statut: string) => statut === "brouillon" || statut === "a_valider";

/** Fenêtre de confirmation : l'utilisateur retape le numéro du devis. */
export function SupprimerDevisDialog({ devis, open, onOpenChange, onDone }: {
  devis: { id: string; numero: string } | null; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void;
}) {
  const [saisie, setSaisie] = useState("");
  const [busy, setBusy] = useState(false);
  const ok = !!devis && saisie.trim() === devis.numero;
  const go = async () => {
    if (!devis || !ok || busy) return;
    setBusy(true);
    const { error } = await supabase.rpc("devis_supprimer", { _devis_id: devis.id });
    setBusy(false);
    if (error) return void toast.error("Suppression impossible", { description: error.message });
    toast.success(`Devis ${devis.numero} supprimé`, { description: "Un admin peut le restaurer pendant 30 jours." });
    setSaisie("");
    onOpenChange(false);
    onDone();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setSaisie(""); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Supprimer le devis {devis?.numero}</DialogTitle>
          <DialogDescription>
            Le devis disparaît des listes, du pipeline et de la charge BE. Le statut de l'opportunité ne change pas.
            Un admin peut le restaurer pendant 30 jours. Pour confirmer, tapez <strong className="font-mono">{devis?.numero}</strong>.
          </DialogDescription>
        </DialogHeader>
        <Input autoFocus value={saisie} onChange={(e) => setSaisie(e.target.value)} placeholder={devis?.numero}
          onKeyDown={(e) => { if (e.key === "Enter") void go(); }} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button variant="destructive" disabled={!ok || busy} onClick={() => void go()}>Supprimer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
