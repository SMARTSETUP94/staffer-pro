// Sprint 2b2.2 — Orchestrateur léger pour la section Staffing Personnes (tier-based).
// Remplace l'ancien fichier monolithique 1214L. Sous-composants dans ./personnes/.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarDays,
  Eye,
  EyeOff,
  List,
  Loader2,
  RefreshCw,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { autoStaffPlan } from "@/server/staffing-autostaff-plan.functions";
import { getPlanAssignments } from "@/server/staffing-personnes.functions";
import { METIER_KEY_BY_ID, type MetierKey, type PlanStep } from "@/lib/staffing/types";
import { METIER_COLOR, METIER_LABEL, METIER_ORDER } from "./gantt-helpers";
import { CalendarView } from "./personnes/CalendarView";
import { ListView } from "./personnes/ListView";
import { effectiveSpanDays, type Assignment } from "./personnes/shared";

type ViewMode = "list" | "calendar";
type MetierFilter = "all" | MetierKey;

const LS_FILTER_KEY = "staffingPersonnes.metierFilter";
const LS_VIEW_KEY = "staffingPersonnes.viewMode";
const LS_HIDE_FULL_KEY = "staffingPersonnes.hideFull";

function readLS<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
function writeLS(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

interface Props {
  planId: string;
  steps: PlanStep[];
  onAssignmentsChanged?: () => void;
  objetsLabel: Record<string, string>;
  /** v0.39.0 — assignations + presence_pct restent éditables. pers/dates dérivés des Vues 1 & 2. */
  readOnly?: boolean;
}

export function StaffingPersonnesSection({
  planId,
  steps,
  onAssignmentsChanged,
  objetsLabel,
  readOnly = false,
}: Props) {
  const fetchAssignments = useServerFn(getPlanAssignments);
  const restaff = useServerFn(autoStaffPlan);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [restaffing, setRestaffing] = useState(false);

  const ALLOWED_METIERS = useMemo<readonly MetierFilter[]>(
    () => ["all", ...METIER_ORDER] as const,
    [],
  );
  const [metierFilter, setMetierFilter] = useState<MetierFilter>(() =>
    readLS<MetierFilter>(LS_FILTER_KEY, "all", ALLOWED_METIERS),
  );
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    readLS<ViewMode>(LS_VIEW_KEY, "list", ["list", "calendar"] as const),
  );
  const [hideFull, setHideFull] = useState<boolean>(() =>
    readLS<"true" | "false">(LS_HIDE_FULL_KEY, "true", ["true", "false"] as const) === "true",
  );

  useEffect(() => {
    writeLS(LS_FILTER_KEY, metierFilter);
  }, [metierFilter]);
  useEffect(() => {
    writeLS(LS_VIEW_KEY, viewMode);
  }, [viewMode]);
  useEffect(() => {
    writeLS(LS_HIDE_FULL_KEY, hideFull ? "true" : "false");
  }, [hideFull]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchAssignments({ data: { planId } });
      setAssignments(r.assignments);
    } finally {
      setLoading(false);
    }
  }, [fetchAssignments, planId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** Cumul presence_pct par (employe_id × date) — pour conflits */
  const cumulByEmpDate = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of assignments) {
      const k = `${a.employe_id}|${a.date}`;
      m[k] = (m[k] ?? 0) + a.presence_pct;
    }
    return m;
  }, [assignments]);

  const handleChanged = useCallback(async () => {
    await reload();
    onAssignmentsChanged?.();
  }, [reload, onAssignmentsChanged]);

  /** Couverture par step (pers·j) — base = span effectif en jours (ceil demi/2) */
  const coverByStep = useMemo(() => {
    const m: Record<string, { cover: number; target: number; isFull: boolean }> = {};
    for (const s of steps) {
      const target = s.pers * effectiveSpanDays(s);
      const cover =
        assignments.filter((a) => a.step_id === s.id).reduce((acc, a) => acc + a.presence_pct, 0) / 100;
      m[s.id] = { cover, target, isFull: target > 0 && cover >= target };
    }
    return m;
  }, [steps, assignments]);

  /** Compteurs nb steps par métier (pour badges des tabs) */
  const countByMetier = useMemo(() => {
    const m: Record<MetierFilter, number> = {
      all: 0,
      BE: 0,
      Num: 0,
      Bois: 0,
      Metal: 0,
      Peint: 0,
      Tap: 0,
      Manut: 0,
    };
    for (const s of steps) {
      if (s.start_date === "TBD") continue;
      const cov = coverByStep[s.id];
      if (hideFull && cov?.isFull) continue;
      const k = METIER_KEY_BY_ID[s.metier_id];
      if (k) m[k] += 1;
      m.all += 1;
    }
    return m;
  }, [steps, coverByStep, hideFull]);

  /** Steps filtrés selon métier + hideFull */
  const visibleSteps = useMemo(() => {
    return steps.filter((s) => {
      if (s.start_date === "TBD") return false;
      if (hideFull && coverByStep[s.id]?.isFull) return false;
      if (metierFilter !== "all" && METIER_KEY_BY_ID[s.metier_id] !== metierFilter) return false;
      return true;
    });
  }, [steps, hideFull, metierFilter, coverByStep]);

  const handleRestaff = useCallback(async () => {
    setRestaffing(true);
    try {
      const r = await restaff({ data: { planId } });
      toast.success(
        `Re-staffing nominatif terminé : ${r.filled_total} affectations sur ${r.steps_traites} étapes`,
      );
      await reload();
      onAssignmentsChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur re-staffing");
    } finally {
      setRestaffing(false);
    }
  }, [restaff, planId, reload, onAssignmentsChanged]);

  if (loading && assignments.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 rounded-2xl border border-border bg-card">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  const totalSteps = steps.filter((s) => s.start_date !== "TBD").length;
  const fullCount = steps.filter((s) => s.start_date !== "TBD" && coverByStep[s.id]?.isFull).length;

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Staffing personnes (tier-based)
            {readOnly && (
              <span className="ml-2 text-[10px] font-normal italic text-muted-foreground">
                — lecture seule, dérivé des Vues 1 & 2
              </span>
            )}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {assignments.length} affectation{assignments.length > 1 ? "s" : ""} · {visibleSteps.length}/
            {totalSteps} étape{totalSteps > 1 ? "s" : ""}
            {fullCount > 0 && hideFull && (
              <span className="ml-1 italic">
                ({fullCount} complète{fullCount > 1 ? "s" : ""} masquée
                {fullCount > 1 ? "s" : ""})
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={handleRestaff}
            disabled={restaffing}
            variant="default"
            size="sm"
            data-testid="restaff-nominatif"
            title="Re-lancer la suggestion nominative tier-based sur toutes les étapes"
          >
            {restaffing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Wand2 className="mr-1 h-3 w-3" />}
            Re-staffer nominatif
          </Button>
          <Button
            onClick={() => setHideFull((v) => !v)}
            variant={hideFull ? "secondary" : "ghost"}
            size="sm"
            title={hideFull ? "Afficher aussi les étapes 100% staffées" : "Masquer les étapes 100% staffées"}
          >
            {hideFull ? <EyeOff className="mr-1 h-3 w-3" /> : <Eye className="mr-1 h-3 w-3" />}
            {hideFull ? "Masquer complètes" : "Tout afficher"}
          </Button>
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <TabsList className="h-8">
              <TabsTrigger value="list" className="h-6 px-2 text-xs">
                <List className="mr-1 h-3 w-3" /> Liste
              </TabsTrigger>
              <TabsTrigger value="calendar" className="h-6 px-2 text-xs">
                <CalendarDays className="mr-1 h-3 w-3" /> Calendrier
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button onClick={reload} variant="ghost" size="sm">
            <RefreshCw className="mr-1 h-3 w-3" /> Rafraîchir
          </Button>
        </div>
      </div>

      <Tabs value={metierFilter} onValueChange={(v) => setMetierFilter(v as MetierFilter)}>
        <TabsList className="h-9 flex-wrap">
          <TabsTrigger value="all" className="h-7 gap-1.5 text-xs">
            Tous
            <Badge variant="outline" className="h-4 px-1 text-[10px] font-mono">
              {countByMetier.all}
            </Badge>
          </TabsTrigger>
          {METIER_ORDER.map((k) => (
            <TabsTrigger key={k} value={k} className="h-7 gap-1.5 text-xs">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: METIER_COLOR[k] }} />
              {METIER_LABEL[k]}
              <Badge variant="outline" className="h-4 px-1 text-[10px] font-mono">
                {countByMetier[k]}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {readOnly && (
        <p className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-[11px] italic text-muted-foreground">
          Cette vue est en <strong>lecture pure</strong> — l'affectation est dérivée automatiquement des Vues 1 (Charge métier) et 2 (Objet/Étape). Utilisez le bouton <strong>Re-staffer nominatif</strong> pour relancer la suggestion tier-based sur l'ensemble du plan.
        </p>
      )}
      {visibleSteps.length === 0 ? (
        <p className="py-6 text-center text-sm italic text-muted-foreground">
          {totalSteps === 0
            ? "Aucune étape planifiée. Recalculez le plan d'abord."
            : "Aucune étape correspond aux filtres actifs."}
        </p>
      ) : (
        <div
          data-readonly={readOnly ? "1" : "0"}
          className={
            readOnly
              ? "[&_[data-write='1']]:pointer-events-none [&_[data-write='1']]:opacity-40 [&_[data-write='1']]:select-none"
              : ""
          }
        >
          {viewMode === "list" ? (
            <ListView
              planId={planId}
              steps={visibleSteps}
              assignments={assignments}
              coverByStep={coverByStep}
              cumulByEmpDate={cumulByEmpDate}
              objetsLabel={objetsLabel}
              onChanged={handleChanged}
            />
          ) : (
            <CalendarView
              planId={planId}
              steps={visibleSteps}
              assignments={assignments}
              cumulByEmpDate={cumulByEmpDate}
              objetsLabel={objetsLabel}
              onChanged={handleChanged}
            />
          )}
        </div>
      )}
    </div>
  );
}
