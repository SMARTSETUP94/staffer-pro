/**
 * v0.45.1 — Page détaillée "Mon équipe type".
 * Top coéquipiers du chef connecté avec drilldown par chantier.
 * Réservé chef_chantier (global ou scoped) + admin.
 */
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Users, ArrowLeft, Info, Loader2, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCapability } from "@/hooks/use-capability";
import { useResolvedEmploye } from "@/hooks/use-resolved-employe";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

export const Route = createFileRoute("/_app/mon-equipe-type")({
  head: () => ({ meta: [{ title: "Mon équipe type — Setup Paris" }] }),
  component: MonEquipeTypePage,
});

interface Row {
  employe_id: string;
  prenom: string;
  nom: string;
  type_contrat: string;
  poste_principal: string | null;
  nb_chantiers: number;
  total_demi_jours: number;
  presence_pct_moyen: number;
  derniere_collab: string | null;
  score: number;
}

interface AffaireRow {
  affaire_id: string;
  affaire_numero: string | null;
  client: string | null;
  typologie: string | null;
  phase: string | null;
  affaire_statut: string | null;
  premier_jour: string | null;
  dernier_jour: string | null;
  nb_demi_jours: number;
  nb_jours_distincts: number;
  presence_pct_moyen: number | null;
  a_refuse: boolean;
  a_ete_absent: boolean;
}

const TYPOLOGIE_OPTS: { value: string; label: string }[] = [
  { value: "all", label: "Toutes typologies" },
  { value: "montage_demontage", label: "Montage / démontage" },
  { value: "fabrication", label: "Fabrication" },
  { value: "stockage", label: "Stockage" },
  { value: "prototype", label: "Prototype" },
  { value: "non_operationnel", label: "Non opérationnel" },
];

const PERIOD_OPTS = [
  { value: "3", label: "3 derniers mois" },
  { value: "6", label: "6 derniers mois" },
  { value: "12", label: "12 derniers mois" },
  { value: "24", label: "24 derniers mois" },
  { value: "60", label: "5 dernières années" },
];

const TYPO_LABEL: Record<string, string> = {
  montage_demontage: "Montage/démontage",
  fabrication: "Fabrication",
  stockage: "Stockage",
  prototype: "Prototype",
  non_operationnel: "Non opérationnel",
};

function fmtLastCollab(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 1) return "aujourd'hui";
  if (days < 30) return `il y a ${days}j`;
  if (days < 365) return `il y a ${Math.floor(days / 30)} mois`;
  return d.toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit" });
}

