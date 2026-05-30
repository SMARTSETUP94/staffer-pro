/**
 * MargeChantierApp — Conteneur principal de l'outil "Marges chantiers" (Option A standalone).
 *
 * 8 onglets, tous les calculs délégués à `engine.ts` (zéro logique métier locale).
 * Persistance localStorage isolée par userId. Thème sombre forcé sur cette page.
 *
 * UX v2 (audit 30 mai 2026 — Lots 1+2+3) :
 * - Bandeau KPI sticky global (CA MO, h vendues/saisies, marge €) + toggle Réel/Pondéré lifté
 * - Indicateur "Enregistré" (autosave 400ms) + reset isolé dans un menu kebab avec AlertDialog
 * - Onglets avec icônes Lucide (plus d'emojis)
 * - États vides informatifs avec CTA vers les onglets précédents
 * - Onboarding "Démarrage rapide" si data vide
 * - Drag & drop sur les zones d'import
 * - Tooltips explicatifs (Coût/h, Coef, Pondéré, Ratio, Prod.)
 * - 1ère colonne sticky sur tables Synthèse / Performance
 * - Tri devis par défaut + bouton "Écarts d'abord"
 * - Design tokens (bg-background, bg-card, text-muted-foreground…) au lieu de slate-* hardcoded
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Save, Upload, Download, FileSpreadsheet, FileText, Search, ChevronDown, ChevronRight,
  Plus, Trash2, MoreVertical, Users2, ListChecks, ClipboardList, FileBarChart, Clock,
  Building2, UserSquare2, Target, Info, CheckCircle2, RotateCcw, ArrowLeft,
  Sparkles, AlertTriangle, Columns3, Rows3, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
  DropdownMenuCheckboxItem, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { loadAppData, saveAppData, saveAppDataSync, downloadAsJson, restoreFromJson } from "./storage";
import { readXlsx, readCsvWin1252, readCsvOrXlsx } from "./file-readers";
import {
  emptyApp,
  type AppData,
  type Mode,
  type Employe,
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

type TabKey = "rh" | "ref" | "registre" | "devis" | "heures" | "synthese" | "marge" | "perf";

type SyncState = "loading" | "idle" | "saving" | "error";

function SyncBadge({ state }: { state: SyncState }) {
  if (state === "loading") {
    return <Badge variant="secondary" className="gap-1"><RotateCcw className="h-3 w-3 animate-spin" />Chargement…</Badge>;
  }
  if (state === "saving") {
    return <Badge variant="secondary" className="gap-1"><RotateCcw className="h-3 w-3 animate-spin" />Synchronisation…</Badge>;
  }
  if (state === "error") {
    return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Erreur sync</Badge>;
  }
  return <Badge variant="outline" className="gap-1 border-emerald-700 text-emerald-500"><CheckCircle2 className="h-3 w-3" />Synchronisé</Badge>;
}

export function MargeChantierApp() {
  const { user } = useAuth();
  const userId = user?.id ?? "anonymous";
  const [app, setApp] = useState<AppData>(() => emptyApp());
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<TabKey>("rh");
  const [mode, setMode] = useState<Mode>("reel");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [savedTick, setSavedTick] = useState(0); // re-render "il y a Xs"
  const [resetOpen, setResetOpen] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>("loading");

  // Charger : Supabase (source de vérité) + fallback localStorage + migration auto
  useEffect(() => {
    let cancelled = false;
    setSyncState("loading");
    loadAppData(userId)
      .then((loaded) => {
        if (cancelled) return;
        setApp(loaded);
        setHydrated(true);
        setSyncState("idle");
      })
      .catch((e) => {
        console.error("[marge-chantier] initial load failed:", e);
        if (cancelled) return;
        setHydrated(true);
        setSyncState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Autosave debounced 2s → Supabase + cache localStorage
  useEffect(() => {
    if (!hydrated) return;
    setSyncState((s) => (s === "error" ? s : "saving"));
    const t = setTimeout(() => {
      saveAppData(userId, app)
        .then(() => {
          setSavedAt(Date.now());
          setSyncState("idle");
        })
        .catch(() => setSyncState("error"));
    }, 2000);
    return () => clearTimeout(t);
  }, [app, userId, hydrated]);

  // Save best-effort (cache localStorage) avant unload
  useEffect(() => {
    if (!hydrated) return;
    const handler = () => saveAppDataSync(userId, app);
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [app, userId, hydrated]);

  // Refresh "il y a Xs" toutes les 15s
  useEffect(() => {
    const i = setInterval(() => setSavedTick((t) => t + 1), 15_000);
    return () => clearInterval(i);
  }, []);

  const ctx = useMemo(() => buildCtx(app), [app]);
  const groups = useMemo(() => chantierGroups(app), [app]);

  const globals = useMemo(() => {
    let caMO = 0, caMat = 0, hVendues = 0, hSaisies = 0, marge = 0, cout = 0;
    groups.forEach((g) => {
      const c = calcChantier(app, g, ctx, mode);
      caMO += c.caMO; caMat += c.caMat;
      hVendues += c.heuresVendues; hSaisies += c.heuresPassees;
      marge += c.margeMO; cout += c.coutTotal;
    });
    return { caMO, caMat, hVendues, hSaisies, marge, cout, ratio: cout > 0 ? caMO / cout : NaN };
  }, [app, ctx, groups, mode]);

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

  const isEmpty = app.rh.length === 0 && app.devis.length === 0 && app.heures.length === 0;
  const savedLabel = useFormatSaved(savedAt, savedTick);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="dark min-h-screen bg-background text-foreground">
        <div className="max-w-[1600px] mx-auto p-4 space-y-4">
          {/* === Top bar === */}
          <header className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                <Link to="/">
                  <ArrowLeft className="h-4 w-4 mr-1" /> Retour
                </Link>
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
                  <FileBarChart className="h-6 w-6" /> Marges chantiers
                </h1>
                <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                  <span>Synchronisé sur votre compte ({user?.email ?? "anonyme"}) {savedLabel}</span>
                  <SyncBadge state={syncState} />
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <ModeToggle mode={mode} onChange={setMode} />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={handleDownload}>
                    <Download className="h-4 w-4 mr-1" /> Export JSON
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Sauvegarde manuelle locale (recommandé chaque fin de session)</TooltipContent>
              </Tooltip>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleRestore(e.target.files[0])}
                />
                <Button variant="outline" size="sm" asChild>
                  <span><Upload className="h-4 w-4 mr-1" /> Importer JSON</span>
                </Button>
              </label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Plus d'actions">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleDownload}>
                    <Save className="h-4 w-4 mr-2" /> Sauvegarder l'état
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setResetOpen(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> Réinitialiser tout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/* === KPIs globaux === */}
          {!isEmpty && (
            <GlobalKpiBar globals={globals} mode={mode} />
          )}

          {/* === Onboarding "Démarrage rapide" === */}
          {isEmpty && <QuickStart onGoTo={setTab} />}

          {/* === Onglets === */}
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="w-full">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="rh"><Users2 className="h-4 w-4 mr-1.5" />Base RH</TabsTrigger>
              <TabsTrigger value="ref"><ListChecks className="h-4 w-4 mr-1.5" />Référentiels</TabsTrigger>
              <TabsTrigger value="registre"><ClipboardList className="h-4 w-4 mr-1.5" />Registre devis</TabsTrigger>
              <TabsTrigger value="devis"><FileText className="h-4 w-4 mr-1.5" />Devis</TabsTrigger>
              <TabsTrigger value="heures"><Clock className="h-4 w-4 mr-1.5" />Heures</TabsTrigger>
              <TabsTrigger value="synthese"><Building2 className="h-4 w-4 mr-1.5" />Synthèse chantiers</TabsTrigger>
              <TabsTrigger value="marge"><UserSquare2 className="h-4 w-4 mr-1.5" />Marge / personne</TabsTrigger>
              <TabsTrigger value="perf"><Target className="h-4 w-4 mr-1.5" />Performance</TabsTrigger>
            </TabsList>

            <TabsContent value="rh"><TabBaseRH app={app} update={update} /></TabsContent>
            <TabsContent value="ref"><TabReferentiels app={app} update={update} /></TabsContent>
            <TabsContent value="registre"><TabRegistre app={app} update={update} /></TabsContent>
            <TabsContent value="devis"><TabDevis app={app} update={update} onGoTo={setTab} /></TabsContent>
            <TabsContent value="heures"><TabHeures app={app} update={update} ctx={ctx} onGoTo={setTab} /></TabsContent>
            <TabsContent value="synthese"><TabSynthese app={app} ctx={ctx} groups={groups} mode={mode} onGoTo={setTab} /></TabsContent>
            <TabsContent value="marge"><TabMargePersonne app={app} mode={mode} onGoTo={setTab} /></TabsContent>
            <TabsContent value="perf"><TabPerformance app={app} ctx={ctx} groups={groups} onGoTo={setTab} /></TabsContent>
          </Tabs>
        </div>

        {/* AlertDialog Reset */}
        <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Réinitialiser tout l'état ?</AlertDialogTitle>
              <AlertDialogDescription>
                Cette action efface définitivement la Base RH, les référentiels, le registre, les devis et les heures
                de cet outil pour <strong>{user?.email ?? "votre compte"}</strong>. Les autres modules de Staffer Pro ne
                sont pas affectés. Pensez à exporter le JSON avant si besoin.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                onClick={() => { setApp(emptyApp()); toast.success("État réinitialisé"); }}
              >
                Tout effacer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}

