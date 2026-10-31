import { createContext, useContext, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCapability } from "@/hooks/use-capability";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import { STATUT_LABEL } from "@/components/devis/editeur/api";
import { devisPipelineAction, versionSignaturePropose, type DevisBadge } from "@/lib/devis/pipeline";

type Ctx = { badges: Map<string, DevisBadge>; peutRediger: boolean; flag: boolean; refresh: () => void };
const DevisPipelineCtx = createContext<Ctx | null>(null);

/** Charge en un appel la dernière version de devis de chaque vignette affichée. */
export function DevisPipelineProvider({ affaireIds, children }: { affaireIds: string[]; children: React.ReactNode }) {
  const flag = useFeatureFlag("devis_staffing_v1");
  const peutRediger = useCapability("devis.rediger");
  const qc = useQueryClient();
  const key = ["devis-pipeline-badges", [...affaireIds].sort().join(",")];
  const q = useQuery({
    queryKey: key, enabled: flag && affaireIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("devis_derniers_par_affaire", { _affaire_ids: affaireIds.slice(0, 1000) });
      if (error) throw error;
      return new Map((data ?? []).map((r) => [r.affaire_id, { devis_id: r.devis_id, version: r.version, statut_redaction: r.statut_redaction } as DevisBadge]));
    },
  });
  return (
    <DevisPipelineCtx.Provider value={{ badges: q.data ?? new Map(), peutRediger, flag, refresh: () => void qc.invalidateQueries({ queryKey: ["devis-pipeline-badges"] }) }}>
      {children}
    </DevisPipelineCtx.Provider>
  );
}

const stop = { onClick: (e: React.SyntheticEvent) => e.stopPropagation(), onPointerDown: (e: React.SyntheticEvent) => e.stopPropagation(), onKeyDown: (e: React.SyntheticEvent) => e.stopPropagation() };

