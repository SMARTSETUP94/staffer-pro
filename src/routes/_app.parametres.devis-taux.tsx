import { createFileRoute, Link } from "@tanstack/react-router";
import { ancrePoste } from "@/lib/devis/editeur-lisibilite";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Save } from "lucide-react";
import { requireCapability } from "@/lib/capability-guard";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { evaluerTaux, niveauInitial, NOUVEAU_NIVEAU, parseMontant } from "@/lib/devis/taux-form";
import { DevisSupprimesCard } from "@/components/devis/DevisSupprimesCard";

export const Route = createFileRoute("/_app/parametres/devis-taux")({
  beforeLoad: () => requireCapability("devis.parametres"),
  head: () => ({ meta: [{ title: "Taux et forfaits des devis — Paramètres" }] }),
  component: DevisTauxPage,
});

type TauxRow = {
  poste_id: string; code: string; libelle: string; metier_id: number | null; ordre: number;
  niveau: string | null; date_effet: string | null; taux_vente: number | null;
  cout_revient: number | null; par_defaut: boolean | null; actif: boolean;
};

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
  const taux = useQuery({
    queryKey: ["devis-taux"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("devis_taux_lister");
      if (error) throw error;
      return (data ?? []) as TauxRow[];
    },
  });
  const metiers = useQuery({
    queryKey: ["metiers-min"],
    queryFn: async () => (await supabase.from("metiers").select("id,libelle").order("ordre")).data ?? [],
  });
  const params = useQuery({
    queryKey: ["devis-parametres"],
    queryFn: async () => (await supabase.from("v_devis_parametres_courants").select("*")).data ?? [],
  });
  const hist = useQuery({
    queryKey: ["devis-taux-hist"],
    queryFn: async () =>
      (await supabase.from("devis_taux_historique").select("*").order("cree_le", { ascending: false }).limit(30)).data ?? [],
  });
  const compteBe = useQuery({
    queryKey: ["devis-postes-be"],
    queryFn: async () => new Map(((await supabase.from("devis_postes_ref").select("id,compte_be")).data ?? []).map((p) => [p.id, p.compte_be] as const)),
  });
  const refresh = () => {
    for (const k of ["devis-taux", "devis-parametres", "devis-taux-hist", "devis-postes-be"]) qc.invalidateQueries({ queryKey: [k] });
  };

  const postes = new Map<string, { row: TauxRow; niveaux: TauxRow[] }>();
  for (const r of taux.data ?? []) {
    const p = postes.get(r.poste_id) ?? { row: r, niveaux: [] };
    if (r.niveau) p.niveaux.push(r);
    postes.set(r.poste_id, p);
  }

  const [newPoste, setNewPoste] = useState({ code: "", libelle: "", metier_id: "" });

  const run = async (p: PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    const { error } = await p;
    if (error) { toast.error(error.message); return false; }
    toast.success(ok); refresh(); return true;
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Devis — taux et forfaits</h1>
        <p className="text-sm text-muted-foreground">
          Une hausse crée une nouvelle ligne datée : les devis existants gardent leurs taux. Rien n'est jamais supprimé.{" "}
          <Link to="/parametres/devis-materiaux" className="underline">Catalogue matériaux →</Link>{" "}<Link to="/parametres/devis-modeles" className="underline">Modèles →</Link>
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Grille des taux</CardTitle><CardDescription>Taux de vente et coût de revient en €/h, par poste et niveau.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Poste</TableHead><TableHead>Métier planning</TableHead><TableHead>Compte en BE</TableHead><TableHead>Niveaux en vigueur</TableHead><TableHead>Actif</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {[...postes.values()].map(({ row, niveaux }) => (
                <PosteRow key={row.poste_id} row={row} niveaux={niveaux} metiers={metiers.data ?? []} run={run} compteBe={compteBe.data?.get(row.poste_id) ?? false} />
              ))}
            </TableBody>
          </Table>
          <div className="flex flex-wrap items-end gap-2 border-t pt-4">
            <Input className="w-40" placeholder="code" value={newPoste.code} onChange={(e) => setNewPoste({ ...newPoste, code: e.target.value })} />
            <Input className="w-56" placeholder="Libellé" value={newPoste.libelle} onChange={(e) => setNewPoste({ ...newPoste, libelle: e.target.value })} />
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={newPoste.metier_id} onChange={(e) => setNewPoste({ ...newPoste, metier_id: e.target.value })}>
              <option value="">Métier…</option>
              {(metiers.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.libelle}</option>)}
            </select>
            <Button disabled={!newPoste.code || !newPoste.libelle} onClick={() => run(supabase.rpc("devis_poste_enregistrer", {
              _id: null as unknown as string, _code: newPoste.code.trim(), _libelle: newPoste.libelle.trim(),
              _metier_id: newPoste.metier_id ? Number(newPoste.metier_id) : (null as unknown as number), _ordre: 500, _actif: true,
            }), "Poste ajouté").then(() => setNewPoste({ code: "", libelle: "", metier_id: "" }))}>
              <Plus className="mr-1 h-4 w-4" />Ajouter un poste
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader id="forfaits" className="scroll-mt-24"><CardTitle>Forfaits et paramètres</CardTitle><CardDescription>Chaque modification crée une valeur datée.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {(params.data ?? []).map((p) => <ParamRow key={p.cle as string} p={p as never} run={run} />)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Historique</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Objet</TableHead><TableHead>Avant</TableHead><TableHead>Après</TableHead></TableRow></TableHeader>
            <TableBody>
              {(hist.data ?? []).map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="whitespace-nowrap">{new Date(h.cree_le).toLocaleString("fr-FR")}</TableCell>
                  <TableCell>{h.objet}</TableCell>
                  <TableCell className="text-xs">{resume(h.ancien)}</TableCell>
                  <TableCell className="text-xs">{resume(h.nouveau)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <DevisSupprimesCard />
    </div>
  );
}

function resume(j: unknown): string {
  if (!j || typeof j !== "object") return "—";
  const o = j as Record<string, unknown>;
  return [o.libelle, o.niveau, o.cle, o.taux_vente != null ? `vente ${o.taux_vente} €/h` : null, o.cout_revient != null ? `coût ${o.cout_revient} €/h` : null, o.valeur, o.date_effet]
    .filter((x) => x != null && x !== "").join(" · ");
}

type Run = (p: PromiseLike<{ error: { message: string } | null }>, ok: string) => Promise<boolean>;

function PosteRow({ row, niveaux, metiers, run, compteBe }: { row: TauxRow; niveaux: TauxRow[]; metiers: { id: number; libelle: string }[]; run: Run; compteBe: boolean }) {
  const [libelle, setLibelle] = useState(row.libelle);
  const save = (patch: Partial<{ libelle: string; metier_id: number | null; actif: boolean }>) =>
    run(supabase.rpc("devis_poste_enregistrer", {
      _id: row.poste_id, _code: row.code, _libelle: patch.libelle ?? row.libelle,
      _metier_id: (patch.metier_id !== undefined ? patch.metier_id : row.metier_id) as number,
      _ordre: row.ordre, _actif: patch.actif ?? row.actif,
    }), "Poste enregistré");
  return (
    <TableRow id={ancrePoste(row.libelle)} className={`scroll-mt-24 target:bg-warning/15 target:ring-2 target:ring-warning ${row.actif ? "" : "opacity-50"}`}>
      <TableCell>
        <div className="flex gap-1">
          <Input className="h-8 w-44" value={libelle} onChange={(e) => setLibelle(e.target.value)} />
          {libelle !== row.libelle && <Button size="icon" variant="ghost" onClick={() => save({ libelle })}><Save className="h-4 w-4" /></Button>}
        </div>
        <span className="text-xs text-muted-foreground">{row.code}</span>
      </TableCell>
      <TableCell>
        <select className="h-8 rounded-md border bg-background px-2 text-sm" value={row.metier_id ?? ""} onChange={(e) => save({ metier_id: e.target.value ? Number(e.target.value) : null })}>
          <option value="">—</option>
          {metiers.map((m) => <option key={m.id} value={m.id}>{m.libelle}</option>)}
        </select>
      </TableCell>
      <TableCell>
        <Switch checked={compteBe} aria-label="Compte en bureau d'étude"
          onCheckedChange={(v) => run(supabase.rpc("devis_poste_compte_be", { _id: row.poste_id, _compte: v }), "Poste mis à jour")} />
      </TableCell>
      <TableCell className="space-y-2">
        <div className="flex flex-wrap gap-1">
          {niveaux.map((n) => (
            <Badge key={n.niveau!} variant={n.par_defaut ? "default" : "secondary"}>
              {n.niveau} : {n.taux_vente == null ? "à saisir" : `${n.taux_vente} €/h`}
              {n.cout_revient != null && ` (coût ${n.cout_revient})`} · {n.date_effet && new Date(n.date_effet).toLocaleDateString("fr-FR")}
            </Badge>
          ))}
        </div>
        <TauxForm row={row} niveaux={niveaux} run={run} />
      </TableCell>
      <TableCell><Switch checked={row.actif} onCheckedChange={(v) => save({ actif: v })} /></TableCell>
    </TableRow>
  );
}

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

function TauxForm({ row, niveaux, run }: { row: TauxRow; niveaux: TauxRow[]; run: Run }) {
  const courants = niveaux.map((n) => ({ niveau: n.niveau!, taux_vente: n.taux_vente, cout_revient: n.cout_revient, par_defaut: n.par_defaut }));
  const prefill = (choix: string) => {
    const c = courants.find((n) => n.niveau === choix);
    return {
      choix, nouveauNiveau: choix === NOUVEAU_NIVEAU && courants.length === 0 ? "standard" : "",
      taux: c?.taux_vente != null ? String(c.taux_vente).replace(".", ",") : "",
      cout: c?.cout_revient != null ? String(c.cout_revient).replace(".", ",") : "",
      date: today(), defaut: c ? !!c.par_defaut : courants.length === 0,
    };
  };
  const [nv, setNv] = useState(() => prefill(niveauInitial(courants)));
  const [busy, setBusy] = useState(false);
  const ev = evaluerTaux(nv, courants);
  const erreur = !ev.ok && ev.erreur ? ev.raison : null;
  const id = row.poste_id;
  const enregistrer = async () => {
    if (!ev.ok) return;
    setBusy(true);
    const ok = await run(supabase.rpc("devis_taux_ajouter", {
      _poste_id: id, _niveau: ev.niveau, _date_effet: nv.date,
      _taux_vente: ev.taux_vente as number, _cout_revient: ev.cout_revient as number, _par_defaut: nv.defaut,
    }), "Taux enregistré");
    setBusy(false);
    if (ok) setNv({ ...prefill(ev.niveau), choix: ev.niveau, taux: ev.taux_vente != null ? String(ev.taux_vente).replace(".", ",") : "", cout: ev.cout_revient != null ? String(ev.cout_revient).replace(".", ",") : "" });
  };
  return (
    <div className="space-y-1 rounded-md border border-foreground/20 bg-muted/40 p-2">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className={LBL} htmlFor={`niv-${id}`}>Niveau</label>
          <select id={`niv-${id}`} className={`${FIELD} rounded-md border px-2 text-sm`} value={nv.choix} onChange={(e) => setNv(prefill(e.target.value))}>
            {courants.map((n) => <option key={n.niveau} value={n.niveau}>{n.niveau}{n.par_defaut ? " (défaut)" : ""}</option>)}
            <option value={NOUVEAU_NIVEAU}>Nouveau niveau…</option>
          </select>
        </div>
        {nv.choix === NOUVEAU_NIVEAU && (
          <div>
            <label className={LBL} htmlFor={`nn-${id}`}>Nom du niveau</label>
            <Input id={`nn-${id}`} className={`${FIELD} w-28`} placeholder="ex. senior" value={nv.nouveauNiveau} onChange={(e) => setNv({ ...nv, nouveauNiveau: e.target.value })} />
          </div>
        )}
        <div>
          <label className={LBL} htmlFor={`tv-${id}`}>Vente €/h</label>
          <Input id={`tv-${id}`} className={`${FIELD} w-24 text-right tabular-nums`} placeholder="inchangé" inputMode="decimal" value={nv.taux} onChange={(e) => setNv({ ...nv, taux: e.target.value })} />
        </div>
        <div>
          <label className={LBL} htmlFor={`cr-${id}`}>Coût €/h</label>
          <Input id={`cr-${id}`} className={`${FIELD} w-24 text-right tabular-nums`} placeholder="inchangé" inputMode="decimal" value={nv.cout} onChange={(e) => setNv({ ...nv, cout: e.target.value })} />
        </div>
        <div>
          <label className={LBL} htmlFor={`de-${id}`}>Date d'effet</label>
          <Input id={`de-${id}`} className={`${FIELD} w-36`} type="date" required value={nv.date} onChange={(e) => setNv({ ...nv, date: e.target.value })} />
        </div>
        <label className="flex h-8 items-center gap-1 text-xs"><input type="checkbox" checked={nv.defaut} onChange={(e) => setNv({ ...nv, defaut: e.target.checked })} />Niveau par défaut</label>
        <WhyButton raison={ev.ok ? null : ev.raison}>
          <Button size="sm" disabled={!ev.ok || busy} onClick={enregistrer}><Save className="mr-1 h-4 w-4" />Enregistrer le taux</Button>
        </WhyButton>
      </div>
      {erreur && <p role="alert" className="text-xs font-medium text-destructive">{erreur}</p>}
    </div>
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