/* ========================================================================== */
/* Helpers UX globaux                                                          */
/* ========================================================================== */

function useFormatSaved(savedAt: number | null, _tick: number) {
  if (!savedAt) return "";
  const s = Math.round((Date.now() - savedAt) / 1000);
  if (s < 5) return "· enregistré à l'instant";
  if (s < 60) return `· enregistré il y a ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `· enregistré il y a ${m} min`;
  return `· enregistré il y a +1 h`;
}

function GlobalKpiBar({ globals, mode }: { globals: ReturnType<typeof Object> & { caMO: number; caMat: number; hVendues: number; hSaisies: number; marge: number; cout: number; ratio: number }; mode: Mode }) {
  const marginPos = globals.marge >= 0;
  return (
    <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-background/95 backdrop-blur border-b border-border">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 max-w-[1600px] mx-auto">
        <KpiInline label="CA MO" value={fmtEUR(globals.caMO)} hint="Chiffre d'affaires main-d'œuvre vendu (somme des devis)" />
        <KpiInline label="CA Matériel" value={fmtEUR(globals.caMat)} hint="CA hors main-d'œuvre" />
        <KpiInline label="Heures" value={`${fmtNb(globals.hSaisies)} / ${fmtNb(globals.hVendues)}`} hint="Heures saisies / heures vendues — au-delà de 100 % vous dépassez le devis" />
        <KpiInline label="Coût" value={fmtEUR(globals.cout)} hint={`Coût ${mode === "reel" ? "réel" : "pondéré"} de la main-d'œuvre`} />
        <KpiInline
          label="Marge MO"
          value={fmtEUR(globals.marge)}
          color={marginPos ? "text-emerald-400" : "text-red-400"}
          hint={`CA MO − Coût (mode ${mode === "reel" ? "Réel" : "Pondéré"}). Ratio ${isFinite(globals.ratio) ? globals.ratio.toFixed(2) : "—"}`}
        />
      </div>
    </div>
  );
}