/** Bouton « Créer le devis » / « Ouvrir le devis » + badge version·statut sur une vignette. */
export function DevisPipelineBouton({ affaireId, statut, onStatutChange }: { affaireId: string; statut: string; onStatutChange?: (s: string) => void }) {
  const ctx = useContext(DevisPipelineCtx);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const modeles = useQuery({
    queryKey: ["devis-modeles-actifs"], enabled: open,
    queryFn: async () => ((await supabase.rpc("devis_modeles_lister", { _actifs_seulement: true })).data ?? []) as { id: string; modele_nom: string | null; modele_categorie: string | null }[],
  });
  if (!ctx) return null;
  const badge = ctx.badges.get(affaireId);
  const action = devisPipelineAction({ statut, badge, peutRediger: ctx.peutRediger, flag: ctx.flag });
  if (!action) return null;

  const ouvrir = (devisId: string) => navigate({ to: "/affaires/$affaireId/devis-staffing/$devisId", params: { affaireId, devisId } });
  const creer = async (modeleId: string | null) => {
    if (busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("devis_creer_depuis_pipeline", { _affaire_id: affaireId, _modele_id: modeleId as string });
    setBusy(false);
    if (error) return void toast.error("Création impossible", { description: error.message });
    const r = data as { devis_id: string; existant: boolean };
    setOpen(false);
    if (!r.existant) { toast.success("Brouillon R1 créé"); onStatutChange?.("a_l_etude"); }
    ctx.refresh();
    ouvrir(r.devis_id);
  };

  return (
    <div className="mt-2 flex items-center gap-1.5" {...stop}>
      {badge && (
        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
          R{badge.version} · {STATUT_LABEL[badge.statut_redaction].toLowerCase()}
        </span>
      )}
      <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px]" disabled={busy}
        onClick={() => (action === "ouvrir" && badge ? ouvrir(badge.devis_id) : setOpen(true))}>
        <FileText className="mr-1 h-3 w-3" />{action === "ouvrir" ? "Ouvrir le devis" : "Créer le devis"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent {...stop}>
          <DialogHeader>
            <DialogTitle>Créer le devis</DialogTitle>
            <DialogDescription>Le brouillon reprend le client, le contact et les dates de l'opportunité.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Button className="w-full" disabled={busy} onClick={() => void creer(null)}>Devis vierge</Button>
            <p className="pt-2 text-xs font-semibold uppercase text-muted-foreground">Depuis un modèle</p>
            {(modeles.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">{modeles.isLoading ? "Chargement…" : "Aucun modèle actif."}</p>}
            {(modeles.data ?? []).map((m) => (
              <Button key={m.id} variant="outline" className="w-full justify-start" disabled={busy} onClick={() => void creer(m.id)}>
                {m.modele_nom ?? "Modèle"}{m.modele_categorie ? ` · ${m.modele_categorie}` : ""}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Fenêtre « quelle version est signée ? » au passage en Gagné. */
export function DevisSigneChoixDialog({ affaireId, open, onOpenChange }: { affaireId: string | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [choix, setChoix] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["devis-staffing-list", affaireId], enabled: open && !!affaireId,
    queryFn: async () => ((await supabase.rpc("devis_lister", { _affaire_id: affaireId! })).data ?? []) as { id: string; numero: string; version: number; statut_redaction: string; total_ht: number | null }[],
  });
  const cands = (list.data ?? []).filter((d) => d.statut_redaction === "transfere" || d.statut_redaction === "valide");
  const propose = versionSignaturePropose(list.data ?? []);
  const sel = choix ?? propose?.id ?? null;
  const valider = async () => {
    if (!sel) return;
    const { error } = await supabase.rpc("devis_marquer_signe", { _devis_id: sel });
    if (error) return void toast.error("Impossible", { description: error.message });
    toast.success("Version signée enregistrée ; les autres versions ouvertes sont refusées.");
    qc.invalidateQueries({ queryKey: ["devis-pipeline-badges"] });
    qc.invalidateQueries({ queryKey: ["devis-staffing-list"] });
    onOpenChange(false);
  };
  return (
    <Dialog open={open && cands.length > 0} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Quelle version du devis est signée ?</DialogTitle>
          <DialogDescription>Elle passera en « Signé » ; les autres versions ouvertes passeront en « Refusé ».</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          {cands.map((d) => (
            <label key={d.id} className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm">
              <input type="radio" checked={sel === d.id} onChange={() => setChoix(d.id)} />
              <span className="font-mono">{d.numero}</span>
              <span className="text-muted-foreground">{STATUT_LABEL[d.statut_redaction as keyof typeof STATUT_LABEL]}</span>
              {d.total_ht != null && <span className="ml-auto tabular-nums">{Number(d.total_ht).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })} HT</span>}
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Plus tard</Button>
          <Button disabled={!sel} onClick={() => void valider()}>Confirmer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Bandeau tant qu'une opportunité gagnée n'a pas de version signée désignée. */
export function DevisSigneBandeau({ affaireId }: { affaireId: string }) {
  const flag = useFeatureFlag("devis_staffing_v1");
  const [open, setOpen] = useState(false);
  const aff = useQuery({
    queryKey: ["affaire-statut-opp", affaireId], enabled: flag,
    queryFn: async () => (await supabase.from("affaires").select("statut_opportunite").eq("id", affaireId).maybeSingle()).data,
  });
  const statut = aff.data?.statut_opportunite ?? null;
  const list = useQuery({
    queryKey: ["devis-staffing-list", affaireId], enabled: flag && statut === "gagne",
    queryFn: async () => ((await supabase.rpc("devis_lister", { _affaire_id: affaireId })).data ?? []) as { id: string; version: number; statut_redaction: string }[],
  });
  const d = list.data ?? [];
  if (!flag || statut !== "gagne" || d.some((x) => x.statut_redaction === "signe") || !versionSignaturePropose(d)) return null;
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-sm">
      <span>Opportunité gagnée : choisissez la version du devis signée.</span>
      <Button size="sm" onClick={() => setOpen(true)}>Choisir la version signée</Button>
      <DevisSigneChoixDialog affaireId={affaireId} open={open} onOpenChange={setOpen} />
    </div>
  );
}
