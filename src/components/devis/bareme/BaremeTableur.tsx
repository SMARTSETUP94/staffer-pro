import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Download, History, Save, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { ancrePoste } from "@/lib/devis/editeur-lisibilite";
import {
  PAIRES_FRAIS, PARAMS_DEVIS, alertesFrais, appliquerModif, controlerDateEffet, idModif, lireNombre, marge, versChangements, type Modif,
} from "@/lib/devis/bareme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type TauxRow = {
  poste_id: string; code: string; libelle: string; metier_id: number | null; ordre: number;
  niveau: string | null; date_effet: string | null; taux_vente: number | null;
  cout_revient: number | null; par_defaut: boolean | null; actif: boolean;
};
type Param = { cle: string; valeur: number | null; unite: string | null; date_effet: string | null };
type Histo = { titre: string; poste_id?: string; niveau?: string; cle?: string; poste?: TauxRow };

const today = () => new Date().toLocaleDateString("sv-SE");
const nf = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v: number | null | undefined) => (v == null ? "—" : nf.format(v));
const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`);
const coefTxt = (v: number | null) => (v == null ? "—" : v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const dateFr = (d: string | null | undefined) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("fr-FR") : "—");
const valTxt = (v: number | boolean | null) => (typeof v === "boolean" ? (v ? "oui" : "non") : v == null ? "vide" : nf.format(v));

const TH = "sticky top-0 z-10 bg-muted px-2 py-1.5 text-xs font-semibold text-muted-foreground whitespace-nowrap border-b";
const TD = "px-2 py-1 border-b border-border/60 whitespace-nowrap";
const NUMTD = `${TD} text-right tabular-nums`;

/** Saute à la cellule de même colonne de la ligne suivante (Entrée) ou précédente (Maj+Entrée). */
function sauter(el: HTMLInputElement, sens: 1 | -1) {
  const grille = el.dataset.grid; const col = el.dataset.col;
  const cells = [...document.querySelectorAll<HTMLInputElement>(`input[data-grid="${grille}"][data-col="${col}"]`)].filter((c) => c.offsetParent !== null);
  const i = cells.indexOf(el);
  const cible = cells[i + sens];
  if (cible) { cible.focus(); cible.select(); }
}

function NumCell({ grid, col, valeur, modifiee, onCommit, label, className = "" }: {
  grid: string; col: string; valeur: number | null; modifiee: boolean; onCommit: (v: number) => void; label: string; className?: string;
}) {
  const affichee = valeur == null ? "" : String(valeur).replace(".", ",");
  const [brut, setBrut] = useState<string | null>(null);
  const invalide = brut != null && Number.isNaN(lireNombre(brut));
  const valider = () => {
    if (brut == null) return;
    const n = lireNombre(brut);
    if (n == null || Number.isNaN(n)) { if (n == null) setBrut(null); return; }
    onCommit(n); setBrut(null);
  };
  return (
    <input
      aria-label={label} inputMode="decimal" data-grid={grid} data-col={col}
      className={`h-7 w-full min-w-[4.5rem] rounded-sm border bg-background px-1.5 text-right tabular-nums text-sm outline-none focus:ring-2 focus:ring-ring ${modifiee ? "border-warning bg-warning/15 font-semibold" : "border-transparent hover:border-border"} ${invalide ? "border-destructive" : ""} ${className}`}
      value={brut ?? affichee} placeholder="—"
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setBrut(e.target.value)}
      onBlur={valider}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); valider(); sauter(e.currentTarget, e.shiftKey ? -1 : 1); }
        if (e.key === "Escape") setBrut(null);
      }}
    />
  );
}

export function BaremeTableur() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const estAdmin = roles.includes("admin");
  const taux = useQuery({ queryKey: ["devis-taux"], queryFn: async () => {
    const { data, error } = await supabase.rpc("devis_taux_lister"); if (error) throw error; return (data ?? []) as TauxRow[];
  } });
  const metiers = useQuery({ queryKey: ["metiers-min"], queryFn: async () => (await supabase.from("metiers").select("id,libelle").order("ordre")).data ?? [] });
  const params = useQuery({ queryKey: ["devis-parametres"], queryFn: async () => ((await supabase.from("v_devis_parametres_courants").select("*")).data ?? []) as Param[] });
  const compteBe = useQuery({ queryKey: ["devis-postes-be"], queryFn: async () =>
    new Map(((await supabase.from("devis_postes_ref").select("id,compte_be")).data ?? []).map((p) => [p.id, p.compte_be] as const)) });

  const [modifs, setModifs] = useState<Modif[]>([]);
  const [inactifs, setInactifs] = useState(false);
  const [recap, setRecap] = useState(false);
  const [dateEffet, setDateEffet] = useState(today());
  const [confirmePasse, setConfirmePasse] = useState(false);
  const [busy, setBusy] = useState(false);
  const [histo, setHisto] = useState<Histo | null>(null);
  const [gen, setGen] = useState(0); // remonte les cellules après annulation / enregistrement

  const mod = useMemo(() => new Map(modifs.map((m) => [idModif(m), m])), [modifs]);
  const val = <T,>(cleLigne: string, champ: string, origine: T): T => (mod.has(`${cleLigne}|${champ}`) ? (mod.get(`${cleLigne}|${champ}`)!.apres as T) : origine);
  const changer = (m: Modif) => setModifs((l) => appliquerModif(l, m));
  const pmap = useMemo(() => new Map((params.data ?? []).map((p) => [p.cle, p])), [params.data]);
  const metierNom = useMemo(() => new Map((metiers.data ?? []).map((m) => [m.id, m.libelle])), [metiers.data]);

  // Main-d'œuvre : une ligne par poste × niveau, groupées par métier.
  const groupes = useMemo(() => {
    const postes = new Map<string, { poste: TauxRow; niveaux: TauxRow[] }>();
    for (const r of taux.data ?? []) {
      const p = postes.get(r.poste_id) ?? { poste: r, niveaux: [] };
      if (r.niveau) p.niveaux.push(r);
      postes.set(r.poste_id, p);
    }
    const g = new Map<string, { metier: string; postes: { poste: TauxRow; niveaux: TauxRow[] }[] }>();
    for (const p of postes.values()) {
      const actif = val(`poste:${p.poste.poste_id}`, "actif", p.poste.actif);
      if (!actif && !inactifs) continue;
      const nom = p.poste.metier_id != null ? metierNom.get(p.poste.metier_id) ?? "Autre" : "Sans métier";
      const e = g.get(nom) ?? { metier: nom, postes: [] };
      e.postes.push(p); g.set(nom, e);
    }
    return [...g.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taux.data, metierNom, inactifs, modifs]);

  const ctrl = controlerDateEffet(dateEffet, today(), estAdmin, confirmePasse);

  const enregistrer = async () => {
    if (!ctrl.ok) return;
    setBusy(true);
    const { bareme, postes } = versChangements(modifs);
    if (bareme.length) {
      const { error } = await supabase.rpc("devis_bareme_enregistrer", { _changements: bareme as never, _date_effet: dateEffet, _confirmer_passe: ctrl.passe });
      if (error) { setBusy(false); toast.error(error.message); return; }
    }
    for (const p of postes) {
      const row = (taux.data ?? []).find((r) => r.poste_id === p.poste_id)!;
      if (p.compte_be !== undefined) {
        const { error } = await supabase.rpc("devis_poste_compte_be", { _id: p.poste_id, _compte: p.compte_be });
        if (error) { toast.error(error.message); }
      }
      if (p.actif !== undefined) {
        const { error } = await supabase.rpc("devis_poste_enregistrer", { _id: row.poste_id, _code: row.code, _libelle: row.libelle, _metier_id: row.metier_id as number, _ordre: row.ordre, _actif: p.actif });
        if (error) toast.error(error.message);
      }
    }
    setBusy(false); setRecap(false); setModifs([]); setGen((g) => g + 1);
    toast.success(`${modifs.length} modification(s) enregistrée(s)${bareme.length ? ` — effet au ${dateFr(dateEffet)}` : ""}`);
    for (const k of ["devis-taux", "devis-parametres", "devis-postes-be", "devis-bareme-histo"]) qc.invalidateQueries({ queryKey: [k] });
  };

  const exporter = async () => {
    const XLSX = (await import("xlsx-js-style")).default;
    const mo = [["Métier", "Poste", "Niveau", "Coût €/h", "Vente €/h", "Marge €/h", "Marge %", "Coef (vente/coût)", "En vigueur depuis", "Par défaut", "Compte BE", "Actif"]];
    for (const r of taux.data ?? []) {
      const m = marge(r.cout_revient, r.taux_vente);
      mo.push([r.metier_id != null ? metierNom.get(r.metier_id) ?? "" : "", r.libelle, r.niveau ?? "", r.cout_revient, r.taux_vente, m.marge, m.pct, m.coef, r.date_effet ?? "", r.par_defaut ? "oui" : "", compteBe.data?.get(r.poste_id) ? "oui" : "", r.actif ? "oui" : "non"] as never);
    }
    const fr: unknown[][] = [["Élément", "Unité coût", "Unité vente", "Coût", "Vente", "Marge", "Marge %", "Coût depuis", "Vente depuis", "Alerte"]];
    for (const f of PAIRES_FRAIS) {
      const c = pmap.get(`cout_${f.cle}`); const v = pmap.get(f.cle); const m = marge(c?.valeur, v?.valeur);
      const a = alertesFrais({ cout: c?.valeur ?? null, vente: v?.valeur ?? null, uniteCout: c?.unite ?? null, uniteVente: v?.unite ?? null });
      fr.push([f.libelle, c?.unite ?? "", v?.unite ?? "", c?.valeur ?? null, v?.valeur ?? null, m.marge, m.pct, c?.date_effet ?? "", v?.date_effet ?? "",
        [a.venteSousCout && "vente < coût", a.uniteIncoherente && "unités différentes"].filter(Boolean).join(", ")]);
    }
    const pa: unknown[][] = [["Paramètre", "Unité", "Valeur", "En vigueur depuis"]];
    for (const p of PARAMS_DEVIS) { const x = pmap.get(p.cle); pa.push([p.libelle, x?.unite ?? "", x?.valeur ?? null, x?.date_effet ?? ""]); }
    const wb = XLSX.utils.book_new();
    const feuille = (rows: unknown[][], pctCols: number[], nom: string) => {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = rows[0]!.map((_, i) => ({ wch: i < 3 ? 22 : 14 }));
      for (let r = 1; r < rows.length; r++) for (const c of pctCols) { const a = XLSX.utils.encode_cell({ r, c }); if (ws[a]) ws[a].z = "0.0%"; }
      for (let c = 0; c < rows[0]!.length; c++) { const a = XLSX.utils.encode_cell({ r: 0, c }); ws[a].s = { font: { bold: true } }; }
      ws["!freeze"] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(wb, ws, nom);
    };
    feuille(mo, [6], "Main-d'œuvre"); feuille(fr, [6], "Frais et transport"); feuille(pa, [], "Paramètres de devis");
    XLSX.writeFile(wb, `bareme-devis-${today()}.xlsx`);
  };

  const charge = taux.data && params.data;
  return (
    <div className="space-y-5" key={gen}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm"><Switch checked={inactifs} onCheckedChange={setInactifs} aria-label="Afficher les postes inactifs" />Afficher les postes inactifs</label>
        <Button variant="outline" size="sm" onClick={() => void exporter()} disabled={!charge}><Download className="mr-1 h-4 w-4" />Export Excel</Button>
      </div>

      {/* 1. Main-d'œuvre */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">Main-d'œuvre</CardTitle>
          <CardDescription>Taux horaires en vigueur aujourd'hui. Marge, % et coefficient sont calculés. Cliquez sur l'icône historique d'une ligne pour voir ses versions.</CardDescription></CardHeader>
        <CardContent className="p-0 md:p-2">
          <div className="hidden max-h-[70vh] overflow-auto md:block">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead><tr>
                {["Poste", "Niveau"].map((h) => <th key={h} className={`${TH} text-left`}>{h}</th>)}
                {["Coût €/h", "Vente €/h", "Marge €/h", "Marge %", "Coef"].map((h) => <th key={h} className={`${TH} text-right`}>{h}</th>)}
                {["En vigueur depuis", "Par défaut", "Compte BE", ""].map((h, i) => <th key={i} className={`${TH} text-center`}>{h}</th>)}
              </tr></thead>
              {groupes.map((g) => (
                <tbody key={g.metier}>
                  <tr><td colSpan={11} className="sticky top-8 bg-background px-2 pb-1 pt-3 text-xs font-bold uppercase tracking-wide text-primary">{g.metier}</td></tr>
                  {g.postes.flatMap(({ poste, niveaux }) => lignesPoste(poste, niveaux).map((n, i) => {
                    const cl = `taux:${poste.poste_id}:${n.niveau}`;
                    const c = val(cl, "cout_revient", n.cout_revient); const v = val(cl, "taux_vente", n.taux_vente); const m = marge(c, v);
                    const defaut = val(cl, "par_defaut", !!n.par_defaut);
                    const be = val(`poste:${poste.poste_id}`, "compte_be", compteBe.data?.get(poste.poste_id) ?? false);
                    const actif = val(`poste:${poste.poste_id}`, "actif", poste.actif);
                    return (
                      <tr key={cl} id={i === 0 ? ancrePoste(poste.libelle) : undefined} className={`scroll-mt-24 hover:bg-muted/40 target:bg-warning/15 ${actif ? "" : "opacity-50"}`}>
                        <td className={`${TD} font-medium`}>{i === 0 ? poste.libelle : ""}{i === 0 && !actif && <span className="ml-1 text-xs text-muted-foreground">(inactif)</span>}</td>
                        <td className={TD}>{n.niveau}</td>
                        <td className={`${TD} p-0.5`}><NumCell grid="mo" col="cout" label={`Coût ${poste.libelle} ${n.niveau}`} valeur={c} modifiee={mod.has(`${cl}|cout_revient`)}
                          onCommit={(x) => changer({ type: "taux", cleLigne: cl, libelle: `${poste.libelle} · ${n.niveau} — coût €/h`, poste_id: poste.poste_id, niveau: n.niveau, champ: "cout_revient", avant: n.cout_revient, apres: x })} /></td>
                        <td className={`${TD} p-0.5`}><NumCell grid="mo" col="vente" label={`Vente ${poste.libelle} ${n.niveau}`} valeur={v} modifiee={mod.has(`${cl}|taux_vente`)}
                          onCommit={(x) => changer({ type: "taux", cleLigne: cl, libelle: `${poste.libelle} · ${n.niveau} — vente €/h`, poste_id: poste.poste_id, niveau: n.niveau, champ: "taux_vente", avant: n.taux_vente, apres: x })} /></td>
                        <td className={`${NUMTD} ${m.marge != null && m.marge < 0 ? "font-semibold text-destructive" : ""}`}>{num(m.marge)}</td>
                        <td className={NUMTD}>{pct(m.pct)}</td>
                        <td className={NUMTD}>{coefTxt(m.coef)}</td>
                        <td className={`${TD} text-center text-xs text-muted-foreground`}>{dateFr(n.date_effet)}</td>
                        <td className={`${TD} text-center`}><input type="checkbox" aria-label={`Niveau par défaut ${poste.libelle} ${n.niveau}`} checked={defaut} disabled={!!n.par_defaut}
                          onChange={(e) => changer({ type: "taux", cleLigne: cl, libelle: `${poste.libelle} · ${n.niveau} — niveau par défaut`, poste_id: poste.poste_id, niveau: n.niveau, champ: "par_defaut", avant: !!n.par_defaut, apres: e.target.checked })} /></td>
                        <td className={`${TD} text-center`}>{i === 0 && <input type="checkbox" aria-label={`Compte en bureau d'études ${poste.libelle}`} checked={be}
                          onChange={(e) => changer({ type: "poste", cleLigne: `poste:${poste.poste_id}`, libelle: `${poste.libelle} — compte en BE`, poste_id: poste.poste_id, champ: "compte_be", avant: compteBe.data?.get(poste.poste_id) ?? false, apres: e.target.checked })} />}</td>
                        <td className={`${TD} text-center`}><Button variant="ghost" size="icon" className="h-6 w-6" aria-label={`Historique ${poste.libelle} ${n.niveau}`}
                          onClick={() => setHisto({ titre: `${poste.libelle} · ${n.niveau}`, poste_id: poste.poste_id, niveau: n.niveau, poste })}><History className="h-3.5 w-3.5" /></Button></td>
                      </tr>
                    );
                  }))}
                </tbody>
              ))}
            </table>
          </div>
          {/* Mobile : cartes */}
          <div className="space-y-4 p-3 md:hidden">
            {groupes.map((g) => (
              <div key={g.metier} className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-primary">{g.metier}</h3>
                {g.postes.flatMap(({ poste, niveaux }) => lignesPoste(poste, niveaux).map((n) => {
                  const cl = `taux:${poste.poste_id}:${n.niveau}`;
                  const c = val(cl, "cout_revient", n.cout_revient); const v = val(cl, "taux_vente", n.taux_vente); const m = marge(c, v);
                  return (
                    <div key={cl} className="rounded-md border p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div><p className="text-sm font-medium">{poste.libelle}</p><p className="text-xs text-muted-foreground">{n.niveau}{n.par_defaut ? " · par défaut" : ""} · depuis {dateFr(n.date_effet)}</p></div>
                        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Historique ${poste.libelle} ${n.niveau}`} onClick={() => setHisto({ titre: `${poste.libelle} · ${n.niveau}`, poste_id: poste.poste_id, niveau: n.niveau, poste })}><History className="h-4 w-4" /></Button>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <label>Coût €/h<NumCell grid="mo-m" col="cout" label={`Coût ${poste.libelle} ${n.niveau}`} valeur={c} modifiee={mod.has(`${cl}|cout_revient`)} className="mt-0.5 border-border"
                          onCommit={(x) => changer({ type: "taux", cleLigne: cl, libelle: `${poste.libelle} · ${n.niveau} — coût €/h`, poste_id: poste.poste_id, niveau: n.niveau, champ: "cout_revient", avant: n.cout_revient, apres: x })} /></label>
                        <label>Vente €/h<NumCell grid="mo-m" col="vente" label={`Vente ${poste.libelle} ${n.niveau}`} valeur={v} modifiee={mod.has(`${cl}|taux_vente`)} className="mt-0.5 border-border"
                          onCommit={(x) => changer({ type: "taux", cleLigne: cl, libelle: `${poste.libelle} · ${n.niveau} — vente €/h`, poste_id: poste.poste_id, niveau: n.niveau, champ: "taux_vente", avant: n.taux_vente, apres: x })} /></label>
                      </div>
                      <p className={`mt-1.5 text-xs tabular-nums ${m.marge != null && m.marge < 0 ? "font-semibold text-destructive" : "text-muted-foreground"}`}>Marge {num(m.marge)} €/h · {pct(m.pct)} · coef {coefTxt(m.coef)}</p>
                    </div>
                  );
                }))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 2. Frais et transport */}
      <Card>
        <CardHeader id="forfaits" className="scroll-mt-24 pb-2"><CardTitle className="text-lg">Frais et transport</CardTitle>
          <CardDescription>Coût et prix de vente de chaque forfait. Une vente inférieure au coût ou des unités différentes sont signalées en rouge (rien n'est corrigé automatiquement).</CardDescription></CardHeader>
        <CardContent className="p-0 md:p-2">
          <div className="overflow-auto">
            <table className="hidden w-full border-separate border-spacing-0 text-sm md:table">
              <thead><tr>
                {["Élément", "Unité"].map((h) => <th key={h} className={`${TH} text-left`}>{h}</th>)}
                {["Coût", "Vente", "Marge", "Marge %"].map((h) => <th key={h} className={`${TH} text-right`}>{h}</th>)}
                <th className={`${TH} text-center`}>Depuis</th><th className={TH} />
              </tr></thead>
              <tbody>{PAIRES_FRAIS.map((f) => ligneFrais(f, false))}</tbody>
            </table>
            <div className="space-y-2 p-3 md:hidden">{PAIRES_FRAIS.map((f) => ligneFrais(f, true))}</div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Paramètres de devis */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">Paramètres de devis</CardTitle>
          <CardDescription>Valeurs reprises à la création d'un nouveau devis. Les probabilités du pipeline et les réglages du planning des opportunités sont plus bas, dans « Pipeline et planning des opportunités ».</CardDescription></CardHeader>
        <CardContent className="p-0 md:p-2">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead><tr><th className={`${TH} text-left`}>Paramètre</th><th className={`${TH} text-left`}>Unité</th><th className={`${TH} text-right`}>Valeur</th><th className={`${TH} text-center`}>Depuis</th><th className={TH} /></tr></thead>
            <tbody>{PARAMS_DEVIS.map((p) => {
              const x = pmap.get(p.cle); const cl = `param:${p.cle}`;
              const uniteDefaut = "unite" in p ? p.unite : null; const defaut = "defaut" in p ? p.defaut : null;
              return (
                <tr key={p.cle} className="hover:bg-muted/40">
                  <td className={`${TD} whitespace-normal font-medium`}>{p.libelle}</td>
                  <td className={`${TD} text-xs text-muted-foreground`}>{x?.unite ?? uniteDefaut ?? ""}{!x && defaut != null && <span className="block">défaut {defaut}</span>}</td>
                  <td className={`${TD} w-28 p-0.5`}><NumCell grid="pa" col="valeur" label={p.libelle} valeur={val(cl, "valeur", x?.valeur ?? null)} modifiee={mod.has(`${cl}|valeur`)}
                    onCommit={(n) => changer({ type: "parametre", cleLigne: cl, libelle: p.libelle, cle: p.cle, champ: "valeur", avant: x?.valeur ?? null, apres: n, unite: x?.unite ?? uniteDefaut })} /></td>
                  <td className={`${TD} text-center text-xs text-muted-foreground`}>{dateFr(x?.date_effet)}</td>
                  <td className={`${TD} text-center`}><Button variant="ghost" size="icon" className="h-6 w-6" aria-label={`Historique ${p.libelle}`} onClick={() => setHisto({ titre: p.libelle, cle: p.cle })}><History className="h-3.5 w-3.5" /></Button></td>
                </tr>
              );
            })}</tbody>
          </table>
        </CardContent>
      </Card>

      {modifs.length > 0 && (
        <div className="sticky bottom-2 z-20 flex flex-wrap items-center justify-between gap-2 rounded-md border border-warning bg-card p-2 shadow-lg">
          <span className="text-sm font-medium">{modifs.length} modification{modifs.length > 1 ? "s" : ""} non enregistrée{modifs.length > 1 ? "s" : ""}</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setModifs([]); setGen((g) => g + 1); }}><Undo2 className="mr-1 h-4 w-4" />Annuler</Button>
            <Button size="sm" onClick={() => { setDateEffet(today()); setConfirmePasse(false); setRecap(true); }}><Save className="mr-1 h-4 w-4" />Enregistrer</Button>
          </div>
        </div>
      )}

      <Dialog open={recap} onOpenChange={setRecap}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>Enregistrer {modifs.length} modification{modifs.length > 1 ? "s" : ""}</DialogTitle>
            <DialogDescription>Chaque valeur devient une nouvelle version datée ; l'ancienne reste dans l'historique. Les devis déjà rédigés ne changent pas.</DialogDescription></DialogHeader>
          <ul className="divide-y rounded border text-sm">
            {modifs.map((m) => (
              <li key={idModif(m)} className="flex flex-wrap justify-between gap-2 px-2 py-1.5">
                <span>{m.libelle}</span>
                <span className="tabular-nums"><span className="text-muted-foreground line-through">{valTxt(m.avant)}</span> → <strong>{valTxt(m.apres)}</strong></span>
              </li>
            ))}
          </ul>
          <label className="block text-sm font-medium">Date d'effet
            <Input type="date" className="mt-1 w-44" value={dateEffet} min={estAdmin ? undefined : today()} onChange={(e) => { setDateEffet(e.target.value); setConfirmePasse(false); }} /></label>
          {dateEffet && dateEffet < today() && estAdmin && (
            <label className="flex items-start gap-2 rounded border border-destructive/50 bg-destructive/10 p-2 text-sm">
              <input type="checkbox" className="mt-0.5" checked={confirmePasse} onChange={(e) => setConfirmePasse(e.target.checked)} />
              Je confirme une date d'effet dans le passé ({dateFr(dateEffet)}). Les devis existants gardent leurs prix.
            </label>
          )}
          {!ctrl.ok && <p role="alert" className="text-sm font-medium text-destructive">{ctrl.raison}</p>}
          <DialogFooter><Button variant="outline" onClick={() => setRecap(false)}>Retour</Button><Button disabled={!ctrl.ok || busy} onClick={() => void enregistrer()}>Enregistrer</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <HistoriquePanneau h={histo} onClose={() => setHisto(null)} actif={histo?.poste ? val(`poste:${histo.poste.poste_id}`, "actif", histo.poste.actif) : null}
        onActif={(v) => histo?.poste && changer({ type: "poste", cleLigne: `poste:${histo.poste.poste_id}`, libelle: `${histo.poste.libelle} — poste actif`, poste_id: histo.poste.poste_id, champ: "actif", avant: histo.poste.actif, apres: v })} />
    </div>
  );

  function ligneFrais(f: (typeof PAIRES_FRAIS)[number], mobile: boolean) {
    const c0 = pmap.get(`cout_${f.cle}`); const v0 = pmap.get(f.cle);
    const clc = `param:cout_${f.cle}`; const clv = `param:${f.cle}`;
    const c = val(clc, "valeur", c0?.valeur ?? null); const v = val(clv, "valeur", v0?.valeur ?? null);
    const m = marge(c, v);
    const a = alertesFrais({ cout: c, vente: v, uniteCout: c0?.unite ?? null, uniteVente: v0?.unite ?? null });
    const unite = a.uniteIncoherente ? `${c0?.unite} / ${v0?.unite}` : v0?.unite ?? c0?.unite ?? "";
    const depuis = c0?.date_effet === v0?.date_effet ? dateFr(v0?.date_effet) : `coût ${dateFr(c0?.date_effet)} · vente ${dateFr(v0?.date_effet)}`;
    const alerte = (a.venteSousCout || a.uniteIncoherente) && (
      <p role="alert" className="flex items-start gap-1 whitespace-normal text-xs font-medium text-destructive"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {[a.venteSousCout && "Vente inférieure au coût", a.uniteIncoherente && `Unités différentes : coût en « ${c0?.unite} », vente en « ${v0?.unite} »`].filter(Boolean).join(" · ")}</p>
    );
    const cellC = <NumCell grid={mobile ? "fr-m" : "fr"} col="cout" label={`Coût ${f.libelle}`} valeur={c} modifiee={mod.has(`${clc}|valeur`)} className={mobile ? "mt-0.5 border-border" : ""}
      onCommit={(n) => changer({ type: "parametre", cleLigne: clc, libelle: `${f.libelle} — coût`, cle: `cout_${f.cle}`, champ: "valeur", avant: c0?.valeur ?? null, apres: n, unite: c0?.unite ?? null })} />;
    const cellV = <NumCell grid={mobile ? "fr-m" : "fr"} col="vente" label={`Vente ${f.libelle}`} valeur={v} modifiee={mod.has(`${clv}|valeur`)} className={mobile ? "mt-0.5 border-border" : ""}
      onCommit={(n) => changer({ type: "parametre", cleLigne: clv, libelle: `${f.libelle} — vente`, cle: f.cle, champ: "valeur", avant: v0?.valeur ?? null, apres: n, unite: v0?.unite ?? null })} />;
    const hist = <Button variant="ghost" size="icon" className="h-6 w-6" aria-label={`Historique ${f.libelle}`} onClick={() => setHisto({ titre: f.libelle, cle: f.cle })}><History className="h-3.5 w-3.5" /></Button>;
    if (mobile) return (
      <div key={f.cle} className={`rounded-md border p-2.5 ${alerte ? "border-destructive/60" : ""}`}>
        <div className="flex items-start justify-between"><div><p className="text-sm font-medium">{f.libelle}</p><p className="text-xs text-muted-foreground">{unite} · depuis {depuis}</p></div>{hist}</div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs"><label>Coût{cellC}</label><label>Vente{cellV}</label></div>
        <p className={`mt-1.5 text-xs tabular-nums ${a.venteSousCout ? "font-semibold text-destructive" : "text-muted-foreground"}`}>Marge {num(m.marge)} · {pct(m.pct)}</p>
        {alerte}
      </div>
    );
    return (
      <tr key={f.cle} className={`hover:bg-muted/40 ${alerte ? "bg-destructive/5" : ""}`}>
        <td className={`${TD} font-medium`}>{f.libelle}{alerte}</td>
        <td className={`${TD} text-xs ${a.uniteIncoherente ? "font-semibold text-destructive" : "text-muted-foreground"}`}>{unite}</td>
        <td className={`${TD} w-28 p-0.5`}>{cellC}</td>
        <td className={`${TD} w-28 p-0.5`}>{cellV}</td>
        <td className={`${NUMTD} ${a.venteSousCout ? "font-semibold text-destructive" : ""}`}>{num(m.marge)}</td>
        <td className={`${NUMTD} ${a.venteSousCout ? "font-semibold text-destructive" : ""}`}>{pct(m.pct)}</td>
        <td className={`${TD} text-center text-xs text-muted-foreground`}>{depuis}</td>
        <td className={`${TD} text-center`}>{hist}</td>
      </tr>
    );
  }
}

/** Niveaux d'un poste ; un poste sans taux propose un niveau « standard » à créer. */
function lignesPoste(poste: TauxRow, niveaux: TauxRow[]): (TauxRow & { niveau: string })[] {
  if (niveaux.length) return niveaux as (TauxRow & { niveau: string })[];
  return [{ ...poste, niveau: "standard", taux_vente: null, cout_revient: null, date_effet: null, par_defaut: true }];
}

function HistoriquePanneau({ h, onClose, actif, onActif }: { h: Histo | null; onClose: () => void; actif: boolean | null; onActif: (v: boolean) => void }) {
  const q = useQuery({
    queryKey: ["devis-bareme-histo", h?.poste_id, h?.niveau, h?.cle], enabled: !!h,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("devis_bareme_historique", { _poste_id: h!.poste_id ?? (null as never), _niveau: h!.niveau ?? (null as never), _cle: h!.cle ?? (null as never) });
      if (error) throw error; return data ?? [];
    },
  });
  const auj = today();
  return (
    <Sheet open={!!h} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader><SheetTitle>Historique — {h?.titre}</SheetTitle><SheetDescription>Toutes les versions, de la plus récente à la plus ancienne.</SheetDescription></SheetHeader>
        {actif != null && (
          <label className="mt-4 flex items-center justify-between rounded border p-2 text-sm">Poste actif (proposé dans les devis)<Switch checked={actif} onCheckedChange={onActif} /></label>
        )}
        <table className="mt-4 w-full text-sm">
          <thead><tr className="border-b text-xs text-muted-foreground"><th className="py-1 text-left">Date d'effet</th><th className="text-right">Coût</th><th className="text-right">Vente</th><th className="pl-2 text-left">Auteur</th></tr></thead>
          <tbody>
            {(q.data ?? []).map((r, i) => (
              <tr key={i} className="border-b">
                <td className="py-1">{dateFr(r.date_effet)}{r.date_effet > auj && <span className="ml-1 rounded bg-warning/20 px-1 text-xs">à venir</span>}</td>
                <td className="text-right tabular-nums">{r.cout == null ? "" : num(r.cout)}</td>
                <td className="text-right tabular-nums">{r.vente == null ? "" : num(r.vente)}</td>
                <td className="pl-2 text-xs text-muted-foreground">{r.auteur ?? "—"}</td>
              </tr>
            ))}
            {q.data?.length === 0 && <tr><td colSpan={4} className="py-3 text-center text-muted-foreground">Aucune version enregistrée.</td></tr>}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-muted-foreground">Voir aussi <Link to="/parametres/devis-materiaux" className="underline">le catalogue matériaux</Link>.</p>
      </SheetContent>
    </Sheet>
  );
}
