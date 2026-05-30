/**
 * MargeChantierApp — Conteneur principal de l'outil "Marges chantiers" (Option A standalone).
 *
 * 8 onglets, tous les calculs délégués à `engine.ts` (zéro logique métier locale).
 * Persistance localStorage isolée par userId. Thème sombre forcé sur cette page.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Save, Upload, Download, FileSpreadsheet, FileText, Search, ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { loadAppData, saveAppData, downloadAsJson, restoreFromJson } from "./storage";
import { readXlsx, readCsvWin1252, readCsvOrXlsx } from "./file-readers";
import {
  emptyApp,
  type AppData,
  type Mode,
  type Employe,
  type Devis,
  type LigneDevis,
  buildCtx,
  chantierGroups,
  calcChantier,
  calcPersonnes,
  calcChantierPerf,
  coutHoraire,
  parseDevisRows,
  parseHeuresRows,
  parseRegistreRows,
  applyPosteMap,
  detecterMetier,
  num,
  globalCoef,
  ecartQte,
} from "./engine";

const fmtEUR = (n: number) =>
  isFinite(n) ? new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n) : "—";
const fmtNb = (n: number, d = 1) =>
  isFinite(n) ? new Intl.NumberFormat("fr-FR", { maximumFractionDigits: d }).format(n) : "—";

const STATUTS: Employe["statut"][] = ["Permanent 35h", "Permanent forfait", "Intermittent", "Auto-entrepreneur"];

export function MargeChantierApp() {
  const { user } = useAuth();
  const userId = user?.id ?? "anonymous";
  const [app, setApp] = useState<AppData>(() => emptyApp());
  const [hydrated, setHydrated] = useState(false);

  // Charger depuis localStorage au mount
  useEffect(() => {
    setApp(loadAppData(userId));
    setHydrated(true);
  }, [userId]);

  // Autosave debounced
  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => saveAppData(userId, app), 400);
    return () => clearTimeout(t);
  }, [app, userId, hydrated]);

  const ctx = useMemo(() => buildCtx(app), [app]);
  const groups = useMemo(() => chantierGroups(app), [app]);

  const update = useCallback((fn: (draft: AppData) => void) => {
    setApp((prev) => {
      const next: AppData = JSON.parse(JSON.stringify(prev));
      fn(next);
      return next;
    });
  }, []);

  // === Save / Restore ===
  const handleDownload = () => {
    downloadAsJson(app);
    toast.success("Sauvegarde JSON téléchargée");
  };
  const handleRestore = async (file: File) => {
    try {
      const data = await restoreFromJson(file);
      setApp(data);
      toast.success("État restauré depuis le JSON");
    } catch (e) {
      toast.error("Fichier JSON invalide");
      console.error(e);
    }
  };

  return (
    <div className="dark min-h-screen bg-[#0f172a] text-slate-100">
      <div className="max-w-[1600px] mx-auto p-4 space-y-4">
        <header className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-cyan-400">Marges chantiers</h1>
            <p className="text-sm text-slate-400">
              Outil standalone — données stockées localement (utilisateur : {user?.email ?? "anonyme"})
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleDownload} className="border-slate-600 bg-slate-800 hover:bg-slate-700">
              <Save className="h-4 w-4 mr-1" /> Sauvegarder JSON
            </Button>
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleRestore(e.target.files[0])}
              />
              <Button variant="outline" size="sm" asChild className="border-slate-600 bg-slate-800 hover:bg-slate-700">
                <span><Upload className="h-4 w-4 mr-1" /> Restaurer JSON</span>
              </Button>
            </label>
            <Button
              variant="outline"
              size="sm"
              className="border-red-700 bg-red-950 text-red-300 hover:bg-red-900"
              onClick={() => {
                if (confirm("Tout effacer (RH + devis + heures + registre) ?")) {
                  setApp(emptyApp());
                  toast.success("État réinitialisé");
                }
              }}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Reset
            </Button>
          </div>
        </header>

        <Tabs defaultValue="rh" className="w-full">
          <TabsList className="bg-slate-800 border border-slate-700 flex-wrap h-auto">
            <TabsTrigger value="rh">👥 Base RH</TabsTrigger>
            <TabsTrigger value="ref">📋 Référentiels</TabsTrigger>
            <TabsTrigger value="registre">📚 Registre devis</TabsTrigger>
            <TabsTrigger value="devis">📄 Devis</TabsTrigger>
            <TabsTrigger value="heures">⏱ Heures</TabsTrigger>
            <TabsTrigger value="synthese">🏗 Synthèse chantiers</TabsTrigger>
            <TabsTrigger value="marge">📈 Marge par personne</TabsTrigger>
            <TabsTrigger value="perf">🎯 Performance</TabsTrigger>
          </TabsList>

          <TabsContent value="rh"><TabBaseRH app={app} update={update} /></TabsContent>
          <TabsContent value="ref"><TabReferentiels app={app} update={update} /></TabsContent>
          <TabsContent value="registre"><TabRegistre app={app} update={update} /></TabsContent>
          <TabsContent value="devis"><TabDevis app={app} update={update} /></TabsContent>
          <TabsContent value="heures"><TabHeures app={app} update={update} ctx={ctx} /></TabsContent>
          <TabsContent value="synthese"><TabSynthese app={app} ctx={ctx} groups={groups} /></TabsContent>
          <TabsContent value="marge"><TabMargePersonne app={app} /></TabsContent>
          <TabsContent value="perf"><TabPerformance app={app} ctx={ctx} groups={groups} /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* 1. Base RH                                                                  */