function KpiInline({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-1.5 flex flex-col">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
        {hint && (
          <Tooltip>
            <TooltipTrigger asChild><Info className="h-3 w-3 opacity-60 hover:opacity-100" /></TooltipTrigger>
            <TooltipContent className="max-w-xs">{hint}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className={cn("text-base font-semibold tabular-nums", color ?? "text-foreground")}>{value}</div>
    </div>
  );
}

function QuickStart({ onGoTo }: { onGoTo: (t: TabKey) => void }) {
  const steps: Array<{ t: TabKey; label: string; desc: string; icon: ReactNode }> = [
    { t: "rh", label: "1. Importer la Base RH", desc: "Charger la fiche employés .xlsx (onglet « BDD Employés clean ») pour avoir les taux et postes.", icon: <Users2 className="h-4 w-4" /> },
    { t: "ref", label: "2. Vérifier les référentiels", desc: "Métiers, postes, chargés d'affaire, chefs de projet — ajuster si besoin.", icon: <ListChecks className="h-4 w-4" /> },
    { t: "registre", label: "3. Importer le registre devis", desc: "CSV Devis client Progbat pour lier les numéros de chantier.", icon: <ClipboardList className="h-4 w-4" /> },
    { t: "devis", label: "4. Importer les devis détaillés", desc: ".xlsx multi-fichiers — corriger les métiers vides si nécessaire.", icon: <FileText className="h-4 w-4" /> },
    { t: "heures", label: "5. Importer les heures saisies", desc: "Export Progbat (.csv Windows-1252 ou .xlsx).", icon: <Clock className="h-4 w-4" /> },
  ];
  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-primary">Démarrage rapide</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Aucune donnée pour l'instant. Suivez ces étapes dans l'ordre — vous pouvez recommencer à tout moment via
          « Importer JSON » si vous avez une sauvegarde.
        </p>
        <div className="grid gap-2 md:grid-cols-5">
          {steps.map((s) => (
            <button
              key={s.t}
              onClick={() => onGoTo(s.t)}
              className="text-left rounded-md border border-border bg-card p-3 hover:border-primary/60 hover:bg-accent transition"
            >
              <div className="flex items-center gap-1.5 text-primary font-medium text-sm">{s.icon}{s.label}</div>
              <p className="text-xs text-muted-foreground mt-1">{s.desc}</p>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ icon, title, desc, ctaLabel, onCta }: { icon: ReactNode; title: string; desc: string; ctaLabel?: string; onCta?: () => void }) {
  return (
    <Card>
      <CardContent className="p-10 flex flex-col items-center text-center gap-3">
        <div className="text-muted-foreground">{icon}</div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground max-w-md">{desc}</p>
        {ctaLabel && onCta && <Button size="sm" onClick={onCta}>{ctaLabel}</Button>}
      </CardContent>
    </Card>
  );
}

/** Zone d'import drag & drop unifiée. */
function FileDropZone({
  accept, multiple, onFiles, label, icon,
}: { accept: string; multiple?: boolean; onFiles: (files: FileList) => void; label: string; icon?: ReactNode }) {
  const [over, setOver] = useState(false);
  return (
    <label
      className={cn(
        "cursor-pointer inline-flex items-center gap-2 rounded-md border border-dashed px-3 py-1.5 text-sm transition",
        over ? "border-primary bg-primary/10 text-primary" : "border-border bg-card hover:border-primary/50"
      )}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault(); setOver(false);
        if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
      }}
    >
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => e.target.files?.length && onFiles(e.target.files)}
      />
      {icon ?? <Upload className="h-4 w-4" />} {label}
      <span className="text-xs text-muted-foreground hidden md:inline">(ou glissez ici)</span>
    </label>
  );
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="inline-flex border border-border rounded-md overflow-hidden text-xs">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => onChange("reel")}
            className={cn("px-3 py-1.5", mode === "reel" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground")}
          >Réel</button>
        </TooltipTrigger>
        <TooltipContent>Coût strict : heures × taux réel de chaque personne</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => onChange("pondere")}
            className={cn("px-3 py-1.5", mode === "pondere" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground")}
          >Pondéré</button>
        </TooltipTrigger>
        <TooltipContent>Heures pondérées selon le statut (forfait = 1, intermittent ajusté)</TooltipContent>
      </Tooltip>
    </div>
  );
}

/* ========================================================================== */
/* 1. Base RH                                                                  */
/* ========================================================================== */
type RhColKey = "statut" | "poste" | "metier" | "taux" | "coef" | "coutMensuel" | "couthEff";
type RhDensity = "compact" | "normal" | "confortable";

const RH_COLS: { key: RhColKey; label: string }[] = [
  { key: "statut", label: "Statut" },
  { key: "poste", label: "Poste" },
  { key: "metier", label: "Métier" },
  { key: "taux", label: "Taux €/h" },
  { key: "coef", label: "Coef." },
  { key: "coutMensuel", label: "Coût mensuel" },
  { key: "couthEff", label: "Coût/h effectif" },
];

const RH_PREFS_KEY = "marge-chantier:rh-prefs";

type RhPrefs = { hidden: RhColKey[]; density: RhDensity };

function loadRhPrefs(): RhPrefs {
  if (typeof window === "undefined") return { hidden: [], density: "normal" };
  try {
    const raw = localStorage.getItem(RH_PREFS_KEY);
    if (raw) return { hidden: [], density: "normal", ...JSON.parse(raw) };
  } catch { /* noop */ }
  return { hidden: [], density: "normal" };
}

const RH_WIDTHS: Record<RhDensity, Partial<Record<RhColKey | "personne" | "actions", string>>> = {
  compact: { personne: "160px", statut: "120px", poste: "120px", metier: "110px", taux: "70px", coef: "60px", coutMensuel: "90px", couthEff: "90px", actions: "36px" },
  normal: { personne: "220px", statut: "160px", poste: "170px", metier: "150px", taux: "90px", coef: "80px", coutMensuel: "120px", couthEff: "120px", actions: "44px" },
  confortable: { personne: "300px", statut: "200px", poste: "220px", metier: "200px", taux: "110px", coef: "100px", coutMensuel: "150px", couthEff: "150px", actions: "48px" },
};

const RH_ROW_H: Record<RhDensity, { input: string; cell: string }> = {
  compact: { input: "h-6 text-xs", cell: "p-0.5" },
  normal: { input: "h-7 text-sm", cell: "p-1" },
  confortable: { input: "h-9 text-sm", cell: "p-1.5" },
};

function TabBaseRH({ app, update }: { app: AppData; update: (fn: (d: AppData) => void) => void }) {
  const [q, setQ] = useState("");
  const [statut, setStatut] = useState<string>("all");
  const [aCompleter, setACompleter] = useState(false);
  const [prefs, setPrefs] = useState<RhPrefs>(() => loadRhPrefs());

  useEffect(() => {
    try { localStorage.setItem(RH_PREFS_KEY, JSON.stringify(prefs)); } catch { /* noop */ }
  }, [prefs]);

  const hiddenSet = useMemo(() => new Set(prefs.hidden), [prefs.hidden]);
  const isHidden = (k: RhColKey) => hiddenSet.has(k);
  const toggleCol = (k: RhColKey) => setPrefs((p) => ({
    ...p,
    hidden: p.hidden.includes(k) ? p.hidden.filter((x) => x !== k) : [...p.hidden, k],
  }));
  const showAll = () => setPrefs((p) => ({ ...p, hidden: [] }));
  const w = RH_WIDTHS[prefs.density];
  const rh = RH_ROW_H[prefs.density];

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

  const importRH = async (files: FileList) => {
    const file = files[0];
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
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm">Coefficient global</span>
            <Tooltip>
              <TooltipTrigger asChild><Info className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
              <TooltipContent>Multiplicateur appliqué au taux brut pour obtenir le coût horaire chargé (charges + provisions). Par défaut 1,5.</TooltipContent>
            </Tooltip>
            <Input
              type="number"
              step="0.05"
              value={app.meta.coef ?? 1.5}
              onChange={(e) => update((d) => { d.meta.coef = parseFloat(e.target.value) || 1.5; })}
              className="w-20 h-8"
            />
          </div>
          <div className="ml-auto flex gap-2">
            <FileDropZone
              accept=".xlsx"
              onFiles={importRH}
              label="Importer fiche employés .xlsx"
              icon={<FileSpreadsheet className="h-4 w-4" />}
            />
            <Button size="sm" variant="outline" onClick={() => update((d) => { d.rh.push({ personne: "Nouvel employé", statut: "Intermittent", poste: "", metier: "", taux: 0, coef: 0, coutMensuel: 0 }); })}>
              <Plus className="h-4 w-4 mr-1" /> Ajouter
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Recherche nom / poste / métier" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8 w-64" />
          </div>
          <Select value={statut} onValueChange={setStatut}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous statuts</SelectItem>
              {STATUTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input type="checkbox" checked={aCompleter} onChange={(e) => setACompleter(e.target.checked)} />
            À compléter uniquement
          </label>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{filtered.length} / {app.rh.length}</span>

            {/* Densité */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-8">
                  <Rows3 className="h-4 w-4 mr-1.5" />
                  {prefs.density === "compact" ? "Compact" : prefs.density === "confortable" ? "Confort." : "Normal"}
                  <ChevronDown className="h-3 w-3 ml-1 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Densité d'affichage</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(["compact", "normal", "confortable"] as RhDensity[]).map((d) => (
                  <DropdownMenuCheckboxItem
                    key={d}
                    checked={prefs.density === d}
                    onCheckedChange={() => setPrefs((p) => ({ ...p, density: d }))}
                  >
                    {d === "compact" ? "Compact" : d === "confortable" ? "Confortable" : "Normal"}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Colonnes */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-8">
                  <Columns3 className="h-4 w-4 mr-1.5" />
                  Colonnes
                  {hiddenSet.size > 0 && <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">{RH_COLS.length - hiddenSet.size}/{RH_COLS.length}</Badge>}
                  <ChevronDown className="h-3 w-3 ml-1 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Colonnes affichées</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {RH_COLS.map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.key}
                    checked={!isHidden(c.key)}
                    onCheckedChange={() => toggleCol(c.key)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {c.label}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={showAll} disabled={hiddenSet.size === 0}>
                  Tout afficher
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {app.rh.length === 0 ? (
          <EmptyState
            icon={<Users2 className="h-10 w-10" />}
            title="Aucun employé"
            desc="Importez la fiche RH .xlsx (onglet « BDD Employés clean ») ou ajoutez manuellement vos premiers employés."
          />
        ) : (
          <div className="overflow-auto max-h-[70vh] rounded border border-border">
            <table className="text-sm" style={{ tableLayout: "fixed", width: "max-content", minWidth: "100%" }}>
              <colgroup>
                <col style={{ width: w.personne }} />
                {!isHidden("statut") && <col style={{ width: w.statut }} />}
                {!isHidden("poste") && <col style={{ width: w.poste }} />}
                {!isHidden("metier") && <col style={{ width: w.metier }} />}
                {!isHidden("taux") && <col style={{ width: w.taux }} />}
                {!isHidden("coef") && <col style={{ width: w.coef }} />}
                {!isHidden("coutMensuel") && <col style={{ width: w.coutMensuel }} />}
                {!isHidden("couthEff") && <col style={{ width: w.couthEff }} />}
                <col style={{ width: w.actions }} />
              </colgroup>
              <thead className="bg-muted sticky top-0 z-10">
                <tr className="text-left">
                  <th className="p-2 sticky left-0 bg-muted z-20">Personne</th>
                  {!isHidden("statut") && <th className="p-2">Statut</th>}
                  {!isHidden("poste") && <th className="p-2">Poste</th>}
                  {!isHidden("metier") && <th className="p-2">Métier</th>}
                  {!isHidden("taux") && <th className="p-2 text-right">Taux €/h</th>}
                  {!isHidden("coef") && (
                    <th className="p-2 text-right">
                      <span className="inline-flex items-center gap-1">Coef.
                        <Tooltip><TooltipTrigger asChild><Info className="h-3 w-3 text-muted-foreground" /></TooltipTrigger>
                          <TooltipContent>Coefficient individuel — vide = coef global ({globalCoef(app)}).</TooltipContent>
                        </Tooltip>
                      </span>
                    </th>
                  )}
                  {!isHidden("coutMensuel") && <th className="p-2 text-right">Coût mensuel</th>}
                  {!isHidden("couthEff") && (
                    <th className="p-2 text-right">
                      <span className="inline-flex items-center gap-1">Coût/h effectif
                        <Tooltip><TooltipTrigger asChild><Info className="h-3 w-3 text-muted-foreground" /></TooltipTrigger>
                          <TooltipContent>Forfait : coût mensuel ÷ heures attendues. Sinon : taux × coef.</TooltipContent>
                        </Tooltip>
                      </span>
                    </th>
                  )}
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const idx = app.rh.indexOf(r);
                  const isForf = r.statut === "Permanent forfait";
                  const ch = coutHoraire(app, r.personne);
                  return (
                    <tr key={r.personne + idx} className="border-b border-border hover:bg-muted/40">
                      <td className={cn(rh.cell, "sticky left-0 bg-background hover:bg-muted/40 z-10")}>
                        <Input value={r.personne} onChange={(e) => update((d) => { d.rh[idx].personne = e.target.value; })} className={cn(rh.input, "bg-transparent")} />
                      </td>
                      {!isHidden("statut") && (
                        <td className={rh.cell}>
                          <Select value={r.statut} onValueChange={(v) => update((d) => { d.rh[idx].statut = v; })}>
                            <SelectTrigger className={cn(rh.input, "bg-transparent")}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {STATUTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                      )}
                      {!isHidden("poste") && (
                        <td className={rh.cell}>
                          <Select value={r.poste || "__none"} onValueChange={(v) => update((d) => { d.rh[idx].poste = v === "__none" ? "" : v; applyPosteMap(d); })}>
                            <SelectTrigger className={cn(rh.input, "bg-transparent")}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none">—</SelectItem>
                              {app.postes.map((p) => <SelectItem key={p.nom} value={p.nom}>{p.nom}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                      )}
                      {!isHidden("metier") && (
                        <td className={rh.cell}>
                          <Select value={r.metier || "__none"} onValueChange={(v) => update((d) => { d.rh[idx].metier = v === "__none" ? "" : v; })}>
                            <SelectTrigger className={cn(rh.input, "bg-transparent")}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none">—</SelectItem>
                              {app.metiers.map((m) => <SelectItem key={m.nom} value={m.nom}>{m.nom}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                      )}
                      {!isHidden("taux") && (
                        <td className={rh.cell}>
                          <Input type="number" step="0.1" value={r.taux || ""} onChange={(e) => update((d) => { d.rh[idx].taux = parseFloat(e.target.value) || 0; })} className={cn(rh.input, "bg-transparent text-right")} />
                        </td>
                      )}
                      {!isHidden("coef") && (
                        <td className={rh.cell}>
                          <Input type="number" step="0.05" value={r.coef || ""} placeholder={`(${globalCoef(app)})`} onChange={(e) => update((d) => { d.rh[idx].coef = parseFloat(e.target.value) || 0; })} className={cn(rh.input, "bg-transparent text-right")} />
                        </td>
                      )}
                      {!isHidden("coutMensuel") && (
                        <td className={rh.cell}>
                          <Input type="number" step="50" disabled={!isForf} value={r.coutMensuel || ""} onChange={(e) => update((d) => { d.rh[idx].coutMensuel = parseFloat(e.target.value) || 0; })} className={cn(rh.input, "bg-transparent text-right disabled:opacity-30")} />
                        </td>
                      )}
                      {!isHidden("couthEff") && (
                        <td className="p-2 text-right tabular-nums">{fmtEUR(ch)}</td>
                      )}
                      <td className={rh.cell}>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => update((d) => { d.rh.splice(idx, 1); })}><Trash2 className="h-3 w-3" /></Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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

      <Card className="lg:col-span-2">
        <CardContent className="p-4 space-y-2">
          <h3 className="font-semibold text-primary">Correspondance Poste → Métier</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-auto">
            {app.postes.map((p) => (
              <div key={p.nom} className="flex items-center gap-2 text-sm">
                <span className="w-40 truncate text-muted-foreground">{p.nom}</span>
                <span className="text-muted-foreground">→</span>
                <Select value={app.meta.posteMap?.[p.nom.toLowerCase()] || "__none"} onValueChange={(v) => update((d) => { d.meta.posteMap = d.meta.posteMap || {}; if (v === "__none") delete d.meta.posteMap[p.nom.toLowerCase()]; else d.meta.posteMap[p.nom.toLowerCase()] = v; applyPosteMap(d); })}>
                  <SelectTrigger className="h-7"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">—</SelectItem>
                    {app.metiers.map((m) => <SelectItem key={m.nom} value={m.nom}>{m.nom}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
            {!app.postes.length && <p className="text-sm text-muted-foreground">Importez une fiche RH pour peupler les postes.</p>}
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-primary flex items-center gap-2"><Sparkles className="h-4 w-4" /> Apprentissage du parsing</h3>
            <Button size="sm" variant="outline" onClick={() => update((d) => { d.parsing.push({ motif: "", metier: "" }); })}>
              <Plus className="h-4 w-4 mr-1" /> Règle
            </Button>
          </div>
          <div className="space-y-1 max-h-64 overflow-auto">
            {app.parsing.map((r, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input value={r.motif} placeholder="motif (ex: laser)" onChange={(e) => update((d) => { d.parsing[i].motif = e.target.value; })} className="h-7 flex-1" />
                <span className="text-muted-foreground">→</span>
                <Select value={r.metier || "__none"} onValueChange={(v) => update((d) => { d.parsing[i].metier = v === "__none" ? "" : v; })}>
                  <SelectTrigger className="h-7 w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">—</SelectItem>
                    {app.metiers.map((m) => <SelectItem key={m.nom} value={m.nom}>{m.nom}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => update((d) => { d.parsing.splice(i, 1); })}><Trash2 className="h-3 w-3" /></Button>
              </div>
            ))}
            {!app.parsing.length && <p className="text-sm text-muted-foreground">Aucune règle. Les règles s'apprennent automatiquement quand vous corrigez le métier d'une ligne de devis.</p>}
          </div>
          <Button size="sm" onClick={() => {
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
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-primary">{label}</h3>
          <Button size="sm" variant="outline" onClick={() => update((d) => { (d[field] as any[]).push({ nom: "Nouveau" }); })}>
            <Plus className="h-4 w-4 mr-1" /> Ajouter
          </Button>
        </div>
        <div className="space-y-1 max-h-64 overflow-auto">
          {list.map((item, i) => (
            <div key={i} className="flex gap-2">
              <Input value={item.nom} onChange={(e) => update((d) => { (d[field] as any[])[i].nom = e.target.value; })} className="h-7" />
              {field === "metiers" && (
                <Select value={item.responsable || "__none"} onValueChange={(v) => update((d) => { (d.metiers[i] as any).responsable = v === "__none" ? "" : v; })}>
                  <SelectTrigger className="h-7 w-40"><SelectValue placeholder="Resp." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">—</SelectItem>
                    {app.rh.map((e) => <SelectItem key={e.personne} value={e.personne}>{e.personne}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => update((d) => { (d[field] as any[]).splice(i, 1); })}><Trash2 className="h-3 w-3" /></Button>
            </div>
          ))}
          {list.length === 0 && <p className="text-xs text-muted-foreground italic">Vide — ajoutez une entrée.</p>}
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
  const importCsv = async (files: FileList) => {
    try {
      const rows = await readCsvWin1252(files[0]);
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
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex gap-2 flex-wrap items-center">
          <FileDropZone accept=".csv" onFiles={importCsv} label="Importer CSV Devis client" icon={<FileText className="h-4 w-4" />} />
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Recherche" className="pl-8 w-64" />
          </div>
          <span className="ml-auto text-xs text-muted-foreground">{filtered.length} / {app.registre.length}</span>
        </div>
        {app.registre.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="h-10 w-10" />}
            title="Aucun registre"
            desc="Importez le CSV « Devis client » exporté depuis Progbat (encodage Windows-1252)."
          />
        ) : (
          <div className="overflow-auto max-h-[70vh] rounded border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr className="text-left">
                  <th className="p-2">N° devis</th><th className="p-2">Chantier</th><th className="p-2">Nom</th><th className="p-2">Client</th><th className="p-2">Chargé</th><th className="p-2">Statut</th><th className="p-2 text-right">Total HT</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 500).map((r, i) => (
                  <tr key={r.numDevis + i} className="border-b border-border">
                    <td className="p-2 font-mono">{r.numDevis}</td><td className="p-2">{r.chantier}</td><td className="p-2">{r.chantierFull}</td><td className="p-2">{r.client}</td><td className="p-2">{r.chargeAffaire}</td><td className="p-2">{r.statut}</td><td className="p-2 text-right tabular-nums">{fmtEUR(r.totalHT ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > 500 && <p className="text-xs text-muted-foreground p-2">Affichage limité à 500 lignes.</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ========================================================================== */
/* 4. Devis                                                                    */
/* ========================================================================== */
type DevisSort = "default" | "ecarts" | "charge";

function TabDevis({ app, update, onGoTo }: { app: AppData; update: (fn: (d: AppData) => void) => void; onGoTo: (t: TabKey) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [sort, setSort] = useState<DevisSort>("default");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

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

  const filtered = useMemo(() => {
    const list = app.devis.filter((d) => !q || [d.numDevis, d.chantier, d.nom, d.client, d.chargeAffaire, d.chefProjet].some((v) => (v ?? "").toLowerCase().includes(q.toLowerCase())));
    if (sort === "ecarts") {
      return [...list].sort((a, b) => {
        const sa = a.lignes.filter(ecartQte).length + a.lignes.filter((l) => !l.section && l.categorie === "mo" && !l.metier).length;
        const sb = b.lignes.filter(ecartQte).length + b.lignes.filter((l) => !l.section && l.categorie === "mo" && !l.metier).length;
        return sb - sa;
      });
    }
    if (sort === "charge") {
      return [...list].sort((a, b) => (a.chargeAffaire ?? "").localeCompare(b.chargeAffaire ?? ""));
    }
    return list;
  }, [app.devis, q, sort]);

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex gap-2 flex-wrap items-center">
          <FileDropZone accept=".xlsx" multiple onFiles={importXlsx} label="Importer devis .xlsx (multi)" icon={<FileSpreadsheet className="h-4 w-4" />} />
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Recherche" className="pl-8 w-64" />
          </div>
          <Select value={sort} onValueChange={(v) => setSort(v as DevisSort)}>
            <SelectTrigger className="w-48 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Tri : ordre d'import</SelectItem>
              <SelectItem value="ecarts">Tri : écarts d'abord</SelectItem>
              <SelectItem value="charge">Tri : chargé d'affaire</SelectItem>
            </SelectContent>
          </Select>
          <span className="ml-auto text-xs text-muted-foreground">{filtered.length} / {app.devis.length}</span>
        </div>

        {app.devis.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-10 w-10" />}
            title="Aucun devis"
            desc="Importez vos devis détaillés .xlsx (multi-fichiers accepté). Pour profiter du matching automatique avec les chantiers, importez d'abord le registre."
            ctaLabel="Importer le registre →"
            onCta={() => onGoTo("registre")}
          />
        ) : (
          <div className="space-y-2 max-h-[75vh] overflow-auto">
            {filtered.map((dv) => {
              const dvIdx = app.devis.indexOf(dv);
              const isOpen = open[dv.numDevis] ?? false;
              const sansMetier = dv.lignes.filter((l) => !l.section && l.categorie === "mo" && !l.metier).length;
              const ecarts = dv.lignes.filter(ecartQte).length;
              return (
                <div key={dv.numDevis} className="border border-border rounded-md">
                  <button className="w-full flex items-center gap-2 p-2 bg-muted/30 hover:bg-muted/60 text-left rounded-t-md" onClick={() => setOpen((o) => ({ ...o, [dv.numDevis]: !isOpen }))}>
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <span className="font-mono">{dv.numDevis}</span>
                    <span className="text-muted-foreground">— {dv.chantier}</span>
                    <span className="truncate">{dv.nom}</span>
                    {dv.matchRegistre && <Badge className="bg-emerald-700/80 hover:bg-emerald-700"><CheckCircle2 className="h-3 w-3 mr-1" />registre</Badge>}
                    {sansMetier > 0 && <Badge className="bg-amber-700/80 hover:bg-amber-700"><AlertTriangle className="h-3 w-3 mr-1" />{sansMetier} métier(s)</Badge>}
                    {ecarts > 0 && <Badge className="bg-destructive/80 hover:bg-destructive"><AlertTriangle className="h-3 w-3 mr-1" />{ecarts} écart(s) Qté</Badge>}
                  </button>
                  {isOpen && (
                    <div className="p-3 space-y-2">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        <LabeledInput label="Chantier" value={dv.chantier} onChange={(v) => update((d) => { d.devis[dvIdx].chantier = v; })} />
                        <LabeledInput label="Nom" value={dv.nom} onChange={(v) => update((d) => { d.devis[dvIdx].nom = v; })} />
                        <LabeledInput label="Client" value={dv.client ?? ""} onChange={(v) => update((d) => { d.devis[dvIdx].client = v; })} />
                        <LabeledSelect label="Chargé d'affaire" value={dv.chargeAffaire ?? ""} options={app.chargesAffaire.map((c) => c.nom)} onChange={(v) => update((d) => { d.devis[dvIdx].chargeAffaire = v; })} />
                        <LabeledSelect label="Chef de projet" value={dv.chefProjet ?? ""} options={app.chefsProjet.map((c) => c.nom)} onChange={(v) => update((d) => { d.devis[dvIdx].chefProjet = v; })} />
                        <LabeledInput label="Statut" value={dv.statut ?? ""} onChange={(v) => update((d) => { d.devis[dvIdx].statut = v; })} />
                      </div>
                      <div className="overflow-auto max-h-96 border border-border rounded">
                        <table className="w-full text-xs">
                          <thead className="bg-muted sticky top-0"><tr><th className="p-1">N°</th><th className="p-1 text-left">Désignation</th><th className="p-1">Métier</th><th className="p-1">Cat.</th><th className="p-1 text-right">H vendues</th><th className="p-1 text-right">CA HT</th><th></th></tr></thead>
                          <tbody>
                            {dv.lignes.map((l, li) => l.section ? (
                              <tr key={li} className="bg-muted/40"><td className="p-1 font-mono text-muted-foreground">{l.num}</td><td className="p-1 italic" colSpan={5}>📑 {l.designation}{l.qte && l.qte > 1 ? ` (× ${l.qte})` : ""}</td><td></td></tr>
                            ) : (
                              <tr key={li} className="border-b border-border">
                                <td className="p-1 font-mono">{l.num}</td>
                                <td className="p-1"><Input value={l.designation} onChange={(e) => update((d) => { d.devis[dvIdx].lignes[li].designation = e.target.value; })} className="h-6 bg-transparent text-xs" /></td>
                                <td className="p-1">
                                  <Select value={l.metier || "__none"} onValueChange={(v) => update((d) => { d.devis[dvIdx].lignes[li].metier = v === "__none" ? "" : v; })}>
                                    <SelectTrigger className="h-6 bg-transparent text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none">—</SelectItem>
                                      {app.metiers.map((m) => <SelectItem key={m.nom} value={m.nom}>{m.nom}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td className="p-1">{l.categorie}</td>
                                <td className="p-1 text-right tabular-nums">{fmtNb(l.heuresVendues)}</td>
                                <td className="p-1 text-right tabular-nums">{fmtEUR(l.caHT)}</td>
                                <td className="p-1"><Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => update((d) => { d.devis[dvIdx].lignes[li].designation; d.devis[dvIdx].lignes.splice(li, 1); })}><Trash2 className="h-3 w-3" /></Button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <Button size="sm" variant="outline" className="border-destructive/50 text-destructive hover:bg-destructive/10" onClick={() => setDeleteTarget(dv.numDevis)}>
                        <Trash2 className="h-4 w-4 mr-1" /> Supprimer ce devis
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le devis {deleteTarget} ?</AlertDialogTitle>
            <AlertDialogDescription>Cette action retire le devis et toutes ses lignes. Vous pourrez le réimporter depuis le fichier source.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={() => {
                update((d) => {
                  const i = d.devis.findIndex((x) => x.numDevis === deleteTarget);
                  if (i >= 0) d.devis.splice(i, 1);
                });
                setDeleteTarget(null);
              }}
            >Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function LabeledInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <label className="text-xs text-muted-foreground space-y-1 block"><span>{label}</span><Input value={value} onChange={(e) => onChange(e.target.value)} className="h-7" /></label>;
}
function LabeledSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className="text-xs text-muted-foreground space-y-1 block">
      <span>{label}</span>
      <Select value={value || "__none"} onValueChange={(v) => onChange(v === "__none" ? "" : v)}>
        <SelectTrigger className="h-7"><SelectValue placeholder="—" /></SelectTrigger>
        <SelectContent>
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
function TabHeures({ app, update, ctx, onGoTo }: { app: AppData; update: (fn: (d: AppData) => void) => void; ctx: ReturnType<typeof buildCtx>; onGoTo: (t: TabKey) => void }) {
  const [erase, setErase] = useState(true);
  const [q, setQ] = useState("");

  const importFile = async (files: FileList) => {
    const file = files[0];
    try {
      const rows = await readCsvOrXlsx(file);
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

  const filtered = app.heures.filter((h) => !q || [h.chantier, h.chantierNom, h.personne, h.date].some((v) => (v ?? "").toLowerCase().includes(q.toLowerCase())));

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
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex gap-2 flex-wrap items-center">
          <FileDropZone accept=".csv,.xlsx" onFiles={importFile} label="Importer heures Progbat" icon={<FileText className="h-4 w-4" />} />
          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input type="checkbox" checked={erase} onChange={(e) => setErase(e.target.checked)} /> Écraser les heures des années présentes
          </label>
          <div className="relative ml-auto">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Recherche" className="pl-8 w-64" />
          </div>
        </div>

        {app.heures.length === 0 ? (
          <EmptyState
            icon={<Clock className="h-10 w-10" />}
            title="Aucune heure saisie"
            desc="Importez l'export Progbat (CSV Windows-1252 ou XLSX) contenant les colonnes Salarié + Chantier + Heures."
            ctaLabel="Importer la Base RH d'abord →"
            onCta={() => onGoTo("rh")}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2 overflow-auto max-h-[60vh] rounded border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0"><tr><th className="p-1">Chantier</th><th className="p-1 text-left">Nom</th><th className="p-1">Personne</th><th className="p-1 text-right">H</th><th className="p-1">Date</th><th className="p-1 text-right">Coût</th></tr></thead>
                <tbody>
                  {filtered.slice(0, 1000).map((h, i) => (
                    <tr key={i} className="border-b border-border">
                      <td className="p-1 font-mono">{h.chantier}</td>
                      <td className="p-1 truncate max-w-[200px]">{h.chantierNom}</td>
                      <td className="p-1">{h.personne}</td>
                      <td className="p-1 text-right tabular-nums">{fmtNb(h.heures)}</td>
                      <td className="p-1">{h.date}</td>
                      <td className="p-1 text-right tabular-nums text-muted-foreground">{fmtEUR(h.heures * (ctx.avgCost || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length > 1000 && <p className="text-xs text-muted-foreground p-2">Affichage limité à 1 000 lignes ({filtered.length} au total).</p>}
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold text-primary text-sm">Contrôle chantiers ↔ registre</h3>
              <div className="space-y-1 max-h-[55vh] overflow-auto">
                {controle.map((c) => {
                  const ok = app.meta.chantiersOK?.[c.num];
                  const isOk = c.inReg || ok;
                  return (
                    <div key={c.num} className={cn("p-2 border rounded text-xs", isOk ? "border-emerald-700/50 bg-emerald-950/20" : "border-amber-700/50 bg-amber-950/20")}>
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{c.num}</span>
                        <span className="truncate flex-1">{c.nom}</span>
                        {isOk ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />}
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
        )}
      </CardContent>
    </Card>
  );
}

/* ========================================================================== */
/* 6. Synthèse chantiers                                                       */
/* ========================================================================== */
function TabSynthese({ app, ctx, groups, mode, onGoTo }: { app: AppData; ctx: ReturnType<typeof buildCtx>; groups: ReturnType<typeof chantierGroups>; mode: Mode; onGoTo: (t: TabKey) => void }) {
  const [q, setQ] = useState("");
  const filtered = groups.filter((g) => !q || [g.chantier, g.nom, g.client].some((v) => (v ?? "").toLowerCase().includes(q.toLowerCase())));

  if (groups.length === 0) {
    return <EmptyState icon={<Building2 className="h-10 w-10" />} title="Aucun chantier" desc="La synthèse est calculée à partir des devis + heures. Commencez par importer ces données." ctaLabel="Aller aux devis →" onCta={() => onGoTo("devis")} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center flex-wrap">
        <p className="text-xs text-muted-foreground">Mode <strong className="text-foreground">{mode === "reel" ? "Réel" : "Pondéré"}</strong> (ajustable en haut de page).</p>
        <div className="relative ml-auto">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Recherche chantier" className="pl-8 w-64" />
        </div>
      </div>
      <div className="space-y-2">
        {filtered.map((g) => {
          const c = calcChantier(app, g, ctx, mode);
          const marge = c.margeMO;
          const margeColor = marge >= 0 ? "text-emerald-400" : "text-red-400";
          return (
            <details key={g.chantier} className="border border-border rounded-md bg-card">
              <summary className="p-3 cursor-pointer hover:bg-muted/40 flex flex-wrap items-center gap-3">
                <span className="font-mono text-primary">{g.chantier}</span>
                <span className="truncate flex-1">{g.nom}</span>
                <span className="text-xs text-muted-foreground">{fmtNb(c.heuresPassees)} h passées / {fmtNb(c.heuresVendues)} h vendues</span>
                <Badge variant="secondary">vendue : {fmtEUR(c.valeurVendue)}/h</Badge>
                <Badge variant="secondary">{mode === "reel" ? "passée" : "pondérée"} : {fmtEUR(c.valeurHeure)}/h</Badge>
                <Badge className={marge >= 0 ? "bg-emerald-700/80 hover:bg-emerald-700" : "bg-destructive/80 hover:bg-destructive"}>{fmtEUR(marge)}</Badge>
              </summary>
              <div className="p-3 space-y-2 border-t border-border">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  <Kpi label="CA MO" value={fmtEUR(c.caMO)} />
                  <Kpi label="CA Mat." value={fmtEUR(c.caMat)} />
                  <Kpi label="Coût réel" value={fmtEUR(c.coutTotal)} />
                  <Kpi label="Marge MO" value={fmtEUR(c.margeMO)} color={margeColor} />
                  <Kpi label="Écart heures" value={fmtNb(c.ecartH) + " h"} color={c.ecartH > 0 ? "text-red-400" : "text-emerald-400"} />
                </div>
                <div className="overflow-auto rounded border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted"><tr><th className="p-1 text-left sticky left-0 bg-muted">Personne</th><th className="p-1 text-right">Heures</th><th className="p-1 text-right">H pond.</th><th className="p-1 text-right">CA contrib.</th><th className="p-1 text-right">Coût</th><th className="p-1 text-right">Marge</th><th className="p-1 text-right">Ratio</th></tr></thead>
                    <tbody>
                      {c.personnes.map((p) => (
                        <tr key={p.personne} className="border-b border-border">
                          <td className="p-1 sticky left-0 bg-card">{p.personne}{p.manqueTaux && <Tooltip><TooltipTrigger asChild><AlertTriangle className="inline h-3 w-3 ml-1 text-amber-400" /></TooltipTrigger><TooltipContent>Taux ou statut manquant — coût estimé via moyenne</TooltipContent></Tooltip>}</td>
                          <td className="p-1 text-right tabular-nums">{fmtNb(p.heures)}</td>
                          <td className="p-1 text-right tabular-nums">{fmtNb(p.heuresPond)}</td>
                          <td className="p-1 text-right tabular-nums">{fmtEUR(p.caContrib)}</td>
                          <td className="p-1 text-right tabular-nums">{fmtEUR(p.cout)}</td>
                          <td className={cn("p-1 text-right tabular-nums", p.marge >= 0 ? "text-emerald-400" : "text-red-400")}>{fmtEUR(p.marge)}</td>
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
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("text-lg font-semibold tabular-nums", color ?? "text-foreground")}>{value}</div>
    </div>
  );
}

/* ========================================================================== */
/* 7. Marge par personne                                                       */
/* ========================================================================== */
function TabMargePersonne({ app, mode, onGoTo }: { app: AppData; mode: Mode; onGoTo: (t: TabKey) => void }) {
  const [q, setQ] = useState("");
  const data = useMemo(() => calcPersonnes(app, mode), [app, mode]);
  const filtered = data.filter((p: any) => !q || p.personne.toLowerCase().includes(q.toLowerCase()));

  if (data.length === 0) {
    return <EmptyState icon={<UserSquare2 className="h-10 w-10" />} title="Aucune donnée par personne" desc="Importez d'abord la Base RH et les heures saisies." ctaLabel="Aller à la Base RH →" onCta={() => onGoTo("rh")} />;
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex gap-2 items-center flex-wrap">
          <p className="text-xs text-muted-foreground">Mode <strong className="text-foreground">{mode === "reel" ? "Réel" : "Pondéré"}</strong>.</p>
          <div className="relative ml-auto">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Recherche personne" className="pl-8 w-64" />
          </div>
        </div>
        <div className="overflow-auto max-h-[70vh] rounded border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted sticky top-0">
              <tr className="text-left">
                <th className="p-2 sticky left-0 bg-muted">Personne</th>
                <th className="p-2">Statut</th>
                <th className="p-2 text-right">Chantiers</th>
                <th className="p-2 text-right">Heures</th>
                <th className="p-2 text-right">H pond.</th>
                <th className="p-2 text-right">CA contrib.</th>
                <th className="p-2 text-right">Coût</th>
                <th className="p-2 text-right">Dont majo.</th>
                <th className="p-2 text-right">Marge</th>
                <th className="p-2 text-right">
                  <span className="inline-flex items-center gap-1">Ratio
                    <Tooltip><TooltipTrigger asChild><Info className="h-3 w-3 text-muted-foreground" /></TooltipTrigger>
                      <TooltipContent>CA contributif ÷ coût. &gt; 1 = personne rentable.</TooltipContent>
                    </Tooltip>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p: any) => (
                <tr key={p.personne} className="border-b border-border">
                  <td className="p-2 sticky left-0 bg-card">{p.personne}{p.manqueTaux && <Tooltip><TooltipTrigger asChild><AlertTriangle className="inline h-3 w-3 ml-1 text-amber-400" /></TooltipTrigger><TooltipContent>Taux ou statut manquant</TooltipContent></Tooltip>}</td>
                  <td className="p-2 text-muted-foreground">{p.statut ?? "—"}</td>
                  <td className="p-2 text-right tabular-nums">{p.chantiers}</td>
                  <td className="p-2 text-right tabular-nums">{fmtNb(p.heures)}</td>
                  <td className="p-2 text-right tabular-nums">{fmtNb(p.heuresPond)}</td>
                  <td className="p-2 text-right tabular-nums">{fmtEUR(p.caContrib)}</td>
                  <td className="p-2 text-right tabular-nums">{fmtEUR(p.cout)}</td>
                  <td className="p-2 text-right tabular-nums text-muted-foreground">{fmtEUR(p.coutMajo)}</td>
                  <td className={cn("p-2 text-right tabular-nums", p.marge >= 0 ? "text-emerald-400" : "text-red-400")}>{fmtEUR(p.marge)}</td>
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
function TabPerformance({ app, ctx, groups, onGoTo }: { app: AppData; ctx: ReturnType<typeof buildCtx>; groups: ReturnType<typeof chantierGroups>; onGoTo: (t: TabKey) => void }) {
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

  if (perfs.length === 0) {
    return <EmptyState icon={<Target className="h-10 w-10" />} title="Pas de données de performance" desc="Importez devis + heures pour visualiser les indicateurs par chef de projet, chargé d'affaire et pôle métier." ctaLabel="Aller aux devis →" onCta={() => onGoTo("devis")} />;
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Recherche chantier / chef / chargé" className="pl-8 w-80" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <AggCard title="Par chef de projet" rows={aggBy("chefProjet")} />
        <AggCard title="Par chargé d'affaire" rows={aggBy("chargeAffaire")} />
        <AggCard title="Par pôle métier" rows={aggMetier.map((m) => ({ key: m.metier + (m.resp ? ` (${m.resp})` : ""), ca: m.ca, cout: m.cout, marge: m.marge, ratio: m.ratio, prod: m.prod, n: 0, vendu: m.vendu, passe: m.passe }))} />
      </div>

      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold text-primary mb-2">Détail par chantier</h3>
          <div className="overflow-auto max-h-[60vh] rounded border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted sticky top-0">
                <tr className="text-left">
                  <th className="p-1 sticky left-0 bg-muted">Chantier</th>
                  <th className="p-1">Nom</th>
                  <th className="p-1">Chef projet</th>
                  <th className="p-1">Chargé</th>
                  <th className="p-1 text-right">CA MO</th>
                  <th className="p-1 text-right">Coût</th>
                  <th className="p-1 text-right">Marge</th>
                  <th className="p-1 text-right"><span className="inline-flex items-center gap-1">Ratio<Tooltip><TooltipTrigger asChild><Info className="h-3 w-3" /></TooltipTrigger><TooltipContent>CA ÷ coût</TooltipContent></Tooltip></span></th>
                  <th className="p-1 text-right"><span className="inline-flex items-center gap-1">Prod.<Tooltip><TooltipTrigger asChild><Info className="h-3 w-3" /></TooltipTrigger><TooltipContent>H vendues ÷ H passées. &gt; 1 = équipe sous le devis (gain).</TooltipContent></Tooltip></span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.chantier} className="border-b border-border">
                    <td className="p-1 font-mono sticky left-0 bg-card">{p.chantier}</td>
                    <td className="p-1 truncate max-w-[220px]">{p.nom}</td>
                    <td className="p-1 text-muted-foreground">{p.chefProjet}</td>
                    <td className="p-1 text-muted-foreground">{p.chargeAffaire}</td>
                    <td className="p-1 text-right tabular-nums">{fmtEUR(p.caMO)}</td>
                    <td className="p-1 text-right tabular-nums">{fmtEUR(p.coutTotal)}</td>
                    <td className={cn("p-1 text-right tabular-nums", p.margeReelle >= 0 ? "text-emerald-400" : "text-red-400")}>{fmtEUR(p.margeReelle)}</td>
                    <td className={cn("p-1 text-right tabular-nums", p.ratio >= 1 ? "text-emerald-400" : "text-red-400")}>{isFinite(p.ratio) ? p.ratio.toFixed(2) : "—"}</td>
                    <td className={cn("p-1 text-right tabular-nums", p.prodGlobale >= 1 ? "text-emerald-400" : "text-red-400")}>{isFinite(p.prodGlobale) ? p.prodGlobale.toFixed(2) : "—"}</td>
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
    <Card>
      <CardContent className="p-4">
        <h3 className="font-semibold text-primary mb-2 text-sm">{title}</h3>
        <div className="overflow-auto max-h-80 rounded border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted"><tr className="text-left"><th className="p-1"></th><th className="p-1 text-right">Marge</th><th className="p-1 text-right">Ratio</th><th className="p-1 text-right">Prod.</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-border">
                  <td className="p-1 truncate max-w-[180px]">{r.key}</td>
                  <td className={cn("p-1 text-right tabular-nums", r.marge >= 0 ? "text-emerald-400" : "text-red-400")}>{fmtEUR(r.marge)}</td>
                  <td className={cn("p-1 text-right tabular-nums", r.ratio >= 1 ? "text-emerald-400" : "text-red-400")}>{isFinite(r.ratio) ? r.ratio.toFixed(2) : "—"}</td>
                  <td className={cn("p-1 text-right tabular-nums", r.prod >= 1 ? "text-emerald-400" : "text-red-400")}>{isFinite(r.prod) ? r.prod.toFixed(2) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
