// v0.35.11 / Sprint Express — Split-button "Mettre au planning"
//   - Action principale : Express (1 clic → create + auto-staff + publish auto si OK)
//   - Menu déroulant : "Configurer manuellement…" → ouvre le wizard existant
//
// Heuristiques Express (transparent pour l'utilisateur) :
//   - Sélection objets = TOUS les fab non encore dans un plan actif (collision = exclu)
//   - Date livraison fab = date_montage − 2j (marge logistique) si dispo, sinon today + 30j
//   - Date début fab = livraison − ⌈heures_total / 40h × 1.3⌉ jours ouvrés (marge 30%)
//   - Demande auto_publish=true → publish auto si 0 unfilled ET 0 alerte hard
//
// Le résultat est passé via navigation state pour afficher le bandeau sticky
// post-création sur /staffing/$id.
import { useState, forwardRef, useCallback } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, ChevronDown, Wand2, Settings, Loader2, AlertTriangle } from "lucide-react";
import { format, addDays, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
import { listFabObjetsForWizard } from "@/server/staffing-plan-create.functions";
import { createPlanExpress } from "@/server/staffing-express.functions";
import { useWizardPrefetch } from "@/hooks/use-wizard-prefetch";

interface Props {
  affaireId: string;
  /** Date de montage de l'affaire — pour calculer la livraison fab par défaut */
  dateMontage?: string | null;
  /** Callback "Configurer manuellement…" : ouvre le wizard existant */
  onConfigurer: () => void;
  /** Disabled si typologie ≠ fabrication */
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
      // ignore parse error
    }
  }
  return format(addDays(new Date(), 30), "yyyy-MM-dd");
}

/** Estimation date début : livraison − ⌈totalH/40 × 1.3⌉ jours calendaires (simple, safe) */
function estimateDateDebut(dateFinIso: string, totalH: number): string {
  const weeks = Math.ceil((totalH / 40) * 1.3);
  const days = Math.max(7, weeks * 7); // au moins 1 semaine
  return format(addDays(parseISO(dateFinIso), -days), "yyyy-MM-dd");
}

export function MettreAuPlanningExpressButton({
  affaireId,
  dateMontage,
  onConfigurer,
  disabled,
}: Props) {
  const navigate = useNavigate();
  const expressFn = useServerFn(createPlanExpress);
  const listFn = useServerFn(listFabObjetsForWizard);
  const { prefetch } = useWizardPrefetch(affaireId);
  const [running, setRunning] = useState(false);
  const [warnEmpty, setWarnEmpty] = useState<{ open: boolean; reason: string }>({
    open: false,
    reason: "",
  });

  const runExpress = useCallback(async () => {
    setRunning(true);
    try {
      // 1. Récupère les objets éligibles (exclut ceux dans un plan actif)
      const all = await listFn({ data: { affaire_id: affaireId } });
      const eligibles = all.filter((o) => !o.dans_plan_actif);

      if (eligibles.length === 0) {
        const reason =
          all.length === 0
            ? "Cette affaire n'a aucun objet de fabrication. Importez d'abord un devis."
            : "Tous les objets de fabrication sont déjà dans un plan actif. Utilisez « Configurer manuellement » pour archiver l'existant.";
        setWarnEmpty({ open: true, reason });
        return;
      }

      // 2. Calcule dates par défaut
      const dateFin = defaultDateFin(dateMontage);
      const totalH = eligibles.reduce((s, o) => s + o.heures_total, 0);
      let dateDebut = estimateDateDebut(dateFin, totalH);
      const today = todayISO();
      if (dateDebut < today) dateDebut = today;
      if (dateDebut > dateFin) {
        // Cas dégradé : livraison trop proche → débute aujourd'hui
        dateDebut = today;
      }

      // 3. Lance l'express
      const toastId = toast.loading(
        `Express : création + staffing de ${eligibles.length} objet(s)…`,
      );
      const res = await expressFn({
        data: {
          affaire_id: affaireId,
          date_debut_fab: dateDebut,
          date_fin_fab: dateFin,
          objet_ids: eligibles.map((o) => o.id),
          auto_publish: true,
        },
      });

      toast.dismiss(toastId);
      const sec = (res.duration_ms / 1000).toFixed(1);
      if (res.published) {
        toast.success(
          `Plan publié en ${sec}s — ${res.filled_total} créneaux affectés`,
          { duration: 5000 },
        );
      } else {
        toast.success(
          `Plan créé en ${sec}s — à relire (${res.publish_reason_skipped ?? "vérifications nécessaires"})`,
          { duration: 6000 },
        );
      }

      // 4. Navigate vers le plan, encode résultat dans search pour le bandeau
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
        } as never,
      });
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Erreur Express. Essayez « Configurer manuellement ».",
        { duration: 7000 },
      );
    } finally {
      setRunning(false);
    }
  }, [affaireId, dateMontage, expressFn, listFn, navigate]);

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
          title="Création + staffing + publication en 1 clic (si aucun conflit)"
        >
          {running ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Wand2 className="mr-2 h-4 w-4" />
          )}
          Mettre au planning
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
          <DropdownMenuContent align="end">
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