/* ========================================================================== */
function TabBaseRH({ app, update }: { app: AppData; update: (fn: (d: AppData) => void) => void }) {
  const [q, setQ] = useState("");
  const [statut, setStatut] = useState<string>("all");
  const [aCompleter, setACompleter] = useState(false);

  const filtered = app.rh.filter((r) => {
    if (statut !== "all" && r.statut !== statut) return false;
    if (aCompleter) {
      const isF = r.statut === "Permanent forfait";
      const ok = isF ? num(r.coutMensuel) > 0 : num(r.taux) > 0;
      if (ok) return false;
    }
    if (!q) return true;
    const s = q.toLowerCase();
    return [r.personne, r.poste, r.metier].some((v) => (v ?? "").toLowerCase().includes(s));
  });

  const importRH = async (file: File) => {
    try {
      const rows = await readXlsx(file, "BDD Employés clean");
      if (!rows.length) {
        toast.error("Onglet 'BDD Employés clean' vide ou introuvable");
        return;
      }
      const hi = rows.findIndex((r) => r.some((c) => /nom progbat/i.test(String(c))));
      if (hi < 0) {
        toast.error("Colonne 'Nom ProGBAT' introuvable");
        return;
      }
      const head = rows[hi].map((c) => String(c).toLowerCase());
      const idx = {
        nom: head.findIndex((h) => h.includes("nom progbat")),
        statut: head.findIndex((h) => h.includes("statut")),
        forfait: head.findIndex((h) => h.includes("forfait")),
        poste: head.findIndex((h) => h.includes("poste")),
        taux: head.findIndex((h) => h.includes("dernier taux") || h.includes("taux")),
      };
      const imported: Employe[] = [];
      for (let i = hi + 1; i < rows.length; i++) {
        const r = rows[i];
        const nom = String(r[idx.nom] ?? "").trim();
        if (!nom) continue;
        const isForf = idx.forfait >= 0 && /oui|vrai|true|1|forfait/i.test(String(r[idx.forfait]));
        imported.push({
          personne: nom,
          statut: isForf ? "Permanent forfait" : (idx.statut >= 0 ? (String(r[idx.statut]) || "Intermittent") : "Intermittent"),
          poste: idx.poste >= 0 ? String(r[idx.poste] ?? "").trim() : "",
          metier: "",
          taux: idx.taux >= 0 ? num(r[idx.taux]) : 0,
          coef: 0,
          coutMensuel: 0,
        });
      }
      update((d) => {
        const existing = new Map(d.rh.map((e) => [e.personne, e]));
        imported.forEach((e) => {
          if (existing.has(e.personne)) {
            const cur = existing.get(e.personne)!;
            cur.statut = e.statut || cur.statut;
            cur.poste = e.poste || cur.poste;
            if (num(e.taux) > 0) cur.taux = e.taux;
          } else {
            d.rh.push(e);
          }
        });
        // Postes auto
        const postesSet = new Set(d.postes.map((p) => p.nom));
        d.rh.forEach((r) => {
          if (r.poste && !postesSet.has(r.poste)) {
            d.postes.push({ nom: r.poste });
            postesSet.add(r.poste);
          }
        });
        applyPosteMap(d);
      });
      toast.success(`${imported.length} employés importés`);
    } catch (e) {
      console.error(e);
      toast.error("Erreur de lecture du fichier");
    }
  };

  return (
    <Card className="bg-slate-900 border-slate-700">
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm">Coefficient global :</span>
            <Input
              type="number"
              step="0.05"
              value={app.meta.coef ?? 1.5}
              onChange={(e) => update((d) => { d.meta.coef = parseFloat(e.target.value) || 1.5; })}
              className="w-20 h-8 bg-slate-800 border-slate-600"
            />
          </div>
          <div className="ml-auto flex gap-2">
            <label className="cursor-pointer">
              <input type="file" accept=".xlsx" className="hidden" onChange={(e) => e.target.files?.[0] && importRH(e.target.files[0])} />
              <Button asChild size="sm" className="bg-cyan-600 hover:bg-cyan-500">
                <span><FileSpreadsheet className="h-4 w-4 mr-1" /> Importer fiche employés .xlsx</span>
              </Button>
            </label>
            <Button size="sm" variant="outline" className="border-slate-600 bg-slate-800" onClick={() => update((d) => { d.rh.push({ personne: "Nouvel employé", statut: "Intermittent", poste: "", metier: "", taux: 0, coef: 0, coutMensuel: 0 }); })}>
              <Plus className="h-4 w-4 mr-1" /> Ajouter
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input placeholder="Recherche nom / poste / métier" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8 w-64 bg-slate-800 border-slate-600" />
          </div>
          <Select value={statut} onValueChange={setStatut}>
            <SelectTrigger className="w-48 bg-slate-800 border-slate-600"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-600">
              <SelectItem value="all">Tous statuts</SelectItem>
              {STATUTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-1 text-sm text-slate-300 cursor-pointer">
            <input type="checkbox" checked={aCompleter} onChange={(e) => setACompleter(e.target.checked)} />
            À compléter uniquement
          </label>
          <span className="ml-auto text-xs text-slate-400">{filtered.length} / {app.rh.length}</span>
        </div>

        <div className="overflow-auto max-h-[70vh]">
          <table className="w-full text-sm">
            <thead className="bg-slate-800 sticky top-0">
              <tr className="text-left">
                <th className="p-2">Personne</th>
                <th className="p-2">Statut</th>
                <th className="p-2">Poste</th>
                <th className="p-2">Métier</th>
                <th className="p-2 text-right">Taux €/h</th>
                <th className="p-2 text-right">Coef.</th>
                <th className="p-2 text-right">Coût mensuel</th>
                <th className="p-2 text-right">Coût/h effectif</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const idx = app.rh.indexOf(r);
                const isForf = r.statut === "Permanent forfait";
                const ch = coutHoraire(app, r.personne);
                return (
                  <tr key={r.personne + idx} className="border-b border-slate-800 hover:bg-slate-800/50">
                    <td className="p-1"><Input value={r.personne} onChange={(e) => update((d) => { d.rh[idx].personne = e.target.value; })} className="h-7 bg-transparent border-slate-700" /></td>
                    <td className="p-1">
                      <Select value={r.statut} onValueChange={(v) => update((d) => { d.rh[idx].statut = v; })}>
                        <SelectTrigger className="h-7 bg-transparent border-slate-700"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-600">
                          {STATUTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-1">
                      <Select value={r.poste || "__none"} onValueChange={(v) => update((d) => { d.rh[idx].poste = v === "__none" ? "" : v; applyPosteMap(d); })}>
                        <SelectTrigger className="h-7 bg-transparent border-slate-700"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-600">
                          <SelectItem value="__none">—</SelectItem>
                          {app.postes.map((p) => <SelectItem key={p.nom} value={p.nom}>{p.nom}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-1">
                      <Select value={r.metier || "__none"} onValueChange={(v) => update((d) => { d.rh[idx].metier = v === "__none" ? "" : v; })}>
                        <SelectTrigger className="h-7 bg-transparent border-slate-700"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-600">
                          <SelectItem value="__none">—</SelectItem>
                          {app.metiers.map((m) => <SelectItem key={m.nom} value={m.nom}>{m.nom}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-1"><Input type="number" step="0.1" value={r.taux || ""} onChange={(e) => update((d) => { d.rh[idx].taux = parseFloat(e.target.value) || 0; })} className="h-7 bg-transparent border-slate-700 text-right" /></td>
                    <td className="p-1"><Input type="number" step="0.05" value={r.coef || ""} placeholder={`(${globalCoef(app)})`} onChange={(e) => update((d) => { d.rh[idx].coef = parseFloat(e.target.value) || 0; })} className="h-7 bg-transparent border-slate-700 text-right" /></td>
                    <td className="p-1"><Input type="number" step="50" disabled={!isForf} value={r.coutMensuel || ""} onChange={(e) => update((d) => { d.rh[idx].coutMensuel = parseFloat(e.target.value) || 0; })} className="h-7 bg-transparent border-slate-700 text-right disabled:opacity-30" /></td>
                    <td className="p-2 text-right tabular-nums">{fmtEUR(ch)}</td>
                    <td className="p-1"><Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400" onClick={() => update((d) => { d.rh.splice(idx, 1); })}><Trash2 className="h-3 w-3" /></Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

/* ========================================================================== */
/* 2. Référentiels                                                             */
/* ========================================================================== */
function TabReferentiels({ app, update }: { app: AppData; update: (fn: (d: AppData) => void) => void }) {
  const sections: Array<{ key: keyof AppData; label: string; }> = [
    { key: "metiers", label: "Métiers (pôles)" },
    { key: "postes", label: "Postes" },
    { key: "chargesAffaire", label: "Chargés d'affaire" },
    { key: "chefsProjet", label: "Chefs de projet" },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {sections.map((s) => (
        <RefListEditor key={String(s.key)} app={app} update={update} field={s.key as any} label={s.label} />
      ))}

      {/* Poste → Métier */}
      <Card className="bg-slate-900 border-slate-700 lg:col-span-2">
        <CardContent className="p-4 space-y-2">
          <h3 className="font-semibold text-cyan-400">Correspondance Poste → Métier</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-auto">
            {app.postes.map((p) => (
              <div key={p.nom} className="flex items-center gap-2 text-sm">
                <span className="w-40 truncate text-slate-300">{p.nom}</span>
                <span className="text-slate-500">→</span>
                <Select value={app.meta.posteMap?.[p.nom.toLowerCase()] || "__none"} onValueChange={(v) => update((d) => { d.meta.posteMap = d.meta.posteMap || {}; if (v === "__none") delete d.meta.posteMap[p.nom.toLowerCase()]; else d.meta.posteMap[p.nom.toLowerCase()] = v; applyPosteMap(d); })}>
                  <SelectTrigger className="h-7 bg-slate-800 border-slate-600"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-600">
                    <SelectItem value="__none">—</SelectItem>
                    {app.metiers.map((m) => <SelectItem key={m.nom} value={m.nom}>{m.nom}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
            {!app.postes.length && <p className="text-sm text-slate-500">Importez une fiche RH pour peupler les postes.</p>}
          </div>
        </CardContent>
      </Card>

      {/* Apprentissage parsing */}
      <Card className="bg-slate-900 border-slate-700 lg:col-span-2">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-cyan-400">🧠 Apprentissage du parsing</h3>
            <Button size="sm" variant="outline" className="border-slate-600 bg-slate-800" onClick={() => update((d) => { d.parsing.push({ motif: "", metier: "" }); })}>
              <Plus className="h-4 w-4 mr-1" /> Règle
            </Button>
          </div>
          <div className="space-y-1 max-h-64 overflow-auto">
            {app.parsing.map((r, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input value={r.motif} placeholder="motif (ex: laser)" onChange={(e) => update((d) => { d.parsing[i].motif = e.target.value; })} className="h-7 bg-slate-800 border-slate-600 flex-1" />
                <span className="text-slate-500">→</span>
                <Select value={r.metier || "__none"} onValueChange={(v) => update((d) => { d.parsing[i].metier = v === "__none" ? "" : v; })}>
                  <SelectTrigger className="h-7 w-48 bg-slate-800 border-slate-600"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-600">
                    <SelectItem value="__none">—</SelectItem>
                    {app.metiers.map((m) => <SelectItem key={m.nom} value={m.nom}>{m.nom}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400" onClick={() => update((d) => { d.parsing.splice(i, 1); })}><Trash2 className="h-3 w-3" /></Button>
              </div>
            ))}
            {!app.parsing.length && <p className="text-sm text-slate-500">Aucune règle. Les règles s'apprennent automatiquement quand vous corrigez le métier d'une ligne de devis.</p>}
          </div>
          <Button size="sm" className="bg-cyan-600 hover:bg-cyan-500" onClick={() => {
            update((d) => {
              d.devis.forEach((dv) => dv.lignes.forEach((l) => {
                if (!l.section && l.categorie === "mo" && !l.metier) {
                  const m = detecterMetier(d, l.designation);
                  if (m) l.metier = m;
                }
              }));
            });
            toast.success("Métiers vides recomplétés");
          }}>Compléter les métiers vides des devis</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function RefListEditor({ app, update, field, label }: { app: AppData; update: (fn: (d: AppData) => void) => void; field: "metiers" | "postes" | "chargesAffaire" | "chefsProjet"; label: string }) {
  const list = app[field] as Array<{ nom: string; responsable?: string }>;
  return (
    <Card className="bg-slate-900 border-slate-700">
      <CardContent className="p-4 space-y-2">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-cyan-400">{label}</h3>
          <Button size="sm" variant="outline" className="border-slate-600 bg-slate-800" onClick={() => update((d) => { (d[field] as any[]).push({ nom: "Nouveau" }); })}>
            <Plus className="h-4 w-4 mr-1" /> Ajouter
          </Button>
        </div>
        <div className="space-y-1 max-h-64 overflow-auto">
          {list.map((item, i) => (
            <div key={i} className="flex gap-2">
              <Input value={item.nom} onChange={(e) => update((d) => { (d[field] as any[])[i].nom = e.target.value; })} className="h-7 bg-slate-800 border-slate-600" />
              {field === "metiers" && (
                <Select value={item.responsable || "__none"} onValueChange={(v) => update((d) => { (d.metiers[i] as any).responsable = v === "__none" ? "" : v; })}>
                  <SelectTrigger className="h-7 w-40 bg-slate-800 border-slate-600"><SelectValue placeholder="Resp." /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-600">
                    <SelectItem value="__none">—</SelectItem>
                    {app.rh.map((e) => <SelectItem key={e.personne} value={e.personne}>{e.personne}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400" onClick={() => update((d) => { (d[field] as any[]).splice(i, 1); })}><Trash2 className="h-3 w-3" /></Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ========================================================================== */
/* 3. Registre devis                                                           */
/* ========================================================================== */
function TabRegistre({ app, update }: { app: AppData; update: (fn: (d: AppData) => void) => void }) {
  const [q, setQ] = useState("");
  const importCsv = async (file: File) => {
    try {
      const rows = await readCsvWin1252(file);
      const entries = parseRegistreRows(rows);
      update((d) => {
        const seen = new Set(d.registre.map((e) => e.numDevis));
        entries.forEach((e) => { if (!seen.has(e.numDevis)) d.registre.push(e); });
      });
      toast.success(`${entries.length} entrées de registre importées`);
    } catch (e) {
      console.error(e);
      toast.error("Erreur lecture CSV");
    }
  };
  const filtered = app.registre.filter((r) => !q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase()));
  return (
    <Card className="bg-slate-900 border-slate-700">
      <CardContent className="p-4 space-y-3">
        <div className="flex gap-2 flex-wrap items-center">
          <label className="cursor-pointer">
            <input type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
            <Button asChild size="sm" className="bg-cyan-600 hover:bg-cyan-500"><span><FileText className="h-4 w-4 mr-1" /> Importer CSV Devis client</span></Button>
          </label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Recherche" className="pl-8 w-64 bg-slate-800 border-slate-600" />
          </div>
          <span className="ml-auto text-xs text-slate-400">{filtered.length} / {app.registre.length}</span>
        </div>
        <div className="overflow-auto max-h-[70vh]">
          <table className="w-full text-sm">
            <thead className="bg-slate-800 sticky top-0">
              <tr className="text-left">
                <th className="p-2">N° devis</th><th className="p-2">Chantier</th><th className="p-2">Nom</th><th className="p-2">Client</th><th className="p-2">Chargé</th><th className="p-2">Statut</th><th className="p-2 text-right">Total HT</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 500).map((r, i) => (
                <tr key={r.numDevis + i} className="border-b border-slate-800">
                  <td className="p-2 font-mono">{r.numDevis}</td><td className="p-2">{r.chantier}</td><td className="p-2">{r.chantierFull}</td><td className="p-2">{r.client}</td><td className="p-2">{r.chargeAffaire}</td><td className="p-2">{r.statut}</td><td className="p-2 text-right tabular-nums">{fmtEUR(r.totalHT ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 500 && <p className="text-xs text-slate-500 p-2">Affichage limité à 500 lignes.</p>}
        </div>
      </CardContent>
    </Card>
  );
}

/* ========================================================================== */
/* 4. Devis                                                                    */
/* ========================================================================== */
function TabDevis({ app, update }: { app: AppData; update: (fn: (d: AppData) => void) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const importXlsx = async (files: FileList) => {
    let count = 0;
    for (const f of Array.from(files)) {
      try {
        const rows = await readXlsx(f);
        const dv = parseDevisRows(rows, f.name, app);
        update((d) => {
          const idx = d.devis.findIndex((x) => x.numDevis === dv.numDevis);
          if (idx >= 0) d.devis[idx] = dv;
          else d.devis.push(dv);
        });
        count++;
      } catch (e) {
        console.error(f.name, e);
      }
    }
    toast.success(`${count} devis importés`);
  };

  const filtered = app.devis.filter((d) => !q || [d.numDevis, d.chantier, d.nom, d.client, d.chargeAffaire, d.chefProjet].some((v) => (v ?? "").toLowerCase().includes(q.toLowerCase())));

  return (
    <Card className="bg-slate-900 border-slate-700">
      <CardContent className="p-4 space-y-3">
        <div className="flex gap-2 flex-wrap items-center">
          <label className="cursor-pointer">
            <input type="file" accept=".xlsx" multiple className="hidden" onChange={(e) => e.target.files?.length && importXlsx(e.target.files)} />
            <Button asChild size="sm" className="bg-cyan-600 hover:bg-cyan-500"><span><FileSpreadsheet className="h-4 w-4 mr-1" /> Importer devis (.xlsx multi)</span></Button>
          </label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Recherche" className="pl-8 w-64 bg-slate-800 border-slate-600" />
          </div>
          <span className="ml-auto text-xs text-slate-400">{filtered.length} / {app.devis.length}</span>
        </div>
        <div className="space-y-2 max-h-[75vh] overflow-auto">
          {filtered.map((dv) => {
            const dvIdx = app.devis.indexOf(dv);
            const isOpen = open[dv.numDevis] ?? false;
            const sansMetier = dv.lignes.filter((l) => !l.section && l.categorie === "mo" && !l.metier).length;
            const ecarts = dv.lignes.filter(ecartQte).length;
            return (
              <div key={dv.numDevis} className="border border-slate-700 rounded">
                <button className="w-full flex items-center gap-2 p-2 bg-slate-800 hover:bg-slate-700 text-left" onClick={() => setOpen((o) => ({ ...o, [dv.numDevis]: !isOpen }))}>
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <span className="font-mono">{dv.numDevis}</span>
                  <span className="text-slate-400">— {dv.chantier}</span>
                  <span className="text-slate-300 truncate">{dv.nom}</span>
                  {dv.matchRegistre && <Badge className="bg-green-700">✓ registre</Badge>}
                  {sansMetier > 0 && <Badge className="bg-amber-700">⚠ {sansMetier} métier(s) à préciser</Badge>}
                  {ecarts > 0 && <Badge className="bg-red-700">⚠ {ecarts} écart(s) Qté</Badge>}
                </button>
                {isOpen && (
                  <div className="p-3 space-y-2 bg-slate-900">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      <LabeledInput label="Chantier" value={dv.chantier} onChange={(v) => update((d) => { d.devis[dvIdx].chantier = v; })} />
                      <LabeledInput label="Nom" value={dv.nom} onChange={(v) => update((d) => { d.devis[dvIdx].nom = v; })} />
                      <LabeledInput label="Client" value={dv.client ?? ""} onChange={(v) => update((d) => { d.devis[dvIdx].client = v; })} />
                      <LabeledSelect label="Chargé d'affaire" value={dv.chargeAffaire ?? ""} options={app.chargesAffaire.map((c) => c.nom)} onChange={(v) => update((d) => { d.devis[dvIdx].chargeAffaire = v; })} />
                      <LabeledSelect label="Chef de projet" value={dv.chefProjet ?? ""} options={app.chefsProjet.map((c) => c.nom)} onChange={(v) => update((d) => { d.devis[dvIdx].chefProjet = v; })} />
                      <LabeledInput label="Statut" value={dv.statut ?? ""} onChange={(v) => update((d) => { d.devis[dvIdx].statut = v; })} />
                    </div>
                    <div className="overflow-auto max-h-96 border border-slate-700 rounded">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-800 sticky top-0"><tr><th className="p-1">N°</th><th className="p-1 text-left">Désignation</th><th className="p-1">Métier</th><th className="p-1">Cat.</th><th className="p-1 text-right">H vendues</th><th className="p-1 text-right">CA HT</th><th></th></tr></thead>
                        <tbody>
                          {dv.lignes.map((l, li) => l.section ? (
                            <tr key={li} className="bg-slate-800/60"><td className="p-1 font-mono text-slate-400">{l.num}</td><td className="p-1 italic text-slate-300" colSpan={5}>📑 {l.designation}{l.qte && l.qte > 1 ? ` (× ${l.qte})` : ""}</td><td></td></tr>
                          ) : (
                            <tr key={li} className="border-b border-slate-800">
                              <td className="p-1 font-mono">{l.num}</td>
                              <td className="p-1"><Input value={l.designation} onChange={(e) => update((d) => { d.devis[dvIdx].lignes[li].designation = e.target.value; })} className="h-6 bg-transparent border-slate-700 text-xs" /></td>
                              <td className="p-1">
                                <Select value={l.metier || "__none"} onValueChange={(v) => update((d) => { d.devis[dvIdx].lignes[li].metier = v === "__none" ? "" : v; })}>
                                  <SelectTrigger className="h-6 bg-transparent border-slate-700 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent className="bg-slate-800 border-slate-600">
                                    <SelectItem value="__none">—</SelectItem>
                                    {app.metiers.map((m) => <SelectItem key={m.nom} value={m.nom}>{m.nom}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="p-1">{l.categorie}</td>
                              <td className="p-1 text-right tabular-nums">{fmtNb(l.heuresVendues)}</td>
                              <td className="p-1 text-right tabular-nums">{fmtEUR(l.caHT)}</td>
                              <td className="p-1"><Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400" onClick={() => update((d) => { d.devis[dvIdx].lignes.splice(li, 1); })}><Trash2 className="h-3 w-3" /></Button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <Button size="sm" variant="outline" className="border-red-700 bg-red-950 text-red-300" onClick={() => { if (confirm(`Supprimer le devis ${dv.numDevis} ?`)) update((d) => { d.devis.splice(dvIdx, 1); }); }}><Trash2 className="h-4 w-4 mr-1" /> Supprimer ce devis</Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function LabeledInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <label className="text-xs text-slate-400 space-y-1 block"><span>{label}</span><Input value={value} onChange={(e) => onChange(e.target.value)} className="h-7 bg-slate-800 border-slate-600 text-slate-100" /></label>;
}
function LabeledSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className="text-xs text-slate-400 space-y-1 block">
      <span>{label}</span>
      <Select value={value || "__none"} onValueChange={(v) => onChange(v === "__none" ? "" : v)}>
        <SelectTrigger className="h-7 bg-slate-800 border-slate-600 text-slate-100"><SelectValue placeholder="—" /></SelectTrigger>
        <SelectContent className="bg-slate-800 border-slate-600">
          <SelectItem value="__none">—</SelectItem>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </label>
  );
}

/* ========================================================================== */
/* 5. Heures                                                                   */
/* ========================================================================== */
function TabHeures({ app, update, ctx }: { app: AppData; update: (fn: (d: AppData) => void) => void; ctx: ReturnType<typeof buildCtx> }) {
  const [erase, setErase] = useState(true);
  const [q, setQ] = useState("");

  const importFile = async (file: File) => {
    try {
      const rows = await readCsvOrXlsx(file);
      // Détection auto des colonnes
      const hi = rows.findIndex((r) => r.some((c) => /salari|personne/i.test(String(c))) && r.some((c) => /chantier/i.test(String(c))));
      if (hi < 0) { toast.error("En-tête introuvable (Salarié + Chantier)"); return; }
      const head = rows[hi].map((c) => String(c).toLowerCase());
      const cols = {
        chantier: head.findIndex((h) => h.includes("chantier")),
        personne: head.findIndex((h) => h.includes("salari") || h.includes("personne")),
        heures: head.findIndex((h) => h === "heures" || h.includes("nb h") || h.includes("nb heures") || h.includes("heure")),
        date: head.findIndex((h) => h.includes("date")),
        semaine: head.findIndex((h) => h.includes("semaine")),
        commentaire: head.findIndex((h) => h.includes("comment")),
      };
      const data = parseHeuresRows(rows.slice(hi + 1), cols);
      update((d) => {
        if (erase) {
          const annees = new Set(data.map((h) => h.annee).filter(Boolean));
          d.heures = d.heures.filter((h) => !annees.has(h.annee));
        }
        d.heures.push(...data);
      });
      toast.success(`${data.length} lignes d'heures importées`);
    } catch (e) {
      console.error(e);
      toast.error("Erreur lecture fichier heures");
    }
  };

  const importCsvOrXlsxFile = importFile;

  const filtered = app.heures.filter((h) => !q || [h.chantier, h.chantierNom, h.personne, h.date].some((v) => (v ?? "").toLowerCase().includes(q.toLowerCase())));

  // Contrôle chantiers ↔ registre
  const controle = useMemo(() => {
    const byCh: Record<string, { num: string; nom: string; count: number; inReg: boolean; nomsReg: string[] }> = {};
    app.heures.forEach((h) => {
      const k = h.chantier;
      if (!byCh[k]) byCh[k] = { num: k, nom: h.chantierNom ?? "", count: 0, inReg: false, nomsReg: [] };
      byCh[k].count += num(h.heures);
    });
    Object.values(byCh).forEach((c) => {
      const regs = app.registre.filter((r) => r.chantier === c.num);
      c.inReg = regs.length > 0;
      c.nomsReg = regs.map((r) => r.chantierFull ?? r.chantierLabel ?? "").filter(Boolean);
    });
    return Object.values(byCh).sort((a, b) => a.num.localeCompare(b.num));
  }, [app.heures, app.registre]);

  return (
    <Card className="bg-slate-900 border-slate-700">
      <CardContent className="p-4 space-y-3">
        <div className="flex gap-2 flex-wrap items-center">
          <label className="cursor-pointer">
            <input type="file" accept=".csv,.xlsx" className="hidden" onChange={(e) => e.target.files?.[0] && importCsvOrXlsxFile(e.target.files[0])} />
            <Button asChild size="sm" className="bg-cyan-600 hover:bg-cyan-500"><span><FileText className="h-4 w-4 mr-1" /> Importer heures Progbat</span></Button>
          </label>
          <label className="flex items-center gap-1 text-sm text-slate-300 cursor-pointer">
            <input type="checkbox" checked={erase} onChange={(e) => setErase(e.target.checked)} /> Écraser les heures des années présentes
          </label>
          <div className="relative ml-auto">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Recherche" className="pl-8 w-64 bg-slate-800 border-slate-600" />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-2 overflow-auto max-h-[60vh]">
            <table className="w-full text-xs">
              <thead className="bg-slate-800 sticky top-0"><tr><th className="p-1">Chantier</th><th className="p-1 text-left">Nom</th><th className="p-1">Personne</th><th className="p-1 text-right">H</th><th className="p-1">Date</th><th className="p-1 text-right">Coût</th></tr></thead>
              <tbody>
                {filtered.slice(0, 1000).map((h, i) => {
                  // Coût simple via avgCost (suffisant pour aperçu)
                  return (
                    <tr key={i} className="border-b border-slate-800">
                      <td className="p-1 font-mono">{h.chantier}</td>
                      <td className="p-1 truncate max-w-[200px]">{h.chantierNom}</td>
                      <td className="p-1">{h.personne}</td>
                      <td className="p-1 text-right tabular-nums">{fmtNb(h.heures)}</td>
                      <td className="p-1">{h.date}</td>
                      <td className="p-1 text-right tabular-nums text-slate-400">{fmtEUR(h.heures * (ctx.avgCost || 0))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length > 1000 && <p className="text-xs text-slate-500 p-2">Affichage limité à 1 000 lignes ({filtered.length} au total).</p>}
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-cyan-400 text-sm">Contrôle chantiers ↔ registre</h3>
            <div className="space-y-1 max-h-[55vh] overflow-auto">
              {controle.map((c) => {
                const ok = app.meta.chantiersOK?.[c.num];
                const status = c.inReg ? "✓" : ok ? "✓ (accepté)" : "⚠";
                const cls = c.inReg || ok ? "border-green-700" : "border-amber-700";
                return (
                  <div key={c.num} className={`p-2 border ${cls} rounded bg-slate-800/50 text-xs`}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono">{c.num}</span>
                      <span className="truncate flex-1">{c.nom}</span>
                      <span>{status}</span>
                    </div>
                    {!c.inReg && !ok && (
                      <Button size="sm" variant="ghost" className="h-6 text-xs mt-1" onClick={() => update((d) => { d.meta.chantiersOK = d.meta.chantiersOK ?? {}; d.meta.chantiersOK[c.num] = true; })}>Accepter</Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ========================================================================== */
/* 6. Synthèse chantiers                                                       */
/* ========================================================================== */
function TabSynthese({ app, ctx, groups }: { app: AppData; ctx: ReturnType<typeof buildCtx>; groups: ReturnType<typeof chantierGroups> }) {
  const [mode, setMode] = useState<Mode>("reel");
  const [q, setQ] = useState("");
  const filtered = groups.filter((g) => !q || [g.chantier, g.nom, g.client].some((v) => (v ?? "").toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center flex-wrap">
        <ModeToggle mode={mode} onChange={setMode} />
        <div className="relative ml-auto">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Recherche chantier" className="pl-8 w-64 bg-slate-800 border-slate-600" />
        </div>
      </div>
      <div className="space-y-2">
        {filtered.map((g) => {
          const c = calcChantier(app, g, ctx, mode);
          const marge = c.margeMO;
          const margeColor = marge >= 0 ? "text-green-400" : "text-red-400";
          return (
            <details key={g.chantier} className="border border-slate-700 rounded bg-slate-900">
              <summary className="p-3 cursor-pointer hover:bg-slate-800 flex flex-wrap items-center gap-3">
                <span className="font-mono text-cyan-400">{g.chantier}</span>
                <span className="truncate flex-1">{g.nom}</span>
                <span className="text-xs text-slate-400">{fmtNb(c.heuresPassees)} h passées / {fmtNb(c.heuresVendues)} h vendues</span>
                <Badge className="bg-slate-700">vendue : {fmtEUR(c.valeurVendue)}/h</Badge>
                <Badge className="bg-slate-700">{mode === "reel" ? "passée" : "pondérée"} : {fmtEUR(c.valeurHeure)}/h</Badge>
                <Badge className={marge >= 0 ? "bg-green-700" : "bg-red-700"}>{fmtEUR(marge)}</Badge>
              </summary>
              <div className="p-3 space-y-2 border-t border-slate-700">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  <Kpi label="CA MO" value={fmtEUR(c.caMO)} />
                  <Kpi label="CA Mat." value={fmtEUR(c.caMat)} />
                  <Kpi label="Coût réel" value={fmtEUR(c.coutTotal)} />
                  <Kpi label="Marge MO" value={fmtEUR(c.margeMO)} color={margeColor} />
                  <Kpi label="Écart heures" value={fmtNb(c.ecartH) + " h"} color={c.ecartH > 0 ? "text-red-400" : "text-green-400"} />
                </div>
                <div className="overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-800"><tr><th className="p-1 text-left">Personne</th><th className="p-1 text-right">Heures</th><th className="p-1 text-right">H pond.</th><th className="p-1 text-right">CA contrib.</th><th className="p-1 text-right">Coût</th><th className="p-1 text-right">Marge</th><th className="p-1 text-right">Ratio</th></tr></thead>
                    <tbody>
                      {c.personnes.map((p) => (
                        <tr key={p.personne} className="border-b border-slate-800">
                          <td className="p-1">{p.personne}{p.manqueTaux && <span className="text-amber-400 ml-1">⚠</span>}</td>
                          <td className="p-1 text-right tabular-nums">{fmtNb(p.heures)}</td>
                          <td className="p-1 text-right tabular-nums">{fmtNb(p.heuresPond)}</td>
                          <td className="p-1 text-right tabular-nums">{fmtEUR(p.caContrib)}</td>
                          <td className="p-1 text-right tabular-nums">{fmtEUR(p.cout)}</td>
                          <td className={`p-1 text-right tabular-nums ${p.marge >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtEUR(p.marge)}</td>
                          <td className="p-1 text-right tabular-nums">{isFinite(p.ratio) ? p.ratio.toFixed(2) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardContent className="p-3">
        <div className="text-xs text-slate-400">{label}</div>
        <div className={`text-lg font-semibold tabular-nums ${color ?? "text-slate-100"}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="inline-flex border border-slate-600 rounded overflow-hidden text-sm">
      <button onClick={() => onChange("reel")} className={`px-3 py-1 ${mode === "reel" ? "bg-cyan-600 text-white" : "bg-slate-800 text-slate-300"}`}>Réel</button>
      <button onClick={() => onChange("pondere")} className={`px-3 py-1 ${mode === "pondere" ? "bg-cyan-600 text-white" : "bg-slate-800 text-slate-300"}`}>Pondéré</button>
    </div>
  );
}

/* ========================================================================== */
/* 7. Marge par personne                                                       */
/* ========================================================================== */
function TabMargePersonne({ app }: { app: AppData }) {
  const [mode, setMode] = useState<Mode>("reel");
  const [q, setQ] = useState("");
  const data = useMemo(() => calcPersonnes(app, mode), [app, mode]);
  const filtered = data.filter((p: any) => !q || p.personne.toLowerCase().includes(q.toLowerCase()));

  return (
    <Card className="bg-slate-900 border-slate-700">
      <CardContent className="p-4 space-y-2">
        <div className="flex gap-2 items-center flex-wrap">
          <ModeToggle mode={mode} onChange={setMode} />
          <div className="relative ml-auto">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Recherche personne" className="pl-8 w-64 bg-slate-800 border-slate-600" />
          </div>
        </div>
        <div className="overflow-auto max-h-[70vh]">
          <table className="w-full text-sm">
            <thead className="bg-slate-800 sticky top-0"><tr className="text-left"><th className="p-2">Personne</th><th className="p-2">Statut</th><th className="p-2 text-right">Chantiers</th><th className="p-2 text-right">Heures</th><th className="p-2 text-right">H pond.</th><th className="p-2 text-right">CA contrib.</th><th className="p-2 text-right">Coût</th><th className="p-2 text-right">Dont majo.</th><th className="p-2 text-right">Marge</th><th className="p-2 text-right">Ratio</th></tr></thead>
            <tbody>
              {filtered.map((p: any) => (
                <tr key={p.personne} className="border-b border-slate-800">
                  <td className="p-2">{p.personne}{p.manqueTaux && <span className="text-amber-400 ml-1">⚠</span>}</td>
                  <td className="p-2 text-slate-400">{p.statut ?? "—"}</td>
                  <td className="p-2 text-right tabular-nums">{p.chantiers}</td>
                  <td className="p-2 text-right tabular-nums">{fmtNb(p.heures)}</td>
                  <td className="p-2 text-right tabular-nums">{fmtNb(p.heuresPond)}</td>
                  <td className="p-2 text-right tabular-nums">{fmtEUR(p.caContrib)}</td>
                  <td className="p-2 text-right tabular-nums">{fmtEUR(p.cout)}</td>
                  <td className="p-2 text-right tabular-nums text-slate-400">{fmtEUR(p.coutMajo)}</td>
                  <td className={`p-2 text-right tabular-nums ${p.marge >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtEUR(p.marge)}</td>
                  <td className="p-2 text-right tabular-nums">{isFinite(p.ratio) ? p.ratio.toFixed(2) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

/* ========================================================================== */
/* 8. Performance & management                                                 */
/* ========================================================================== */
function TabPerformance({ app, ctx, groups }: { app: AppData; ctx: ReturnType<typeof buildCtx>; groups: ReturnType<typeof chantierGroups> }) {
  const [q, setQ] = useState("");
  const perfs = useMemo(() => groups.map((g) => calcChantierPerf(app, g, ctx)), [app, ctx, groups]);

  const aggBy = (key: "chefProjet" | "chargeAffaire") => {
    const m: Record<string, { ca: number; cout: number; marge: number; vendu: number; passe: number; n: number }> = {};
    perfs.forEach((p) => {
      const k = (p as any)[key] || "(non renseigné)";
      const o = m[k] = m[k] || { ca: 0, cout: 0, marge: 0, vendu: 0, passe: 0, n: 0 };
      o.ca += p.caMO; o.cout += p.coutTotal; o.marge += p.margeReelle; o.vendu += p.hVendues; o.passe += p.hPassees; o.n++;
    });
    return Object.entries(m).map(([k, v]) => ({ key: k, ...v, ratio: v.cout > 0 ? v.ca / v.cout : NaN, prod: v.passe > 0 ? v.vendu / v.passe : NaN })).sort((a, b) => b.marge - a.marge);
  };

  const aggMetier = useMemo(() => {
    const m: Record<string, { ca: number; cout: number; vendu: number; passe: number; resp: string }> = {};
    perfs.forEach((p) => p.parMetier.forEach((x) => {
      const o = m[x.metier] = m[x.metier] || { ca: 0, cout: 0, vendu: 0, passe: 0, resp: app.metiers.find((mm) => mm.nom === x.metier)?.responsable || "" };
      o.ca += x.ca; o.cout += x.cout; o.vendu += x.vendu; o.passe += x.passe;
    }));
    return Object.entries(m).map(([k, v]) => ({ metier: k, ...v, marge: v.ca - v.cout, ratio: v.cout > 0 ? v.ca / v.cout : NaN, prod: v.passe > 0 ? v.vendu / v.passe : NaN })).sort((a, b) => b.marge - a.marge);
  }, [perfs, app.metiers]);

  const filtered = perfs.filter((p) => !q || [p.chantier, p.nom, p.chefProjet, p.chargeAffaire].some((v) => (v ?? "").toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Recherche chantier / chef / chargé" className="pl-8 w-80 bg-slate-800 border-slate-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <AggCard title="Par chef de projet" rows={aggBy("chefProjet")} />
        <AggCard title="Par chargé d'affaire" rows={aggBy("chargeAffaire")} />
        <AggCard title="Par pôle métier" rows={aggMetier.map((m) => ({ key: m.metier + (m.resp ? ` (${m.resp})` : ""), ca: m.ca, cout: m.cout, marge: m.marge, ratio: m.ratio, prod: m.prod, n: 0, vendu: m.vendu, passe: m.passe }))} />
      </div>

      <Card className="bg-slate-900 border-slate-700">
        <CardContent className="p-4">
          <h3 className="font-semibold text-cyan-400 mb-2">Détail par chantier</h3>
          <div className="overflow-auto max-h-[60vh]">
            <table className="w-full text-xs">
              <thead className="bg-slate-800 sticky top-0"><tr className="text-left"><th className="p-1">Chantier</th><th className="p-1">Nom</th><th className="p-1">Chef projet</th><th className="p-1">Chargé</th><th className="p-1 text-right">CA MO</th><th className="p-1 text-right">Coût</th><th className="p-1 text-right">Marge</th><th className="p-1 text-right">Ratio</th><th className="p-1 text-right">Prod.</th></tr></thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.chantier} className="border-b border-slate-800">
                    <td className="p-1 font-mono">{p.chantier}</td>
                    <td className="p-1 truncate max-w-[220px]">{p.nom}</td>
                    <td className="p-1 text-slate-400">{p.chefProjet}</td>
                    <td className="p-1 text-slate-400">{p.chargeAffaire}</td>
                    <td className="p-1 text-right tabular-nums">{fmtEUR(p.caMO)}</td>
                    <td className="p-1 text-right tabular-nums">{fmtEUR(p.coutTotal)}</td>
                    <td className={`p-1 text-right tabular-nums ${p.margeReelle >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtEUR(p.margeReelle)}</td>
                    <td className={`p-1 text-right tabular-nums ${p.ratio >= 1 ? "text-green-400" : "text-red-400"}`}>{isFinite(p.ratio) ? p.ratio.toFixed(2) : "—"}</td>
                    <td className={`p-1 text-right tabular-nums ${p.prodGlobale >= 1 ? "text-green-400" : "text-red-400"}`}>{isFinite(p.prodGlobale) ? p.prodGlobale.toFixed(2) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AggCard({ title, rows }: { title: string; rows: Array<{ key: string; ca: number; cout: number; marge: number; ratio: number; prod: number }> }) {
  return (
    <Card className="bg-slate-900 border-slate-700">
      <CardContent className="p-4">
        <h3 className="font-semibold text-cyan-400 mb-2 text-sm">{title}</h3>
        <div className="overflow-auto max-h-80">
          <table className="w-full text-xs">
            <thead className="bg-slate-800"><tr className="text-left"><th className="p-1"></th><th className="p-1 text-right">Marge</th><th className="p-1 text-right">Ratio</th><th className="p-1 text-right">Prod.</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-slate-800">
                  <td className="p-1 truncate max-w-[180px]">{r.key}</td>
                  <td className={`p-1 text-right tabular-nums ${r.marge >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtEUR(r.marge)}</td>
                  <td className={`p-1 text-right tabular-nums ${r.ratio >= 1 ? "text-green-400" : "text-red-400"}`}>{isFinite(r.ratio) ? r.ratio.toFixed(2) : "—"}</td>
                  <td className={`p-1 text-right tabular-nums ${r.prod >= 1 ? "text-green-400" : "text-red-400"}`}>{isFinite(r.prod) ? r.prod.toFixed(2) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
