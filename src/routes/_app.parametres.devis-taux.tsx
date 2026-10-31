import { createFileRoute, Link } from "@tanstack/react-router";
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
  seuil_alerte_taux_pct: "Seuil d'alerte taux modifié", validite_jours: "Validité du devis", tva_pct: "TVA",
};

const today = () => new Date().toISOString().slice(0, 10);
const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

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
  const refresh = () => {
    for (const k of ["devis-taux", "devis-parametres", "devis-taux-hist"]) qc.invalidateQueries({ queryKey: [k] });
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
    if (error) toast.error(error.message);
    else { toast.success(ok); refresh(); }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Devis — taux et forfaits</h1>
        <p className="text-sm text-muted-foreground">
          Une hausse crée une nouvelle ligne datée : les devis existants gardent leurs taux. Rien n'est jamais supprimé.{" "}
          <Link to="/parametres/devis-materiaux" className="underline">Catalogue matériaux →</Link>
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Grille des taux</CardTitle><CardDescription>Taux de vente et coût de revient en €/h, par poste et niveau.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Poste</TableHead><TableHead>Métier planning</TableHead><TableHead>Niveaux en vigueur</TableHead><TableHead>Actif</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {[...postes.values()].map(({ row, niveaux }) => (
                <PosteRow key={row.poste_id} row={row} niveaux={niveaux} metiers={metiers.data ?? []} run={run} />
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
        <CardHeader><CardTitle>Forfaits et paramètres</CardTitle><CardDescription>Chaque modification crée une valeur datée.</CardDescription></CardHeader>
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
    </div>
  );
}

function resume(j: unknown): string {
  if (!j || typeof j !== "object") return "—";
  const o = j as Record<string, unknown>;
  return [o.libelle, o.niveau, o.cle, o.taux_vente != null ? `${o.taux_vente} €/h` : null, o.valeur, o.date_effet]
    .filter((x) => x != null && x !== "").join(" · ");
}

type Run = (p: PromiseLike<{ error: { message: string } | null }>, ok: string) => Promise<void>;

function PosteRow({ row, niveaux, metiers, run }: { row: TauxRow; niveaux: TauxRow[]; metiers: { id: number; libelle: string }[]; run: Run }) {
  const [libelle, setLibelle] = useState(row.libelle);
  const [nv, setNv] = useState({ niveau: "", taux: "", cout: "", date: today(), defaut: false });
  const save = (patch: Partial<{ libelle: string; metier_id: number | null; actif: boolean }>) =>
    run(supabase.rpc("devis_poste_enregistrer", {
      _id: row.poste_id, _code: row.code, _libelle: patch.libelle ?? row.libelle,
      _metier_id: (patch.metier_id !== undefined ? patch.metier_id : row.metier_id) as number,
      _ordre: row.ordre, _actif: patch.actif ?? row.actif,
    }), "Poste enregistré");
  return (
    <TableRow className={row.actif ? "" : "opacity-50"}>
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
      <TableCell className="space-y-2">
        <div className="flex flex-wrap gap-1">
          {niveaux.map((n) => (
            <Badge key={n.niveau!} variant={n.par_defaut ? "default" : "secondary"}>
              {n.niveau} : {n.taux_vente == null ? "à saisir" : `${n.taux_vente} €/h`}
              {n.cout_revient != null && ` (coût ${n.cout_revient})`} · {n.date_effet && new Date(n.date_effet).toLocaleDateString("fr-FR")}
            </Badge>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Input className="h-8 w-24" placeholder="niveau" value={nv.niveau} onChange={(e) => setNv({ ...nv, niveau: e.target.value })} list={`niv-${row.poste_id}`} />
          <datalist id={`niv-${row.poste_id}`}>{niveaux.map((n) => <option key={n.niveau!} value={n.niveau!} />)}</datalist>
          <Input className="h-8 w-20" placeholder="vente" inputMode="decimal" value={nv.taux} onChange={(e) => setNv({ ...nv, taux: e.target.value })} />
          <Input className="h-8 w-20" placeholder="coût" inputMode="decimal" value={nv.cout} onChange={(e) => setNv({ ...nv, cout: e.target.value })} />
          <Input className="h-8 w-36" type="date" value={nv.date} onChange={(e) => setNv({ ...nv, date: e.target.value })} />
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={nv.defaut} onChange={(e) => setNv({ ...nv, defaut: e.target.checked })} />défaut</label>
          <Button size="sm" variant="outline" disabled={!nv.niveau.trim()} onClick={() => run(supabase.rpc("devis_taux_ajouter", {
            _poste_id: row.poste_id, _niveau: nv.niveau.trim(), _date_effet: nv.date,
            _taux_vente: num(nv.taux) as number, _cout_revient: num(nv.cout) as number, _par_defaut: nv.defaut,
          }), "Taux enregistré").then(() => setNv({ niveau: "", taux: "", cout: "", date: today(), defaut: false }))}>Nouveau taux</Button>
        </div>
      </TableCell>
      <TableCell><Switch checked={row.actif} onCheckedChange={(v) => save({ actif: v })} /></TableCell>
    </TableRow>
  );
}

function ParamRow({ p, run }: { p: { cle: string; valeur: number | null; unite: string | null; date_effet: string }; run: Run }) {
  const [v, setV] = useState(p.valeur == null ? "" : String(p.valeur));
  const [d, setD] = useState(today());
  return (
    <div className="flex items-center gap-2">
      <span className="w-52 text-sm">{PARAM_LABELS[p.cle] ?? p.cle}</span>
      <Input className="h-8 w-24" inputMode="decimal" placeholder="à saisir" value={v} onChange={(e) => setV(e.target.value)} />
      <span className="w-16 text-xs text-muted-foreground">{p.unite}</span>
      <Input className="h-8 w-36" type="date" value={d} onChange={(e) => setD(e.target.value)} />
      <Button size="sm" variant="outline" onClick={() => run(supabase.rpc("devis_parametre_ajouter", {
        _cle: p.cle, _valeur: num(v) as number, _unite: p.unite as string, _date_effet: d,
      }), "Paramètre enregistré")}>OK</Button>
    </div>
  );
}
