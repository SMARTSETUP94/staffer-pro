// v0.35.11 / Sprint Express — Split-button "Mettre au planning"
// v0.35.12 — toggle "Inclure week-ends" via dropdown + stepper toast 4 étapes + nav avec joursOuvres/délai/weekend.
import { useState, useCallback, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  Wand2,
  Settings,
  Loader2,
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
} from "lucide-react";
import { format, addDays, parseISO } from "date-fns";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { listFabObjetsForWizard, getActivePlansForAffaire } from "@/server/staffing-plan-create.functions";
import { createPlanExpress } from "@/server/staffing-express.functions";
import { useWizardPrefetch } from "@/hooks/use-wizard-prefetch";
import { isJourNonOuvreFR } from "@/lib/jours-feries";

interface Props {
  affaireId: string;
  dateMontage?: string | null;
  onConfigurer: () => void;
  disabled?: boolean;
}

function todayISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function defaultDateFin(dateMontage: string | null | undefined): string {
  if (dateMontage) {
    try {
      return format(addDays(parseISO(dateMontage), -2), "yyyy-MM-dd");
    } catch {
      // ignore
    }
  }
  return format(addDays(new Date(), 30), "yyyy-MM-dd");
}

function estimateDateDebut(dateFinIso: string, totalH: number, includeWeekends: boolean): string {
  // Avec WE inclus, vitesse théorique × (7/5) → divise les semaines par 7/5.
  const weeks = Math.ceil((totalH / 40) * 1.3 * (includeWeekends ? 5 / 7 : 1));
  const days = Math.max(7, weeks * 7);
  return format(addDays(parseISO(dateFinIso), -days), "yyyy-MM-dd");
}

const STEPS = ["Création", "Calcul", "Auto-staff", "Publication"] as const;

