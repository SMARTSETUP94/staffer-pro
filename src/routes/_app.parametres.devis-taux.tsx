import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { requireCapability } from "@/lib/capability-guard";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { parseMontant } from "@/lib/devis/taux-form";
import { estParametreHorsBareme } from "@/lib/devis/bareme";
import { BaremeTableur } from "@/components/devis/bareme/BaremeTableur";
import { DevisSupprimesCard } from "@/components/devis/DevisSupprimesCard";
import { EntrepriseDevisParametres } from "@/components/devis/EntrepriseDevisParametres";
import { CgvVersions } from "@/components/devis/parametres/CgvVersions";

export const Route = createFileRoute("/_app/parametres/devis-taux")({
  beforeLoad: () => requireCapability("devis.parametres"),
  head: () => ({ meta: [{ title: "Barème coût et vente — Devis SET UP" }, { name: "description", content: "Paramètres entreprise et devis SET UP : identité, conditions de paiement, mentions et tarifs." }, { property: "og:title", content: "Paramètres des devis SET UP" }, { property: "og:description", content: "Identité entreprise, documents client et tarifs des devis SET UP." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: DevisTauxPage,
});

const PARAM_LABELS: Record<string, string> = {
  repas: "Repas", frais_horaire: "Frais horaires", coursier_22m3: "Coursier 22 m³",
  semi_remorque: "Semi-remorque", coef_materiaux: "Coefficient matériaux",
  seuil_alerte_taux_pct: "Seuil d'alerte taux modifié", validite_jours: "Validité du devis", tva_pct: "TVA", heures_par_jour_be: "Heures par jour bureau d'étude",
  proba_a_faire: "Probabilité pipeline — à faire", proba_envoye: "Probabilité pipeline — envoyé", proba_a_l_etude: "Probabilité pipeline — à l'étude", proba_presque_gagne: "Probabilité pipeline — presque gagné",
  cout_repas: "Coût — repas", cout_frais_horaire: "Coût — frais horaires", cout_coursier_22m3: "Coût — coursier 22 m³", cout_semi_remorque: "Coût — semi-remorque",
};

const today = () => new Date().toISOString().slice(0, 10);

function DevisTauxPage() {
  const qc = useQueryClient();
  const params = useQuery({
    queryKey: ["devis-parametres"],
    queryFn: async () => (await supabase.from("v_devis_parametres_courants").select("*")).data ?? [],
  });
  const tauxCharges = !!params.data;
  useEffect(() => {
    if (!tauxCharges || !window.location.hash) return;
    const t = setTimeout(() => {
      const el = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
      if (el) { el.scrollIntoView({ block: "center" }); const h = window.location.hash; history.replaceState(null, "", " "); window.location.hash = h; }
    }, 300);
    return () => clearTimeout(t);
  }, [tauxCharges]);
  const run: Run = async (p, ok) => {
    const { error } = await p;
    if (error) { toast.error(error.message); return false; }
    toast.success(ok); qc.invalidateQueries({ queryKey: ["devis-parametres"] }); return true;
  };
  const horsBareme = (params.data ?? []).filter((p) => estParametreHorsBareme(p.cle as string));

  return (
    <div className="space-y-6 p-3 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Devis — barème coût et vente</h1>
        <p className="text-sm text-muted-foreground">
          Modifiez les cellules puis « Enregistrer » : chaque changement crée une version datée, les devis déjà rédigés gardent leurs prix.{" "}
          <Link to="/parametres/devis-materiaux" className="underline">Catalogue matériaux →</Link>{" "}<Link to="/parametres/devis-modeles" className="underline">Modèles →</Link>{" "}<Link to="/parametres/pennylane" className="underline">Rapprochement Pennylane →</Link>{" "}<Link to="/parametres/articles-sans-prix" className="underline">Articles sans prix →</Link>
        </p>
      </div>
      <BaremeTableur />
      <AjoutPoste run={run} />
      <Card>
        <Collapsible>
          <CardHeader><CollapsibleTrigger className="text-left"><CardTitle className="text-base">Pipeline et planning des opportunités ▾</CardTitle>
            <CardDescription>Probabilités du <Link to="/opportunites" className="underline">pipeline</Link> et réglages du <Link to="/planning-opportunites" className="underline">planning des opportunités</Link> (hors barème devis).</CardDescription></CollapsibleTrigger></CardHeader>
          <CollapsibleContent><CardContent className="grid gap-3 md:grid-cols-2">
            {horsBareme.map((p) => <ParamRow key={p.cle as string} p={p as never} run={run} />)}
          </CardContent></CollapsibleContent>
        </Collapsible>
      </Card>
      <EntrepriseDevisParametres />
      <CgvVersions />
      <DevisSupprimesCard />
    </div>
  );
}

function AjoutPoste({ run }: { run: Run }) {
  const qc = useQueryClient();
  const metiers = useQuery({ queryKey: ["metiers-min"], queryFn: async () => (await supabase.from("metiers").select("id,libelle").order("ordre")).data ?? [] });
  const [n, setN] = useState({ code: "", libelle: "", metier_id: "" });
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed p-3">
      <span className="w-full text-sm font-medium">Nouveau poste de main-d'œuvre</span>
      <Input className="w-32" placeholder="code" value={n.code} onChange={(e) => setN({ ...n, code: e.target.value })} />
      <Input className="w-52" placeholder="Libellé" value={n.libelle} onChange={(e) => setN({ ...n, libelle: e.target.value })} />
      <select aria-label="Métier" className="h-9 rounded-md border bg-background px-2 text-sm" value={n.metier_id} onChange={(e) => setN({ ...n, metier_id: e.target.value })}>
        <option value="">Métier…</option>
        {(metiers.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.libelle}</option>)}
      </select>
      <Button size="sm" variant="outline" disabled={!n.code || !n.libelle} onClick={() => void run(supabase.rpc("devis_poste_enregistrer", {
        _id: null as unknown as string, _code: n.code.trim(), _libelle: n.libelle.trim(),
        _metier_id: n.metier_id ? Number(n.metier_id) : (null as unknown as number), _ordre: 500, _actif: true,
      }), "Poste ajouté — saisissez ses taux dans le tableau").then((ok) => { if (ok) { setN({ code: "", libelle: "", metier_id: "" }); qc.invalidateQueries({ queryKey: ["devis-taux"] }); } })}>
        <Plus className="mr-1 h-4 w-4" />Ajouter un poste
      </Button>
    </div>
  );
}

type Run = (p: PromiseLike<{ error: { message: string } | null }>, ok: string) => Promise<boolean>;

const FIELD = "h-8 border-foreground/40 bg-background placeholder:italic placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring";
const LBL = "mb-0.5 block text-xs font-medium text-foreground";

function WhyButton({ raison, children }: { raison: string | null; children: React.ReactNode }) {
  if (!raison) return <>{children}</>;
  return (
    <TooltipProvider><Tooltip>
      <TooltipTrigger asChild><span tabIndex={0} className="inline-flex">{children}</span></TooltipTrigger>
      <TooltipContent>{raison}</TooltipContent>
    </Tooltip></TooltipProvider>
  );
}

function ParamRow({ p, run }: { p: { cle: string; valeur: number | null; unite: string | null; date_effet: string }; run: Run }) {
  const actuel = p.valeur == null ? "" : String(p.valeur).replace(".", ",");
  const [v, setV] = useState(actuel);
  const [d, setD] = useState(today());
  const val = parseMontant(v);
  const raison = v.trim() === "" ? "Saisissez une valeur." : Number.isNaN(val) ? "Nombre positif attendu (virgule acceptée)."
    : val === p.valeur ? "Valeur identique à la valeur en vigueur." : !d ? "La date d'effet est obligatoire." : null;
  const erreur = Number.isNaN(val) || !d ? raison : null;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-52">
          <span className="block text-sm font-medium">{PARAM_LABELS[p.cle] ?? p.cle}</span>
          <span className="text-xs text-muted-foreground">Actuel : {p.valeur == null ? "non renseigné" : `${actuel} ${p.unite ?? ""}`}{p.date_effet && ` · depuis le ${new Date(p.date_effet).toLocaleDateString("fr-FR")}`}</span>
        </div>
        <div>
          <label className={LBL} htmlFor={`pv-${p.cle}`}>Valeur {p.unite ? `(${p.unite})` : ""}</label>
          <Input id={`pv-${p.cle}`} className={`${FIELD} w-24 text-right tabular-nums`} inputMode="decimal" placeholder="à saisir" value={v} onChange={(e) => setV(e.target.value)} />
        </div>
        <div>
          <label className={LBL} htmlFor={`pd-${p.cle}`}>Date d'effet</label>
          <Input id={`pd-${p.cle}`} className={`${FIELD} w-36`} type="date" value={d} onChange={(e) => setD(e.target.value)} />
        </div>
        <WhyButton raison={raison}>
          <Button size="sm" variant="outline" disabled={!!raison} onClick={() => run(supabase.rpc("devis_parametre_ajouter", {
            _cle: p.cle, _valeur: val as number, _unite: p.unite as string, _date_effet: d,
          }), "Paramètre enregistré")}>OK</Button>
        </WhyButton>
      </div>
      {erreur && <p role="alert" className="text-xs font-medium text-destructive">{erreur}</p>}
    </div>
  );
}
