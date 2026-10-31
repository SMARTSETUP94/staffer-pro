import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useAffecterRole } from "@/hooks/use-equipe-projet";
import { EmployeRoleCombobox } from "@/components/affaire/EquipeProjetBloc";
import { alerteChargeBe, proposerPeriodeBe } from "@/lib/devis/charge-be";
import { formatJoursBe } from "@/lib/devis/pipeline";

const FAB_METIERS = [1, 2, 3, 4, 5, 9];

type Charge = { affaire_id: string; numero: string; version: number; jours_be: number; heures_be: number; etat: "previsionnel" | "confirme" };
type Aff = { id: string; numero: string | null; nom: string | null; date_montage: string | null };

/** Charge bureau d'étude calculée depuis le devis de référence, avec alerte et bouton « Planifier ». */
export function ChargeBeSection({ canEdit }: { canEdit: boolean }) {
  const [plan, setPlan] = useState<{ aff: Aff; charge: Charge; butoir: string | null } | null>(null);
  const q = useQuery({
    queryKey: ["pilotage-charge-be"],
    queryFn: async () => {
      const { data: affs, error } = await supabase.from("affaires").select("id,numero,nom,date_montage,phase,statut_opportunite")
        .is("archived_at", null).or("statut_opportunite.in.(presque_gagne,gagne),phase.eq.signe").limit(1000);
      if (error) throw error;
      const ids = (affs ?? []).map((a) => a.id);
      if (ids.length === 0) return [];
      const { data: ch, error: e2 } = await supabase.rpc("devis_charge_be", { _affaire_ids: ids });
      if (e2) throw e2;
      const avec = (ch ?? []) as unknown as Charge[];
      if (avec.length === 0) return [];
      const idsC = avec.map((c) => c.affaire_id);
      const [roles, pm] = await Promise.all([
        supabase.from("affaire_roles").select("affaire_id,date_debut,date_fin").eq("role", "concepteur").in("affaire_id", idsC),
        supabase.from("affaire_planning_metier").select("affaire_id,metier_id,date_debut").in("affaire_id", idsC).in("metier_id", FAB_METIERS),
      ]);
      return avec.map((c) => {
        const aff = (affs ?? []).find((a) => a.id === c.affaire_id)! as Aff;
        const periodes = (roles.data ?? []).filter((r) => r.affaire_id === c.affaire_id);
        const fab = (pm.data ?? []).filter((p) => p.affaire_id === c.affaire_id && p.date_debut).map((p) => p.date_debut as string).sort()[0] ?? null;
        return { charge: { ...c, jours_be: Number(c.jours_be) }, aff, alerte: alerteChargeBe(Number(c.jours_be), periodes), butoir: fab ?? aff.date_montage };
      }).sort((a, b) => (a.aff.numero ?? "").localeCompare(b.aff.numero ?? ""));
    },
  });
  const rows = q.data ?? [];
  if (rows.length === 0) return null;
  return (
    <div className="rounded-xl border border-border">
      <div className="border-b border-border bg-card px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Charge bureau d'étude (devis) — ligne concepteur</div>
      {rows.map(({ charge, aff, alerte, butoir }) => (
        <div key={aff.id} className="flex flex-wrap items-center gap-2 border-b border-border/60 px-2 py-1.5 text-sm last:border-b-0">
          <span className="font-mono text-xs font-bold text-primary">{aff.numero}</span>
          <span className="min-w-0 flex-1 truncate">{aff.nom}</span>
          <span data-etat={charge.etat}
            title={charge.etat === "confirme" ? "Confirmé (gagné / signé)" : "Prévisionnel (presque gagné)"}
            className={cn("rounded px-2 py-0.5 text-xs font-semibold",
              charge.etat === "confirme" ? "bg-primary text-primary-foreground"
                : "border border-dashed border-primary/50 bg-primary/5 [background-image:repeating-linear-gradient(45deg,transparent_0_4px,color-mix(in_oklab,var(--primary)_18%,transparent)_4px_8px)] text-foreground")}>
            {formatJoursBe(charge.jours_be)} BE (devis R{charge.version})
          </span>
          {alerte && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
              <AlertTriangle className="h-3 w-3" />{alerte === "aucune_periode" ? "Aucune période concepteur" : "Période concepteur trop courte"}
            </span>
          )}
          {canEdit && alerte && (
            <Button size="sm" variant="outline" className="h-7" onClick={() => setPlan({ aff, charge, butoir })}>
              <CalendarPlus className="mr-1 h-3.5 w-3.5" />Planifier
            </Button>
          )}
        </div>
      ))}
      {plan && <PlanifierDialog {...plan} onClose={() => setPlan(null)} />}
    </div>
  );
}

function PlanifierDialog({ aff, charge, butoir, onClose }: { aff: Aff; charge: Charge; butoir: string | null; onClose: () => void }) {
  const affecter = useAffecterRole();
  const qc = useQueryClient();
  const prop = proposerPeriodeBe(charge.jours_be, butoir, new Date().toISOString().slice(0, 10));
  const [employeId, setEmployeId] = useState<string | null>(null);
  const [debut, setDebut] = useState(prop.debut);
  const [fin, setFin] = useState(prop.fin);
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!employeId) return;
    setSaving(true);
    try {
      await affecter({ affaireId: aff.id, role: "concepteur", employeId, dateDebut: debut, dateFin: fin, remplacerDates: true });
      toast.success("Période concepteur enregistrée");
      qc.invalidateQueries({ queryKey: ["pilotage-charge-be"] });
      qc.invalidateQueries({ queryKey: ["planning-pilotage"] });
      onClose();
    } catch (e) { toast.error("Enregistrement impossible", { description: e instanceof Error ? e.message : String(e) }); }
    finally { setSaving(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Planifier le bureau d'étude – {aff.numero} {aff.nom}</DialogTitle>
          <DialogDescription>
            {formatJoursBe(charge.jours_be)} d'après le devis R{charge.version}. Période proposée en jours ouvrés{butoir ? `, avant le ${new Date(butoir).toLocaleDateString("fr-FR")}` : ""}. Choisissez le dessinateur puis validez.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <EmployeRoleCombobox role="concepteur" value={employeId} onChange={setEmployeId} />
          <div className="flex items-center gap-2">
            <Input type="date" aria-label="Début" value={debut} onChange={(e) => setDebut(e.target.value)} />
            <span>→</span>
            <Input type="date" aria-label="Fin" value={fin} onChange={(e) => setFin(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={() => void save()} disabled={saving || !employeId || !debut}>Valider</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