export function MettreAuPlanningExpressButton({
  affaireId,
  dateMontage,
  onConfigurer,
  disabled,
}: Props) {
  const navigate = useNavigate();
  const expressFn = useServerFn(createPlanExpress);
  const listFn = useServerFn(listFabObjetsForWizard);
  const getActivePlansFn = useServerFn(getActivePlansForAffaire);
  const { prefetch } = useWizardPrefetch(affaireId);
  const [running, setRunning] = useState(false);
  const [includeWeekends, setIncludeWeekends] = useState(false);
  const [warnEmpty, setWarnEmpty] = useState<{ open: boolean; reason: string }>({
    open: false,
    reason: "",
  });
  const stepperTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Quick win J — détecte si un plan publié actif existe pour cette affaire.
  const { data: activePlans } = useQuery({
    queryKey: ["active-plans-for-affaire", affaireId],
    queryFn: () => getActivePlansFn({ data: { affaire_id: affaireId } }),
    staleTime: 30_000,
  });
  const publishedPlan = activePlans?.find((p) => p.status === "published") ?? null;

  const startStepper = useCallback((toastId: string | number, total: number) => {
    // Affiche stepper progressif basé sur estimation : 4 ticks équirépartis sur durée moyenne 6s.
    // Si la fonction finit avant, on dismiss simplement le toast (clearTimeouts).
    const tickMs = 1500;
    let cur = 0;
    const update = () => {
      cur += 1;
      if (cur > STEPS.length) return;
      toast.loading(
        `Express ${cur}/${STEPS.length} — ${STEPS[cur - 1]}${total ? ` (${total} objets)` : ""}…`,
        { id: toastId },
      );
      const t = setTimeout(update, tickMs);
      stepperTimers.current.push(t);
    };
    update();
  }, []);

  const clearStepper = useCallback(() => {
    for (const t of stepperTimers.current) clearTimeout(t);
    stepperTimers.current = [];
  }, []);

  const runExpress = useCallback(async () => {
    setRunning(true);
    const toastId = toast.loading("Express — démarrage…");
    try {
      const all = await listFn({ data: { affaire_id: affaireId } });
      const eligibles = all.filter((o) => !o.dans_plan_actif);

      if (eligibles.length === 0) {
        toast.dismiss(toastId);
        const reason =
          all.length === 0
            ? "Cette affaire n'a aucun objet de fabrication. Importez d'abord un devis."
            : "Tous les objets de fabrication sont déjà dans un plan actif. Utilisez « Configurer manuellement » pour archiver l'existant.";
        setWarnEmpty({ open: true, reason });
        return;
      }

      const dateFin = defaultDateFin(dateMontage);
      const totalH = eligibles.reduce((s, o) => s + o.heures_total, 0);
      let dateDebut = estimateDateDebut(dateFin, totalH, includeWeekends);
      const today = todayISO();
      if (dateDebut < today) dateDebut = today;
      if (dateDebut > dateFin) dateDebut = today;

      startStepper(toastId, eligibles.length);

      const res = await expressFn({
        data: {
          affaire_id: affaireId,
          date_debut_fab: dateDebut,
          date_fin_fab: dateFin,
          objet_ids: eligibles.map((o) => o.id),
          auto_publish: true,
          include_weekends: includeWeekends,
        },
      });

      clearStepper();
      toast.dismiss(toastId);
      // Quick win I — feedback haptique mobile sur succès
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        try {
          navigator.vibrate(res.published ? [40, 60, 40] : 50);
        } catch {
          /* noop */
        }
      }
      const sec = (res.duration_ms / 1000).toFixed(1);
      const weHint = res.include_weekends ? " · WE inclus" : "";
      if (res.published) {
        toast.success(
          `Plan publié en ${sec}s — ${res.filled_total} créneaux affectés${weHint}`,
          { duration: 5000 },
        );
      } else {
        toast.success(
          `Plan créé en ${sec}s — à relire (${res.publish_reason_skipped ?? "vérifications nécessaires"})${weHint}`,
          { duration: 6000 },
        );
      }

      navigate({
        to: "/staffing/$planId",
        params: { planId: res.plan_id },
        search: {
          express: "1",
          published: res.published ? "1" : "0",
          filled: String(res.filled_total),
          unfilled: String(res.unfilled_total),
          alertes: String(res.alertes_critiques),
          reason: res.publish_reason_skipped ?? "",
          jours: String(res.jours_ouvres),
          delaiCourt: res.delai_court ? "1" : "0",
          we: res.include_weekends ? "1" : "0",
        } as never,
      });
    } catch (e) {
      clearStepper();
      toast.dismiss(toastId);
      toast.error(
        e instanceof Error ? e.message : "Erreur Express. Essayez « Configurer manuellement ».",
        { duration: 7000 },
      );
    } finally {
      setRunning(false);
    }
  }, [
    affaireId,
    dateMontage,
    expressFn,
    listFn,
    navigate,
    includeWeekends,
    startStepper,
    clearStepper,
  ]);

  // Quick win J — si un plan publié existe, propose l'accès direct plutôt qu'un Express.
  if (publishedPlan) {
    return (
      <div className="inline-flex rounded-xl border border-emerald-500/50 overflow-hidden">
        <Button
          variant="outline"
          onClick={() =>
            navigate({ to: "/staffing/$planId", params: { planId: publishedPlan.id } })
          }
          disabled={disabled}
          className="rounded-none border-0 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
          title="Un plan publié actif existe pour cette affaire — cliquer pour l'ouvrir"
        >
          <CheckCircle2 className="mr-2 h-4 w-4" />
          Plan actif
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              disabled={disabled || running}
              className="rounded-none border-0 border-l border-emerald-500/50 px-2 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
              aria-label="Options"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem
              onClick={() =>
                navigate({ to: "/staffing/$planId", params: { planId: publishedPlan.id } })
              }
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Ouvrir le plan publié
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                prefetch();
                onConfigurer();
              }}
              disabled={running}
            >
              <Settings className="mr-2 h-4 w-4" />
              Nouveau plan (archive l'actuel)…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <>
      <div className="inline-flex rounded-xl border border-primary/40 overflow-hidden">
        <Button
          variant="outline"
          onClick={runExpress}
          onMouseEnter={prefetch}
          onFocus={prefetch}
          disabled={disabled || running}
          className="rounded-none border-0 text-primary hover:bg-primary/5"
          title={
            includeWeekends
              ? "Express avec week-ends autorisés"
              : "Création + staffing + publication en 1 clic (si aucun conflit)"
          }
        >
          {running ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Wand2 className="mr-2 h-4 w-4 motion-safe:animate-[pulse_2.4s_ease-in-out_infinite]" />
          )}
          Mettre au planning
          {includeWeekends && (
            <CalendarRange className="ml-1.5 h-3.5 w-3.5 text-amber-600" />
          )}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              disabled={disabled || running}
              className="rounded-none border-0 border-l border-primary/40 px-2 text-primary hover:bg-primary/5"
              aria-label="Options"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem onClick={runExpress} disabled={running}>
              <Wand2 className="mr-2 h-4 w-4" />
              Express (auto, 1 clic)
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                prefetch();
                onConfigurer();
              }}
              disabled={running}
            >
              <Settings className="mr-2 h-4 w-4" />
              Configurer manuellement…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">
              Calendrier
            </DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={includeWeekends}
              onCheckedChange={(v) => setIncludeWeekends(v === true)}
              onSelect={(e) => e.preventDefault()}
            >
              <CalendarRange className="mr-2 h-4 w-4" />
              <div className="flex flex-col">
                <span>Inclure les week-ends</span>
                <span className="text-[11px] text-muted-foreground">
                  Permet le staffing samedi/dimanche
                </span>
              </div>
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>


      <AlertDialog
        open={warnEmpty.open}
        onOpenChange={(o) => setWarnEmpty((s) => ({ ...s, open: o }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Express impossible
            </AlertDialogTitle>
            <AlertDialogDescription>{warnEmpty.reason}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>OK</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setWarnEmpty({ open: false, reason: "" });
                onConfigurer();
              }}
            >
              Ouvrir le wizard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
