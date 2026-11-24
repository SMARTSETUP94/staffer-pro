import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Ban, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { devisKey } from "./api";
import type { CibleControle } from "@/lib/devis/controles-finalisation";

type Point = { code: string; niveau: "bloquant" | "avertissement"; cible: CibleControle; message: string; ligne_id?: string };
type Controles = { points: Point[]; bloquants: number; avertissements: number; empreinte: string };

/** Liste « Avant de valider » lue en base ; la base refait les mêmes contrôles au passage de statut. */
export function AvantValiderDialog({ devisId, cible, open, onOpenChange, onAller }: {
  devisId: string; cible: "valide" | "a_valider"; open: boolean; onOpenChange: (o: boolean) => void;
  onAller: (p: { cible: CibleControle; ligneId?: string }) => void;
}) {
  const qc = useQueryClient();
  const [c, setC] = useState<Controles | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirme, setConfirme] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  const lire = async () => {
    setErr(null); setConfirme(false);
    const { data, error } = await supabase.rpc("devis_controles_lire", { _devis_id: devisId });
    if (error) { setErr(error.message); setC(null); } else setC(data as unknown as Controles);
  };
  useEffect(() => { if (open) void lire(); else setC(null); }, [open, devisId]); // eslint-disable-line react-hooks/exhaustive-deps

  const valider = async () => {
    if (!c) return;
    setEnvoi(true);
    const r = cible === "valide"
      ? await supabase.rpc("devis_finaliser", { _devis_id: devisId, _confirmer_avertissements: confirme, _empreinte_controles: c.empreinte })
      : await supabase.rpc("devis_soumettre", { _devis_id: devisId, _note: confirme ? "Avertissements avant validation : je confirme." : "", _confirmer_avertissements: confirme, _empreinte_controles: c.empreinte });
    setEnvoi(false);
    await qc.invalidateQueries({ queryKey: devisKey(devisId) });
    if (r.error) { toast.error(r.error.message); void lire(); return; }
    toast.success(cible === "valide" ? "Devis finalisé" : "Devis passé « à valider »");
    onOpenChange(false);
  };

  const ok = !!c && c.bloquants === 0 && (c.avertissements === 0 || confirme);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Avant de valider</DialogTitle>
          <DialogDescription>{cible === "valide" ? "Contrôles avant de finaliser le devis." : "Contrôles avant de passer le devis « à valider »."} Cliquez un point pour aller à l'endroit concerné.</DialogDescription>
        </DialogHeader>
        {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
        {!c && !err && <p className="text-sm text-muted-foreground">Contrôle en cours…</p>}
        {c && c.points.length === 0 && <p className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-primary" />Aucun point à signaler.</p>}
        {c && c.points.length > 0 && (
          <ul className="space-y-1" aria-label="Points à vérifier">
            {c.points.map((p, i) => (
              <li key={`${p.code}-${p.ligne_id ?? ""}-${i}`}>
                <button type="button" onClick={() => { onOpenChange(false); onAller({ cible: p.cible, ...(p.ligne_id ? { ligneId: p.ligne_id } : {}) }); }}
                  className="flex w-full items-start gap-2 rounded-md border px-2 py-1.5 text-left text-sm hover:bg-muted">
                  {p.niveau === "bloquant" ? <Ban className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                  <span><span className={p.niveau === "bloquant" ? "font-medium text-destructive" : "font-medium"}>{p.niveau === "bloquant" ? "Bloquant" : "Avertissement"}</span> — {p.message}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {c && c.bloquants > 0 && <p className="text-sm text-destructive">Corrigez les points bloquants pour pouvoir continuer.</p>}
        {c && c.bloquants === 0 && c.avertissements > 0 && (
          <label className="flex items-start gap-2 rounded-md bg-muted p-2 text-sm">
            <Checkbox checked={confirme} onCheckedChange={(v) => setConfirme(v === true)} aria-label="je confirme" />
            <span><strong>Je confirme</strong> vouloir continuer malgré {c.avertissements} avertissement{c.avertissements > 1 ? "s" : ""} (confirmation enregistrée dans le journal du devis).</span>
          </label>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button disabled={!ok || envoi} onClick={() => void valider()}>{cible === "valide" ? "Finaliser le devis" : "Passer à valider"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