function MonEquipeTypePage() {
  const navigate = useNavigate();
  const { loading: authLoading } = useAuth();
  const isAdminOrChef = useCapability("dashboard.team.view");
  const isAdmin = useCapability("admin.roadmap.manage");
  const { employeId: chefId } = useResolvedEmploye();

  const [typologie, setTypologie] = useState<string>("all");
  const [months, setMonths] = useState<string>("12");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Row | null>(null);
  const [affaires, setAffaires] = useState<AffaireRow[] | null>(null);
  const [loadingAffaires, setLoadingAffaires] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAdminOrChef) {
      navigate({ to: "/" });
    }
  }, [authLoading, isAdminOrChef, navigate]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase.rpc("get_mon_equipe_type", {
        _typologie: typologie === "all" ? undefined : typologie,
        _limit: 50,
        _months: Number(months),
      });
      if (cancelled) return;
      if (!error && data) setRows(data as Row[]);
      else setRows([]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [typologie, months]);

  // Drilldown : charge les chantiers du coéquipier sélectionné
  useEffect(() => {
    if (!selected || !chefId) {
      setAffaires(null);
      return;
    }
    let cancelled = false;
    setLoadingAffaires(true);
    setAffaires(null);
    (async () => {
      const sinceDate = new Date();
      sinceDate.setMonth(sinceDate.getMonth() - Number(months));
      const since = sinceDate.toISOString().slice(0, 10);

      let q = supabase
        .from("affaire_equipe_historique")
        .select("affaire_id, affaire_numero, client, typologie, phase, affaire_statut, premier_jour, dernier_jour, nb_demi_jours, nb_jours_distincts, presence_pct_moyen, a_refuse, a_ete_absent")
        .eq("chef_id", chefId)
        .eq("employe_id", selected.employe_id)
        .gte("dernier_jour", since)
        .order("dernier_jour", { ascending: false });
      if (typologie !== "all") q = q.eq("typologie", typologie);

      const { data, error } = await q;
      if (cancelled) return;
      if (!error && data) setAffaires(data as AffaireRow[]);
      else setAffaires([]);
      setLoadingAffaires(false);
    })();
    return () => { cancelled = true; };
  }, [selected, chefId, months, typologie]);

  const totals = useMemo(() => {
    const collabs = rows.reduce((acc, r) => acc + r.nb_chantiers, 0);
    const demi = rows.reduce((acc, r) => acc + r.total_demi_jours, 0);
    return { coequipiers: rows.length, collabs, demi };
  }, [rows]);

  if (authLoading) {
    return <div className="p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-1 -ml-2 h-7">
            <Link to="/"><ArrowLeft className="mr-1 h-3.5 w-3.5" /> Dashboard</Link>
          </Button>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Users className="h-6 w-6 text-primary" /> Mon équipe type
          </h1>
          <p className="text-sm text-muted-foreground">
            Coéquipiers les plus fréquemment staffés sous votre responsabilité
            {isAdmin ? " (vue admin : agrégé sur votre propre fiche)" : ""}.
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={typologie} onValueChange={setTypologie}>
            <SelectTrigger className="h-9 w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TYPOLOGIE_OPTS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={months} onValueChange={setMonths}>
            <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIOD_OPTS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase text-muted-foreground">Coéquipiers</p>
            <p className="text-2xl font-semibold tabular-nums">{totals.coequipiers}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase text-muted-foreground">Collaborations cumulées</p>
            <p className="text-2xl font-semibold tabular-nums">{totals.collabs}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase text-muted-foreground">Demi-journées staffées</p>
            <p className="text-2xl font-semibold tabular-nums">{totals.demi}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Classement
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 cursor-help text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  Score = nb_chantiers × 2 + ln(½j+1) × 3 + bonus de fraîcheur.
                  Les refus et fiches inactives sont exclus. Cliquez une ligne
                  pour voir les chantiers concernés.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
          <CardDescription>Cliquez un coéquipier pour voir le détail des chantiers partagés.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Chargement…
            </div>
          ) : rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Pas encore d'historique sur ce filtre.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Coéquipier</TableHead>
                  <TableHead>Poste / contrat</TableHead>
                  <TableHead className="text-right">Chantiers</TableHead>
                  <TableHead className="text-right">½j</TableHead>
                  <TableHead className="text-right">Présence moy.</TableHead>
                  <TableHead>Dernière collab.</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, idx) => (
                  <TableRow
                    key={r.employe_id}
                    className="cursor-pointer"
                    onClick={() => setSelected(r)}
                  >
                    <TableCell className="font-semibold tabular-nums text-primary">{idx + 1}</TableCell>
                    <TableCell className="font-medium">{r.prenom} {r.nom}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.poste_principal ?? "—"}
                      <span className="mx-1">·</span>
                      <Badge variant="outline" className="text-[10px]">{r.type_contrat}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.nb_chantiers}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.total_demi_jours}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.presence_pct_moyen != null ? `${r.presence_pct_moyen}%` : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtLastCollab(r.derniere_collab)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{r.score}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-[11px] text-muted-foreground">
        Données calculées en temps réel depuis l'historique des assignations
        (table <code>affaire_equipe_historique</code>, refresh sur trigger).
      </p>

      {/* Drilldown sheet */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              {selected?.prenom} {selected?.nom}
            </SheetTitle>
            <SheetDescription>
              {selected?.poste_principal ?? selected?.type_contrat} ·{" "}
              {selected?.nb_chantiers} chantiers · {selected?.total_demi_jours} ½j sur la période
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            {loadingAffaires ? (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Chargement…
              </div>
            ) : !affaires || affaires.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Aucun chantier sur cette période.</p>
            ) : (
              <ul className="space-y-2">
                {affaires.map((a) => (
                  <li key={a.affaire_id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          to="/affaires/$affaireId"
                          params={{ affaireId: a.affaire_id }}
                          className="font-medium hover:underline"
                        >
                          <Building2 className="mr-1 inline h-3.5 w-3.5" />
                          {a.affaire_numero ?? a.affaire_id.slice(0, 8)}
                          {a.client ? <span className="text-muted-foreground"> · {a.client}</span> : null}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          {a.typologie ? (
                            <Badge variant="secondary" className="text-[10px]">{TYPO_LABEL[a.typologie] ?? a.typologie}</Badge>
                          ) : null}
                          {a.phase ? <Badge variant="outline" className="text-[10px]">{a.phase}</Badge> : null}
                          {a.affaire_statut ? <span className="text-[11px]">· {a.affaire_statut}</span> : null}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {fmtDate(a.premier_jour)} → {fmtDate(a.dernier_jour)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right text-xs">
                        <div className="tabular-nums font-semibold">{a.nb_demi_jours} ½j</div>
                        <div className="tabular-nums text-muted-foreground">{a.nb_jours_distincts} j</div>
                        {a.presence_pct_moyen != null ? (
                          <div className="tabular-nums text-muted-foreground">{a.presence_pct_moyen}%</div>
                        ) : null}
                      </div>
                    </div>
                    {(a.a_refuse || a.a_ete_absent) ? (
                      <div className="mt-2 flex gap-1">
                        {a.a_refuse ? <Badge variant="destructive" className="text-[10px]">A refusé</Badge> : null}
                        {a.a_ete_absent ? <Badge variant="outline" className="text-[10px]">Absent au moins une fois</Badge> : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
