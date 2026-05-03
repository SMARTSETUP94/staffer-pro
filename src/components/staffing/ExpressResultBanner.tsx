// v0.35.11 / Sprint Express — Bandeau sticky post-création Express
// v0.35.12 — H: dédup Props, F: bouton "Annuler ce plan" (10 min, draft, self), badge weekend.
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  AlertTriangle,
  Send,
  ListChecks,
  X,
  Sparkles,
  Trash2,
  CalendarRange,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { publishStaffingPlan } from "@/server/staffing-publish.functions";
import { cancelExpressPlan } from "@/server/staffing-express-cancel.functions";

interface Props {
  planId: string;
  affaireId?: string | null;
  published: boolean;
  filled: number;
  unfilled: number;
  alertesCritiques: number;
  reason: string;
  /** Optionnel — info contexte */
  joursOuvres?: number;
  delaiCourt?: boolean;
  includeWeekends?: boolean;
  onDismiss: () => void;
  onPublished: () => void;
}

export function ExpressResultBanner({
  planId,
  affaireId,
  published,
  filled,
  unfilled,
  alertesCritiques,
  reason,
  joursOuvres,
  delaiCourt,
  includeWeekends,
  onDismiss,
  onPublished,
}: Props) {
  const publishFn = useServerFn(publishStaffingPlan);
  const cancelFn = useServerFn(cancelExpressPlan);
  const navigate = useNavigate();
  const [publishing, setPublishing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const blocking = unfilled > 0 || alertesCritiques > 0;

  const handlePublish = async () => {
    setPublishing(true);
    try {
      await publishFn({ data: { planId } });
      toast.success("Plan publié — créneaux propagés au planning principal");
      onPublished();
      onDismiss();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Publication échouée");
    } finally {
      setPublishing(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await cancelFn({ data: { planId } });
      toast.success("Plan Express annulé");
      if (affaireId) {
        navigate({
          to: "/affaires/$affaireId/fabrication",
          params: { affaireId },
        });
      } else {
        onDismiss();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Annulation impossible");
      setCancelling(false);
    }
  };

  /* --------------- état Publié --------------- */
  if (published) {
    return (
      <div className="sticky top-0 z-30 mb-4 flex items-start justify-between gap-3 rounded-xl border border-emerald-500/40 bg-emerald-50 px-4 py-3 dark:bg-emerald-950/30">
        <div className="flex items-start gap-3 min-w-0">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 mt-0.5" />
          <div className="text-sm min-w-0">
            <p className="font-semibold text-emerald-900 dark:text-emerald-100">
              Plan créé, staffé et publié en Express
            </p>
            <p className="text-xs text-emerald-700 dark:text-emerald-300">
              {filled} créneau{filled > 1 ? "x" : ""} affecté{filled > 1 ? "s" : ""} —
              propagés vers le planning principal. Les employés sont notifiés.
            </p>
            {includeWeekends && (
              <Badge variant="outline" className="mt-1.5 bg-white/60 dark:bg-black/20 text-xs">
                <CalendarRange className="mr-1 h-3 w-3" /> Week-ends inclus
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            disabled={cancelling}
            className="text-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
            title="Annuler ce plan (10 min après création)"
          >
            <Trash2 className="mr-1 h-3 w-3" />
            {cancelling ? "Annulation…" : "Annuler"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            className="text-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  /* --------------- état Draft --------------- */
  return (
    <div className="sticky top-0 z-30 mb-4 rounded-xl border border-amber-500/40 bg-amber-50 px-4 py-3 dark:bg-amber-950/30">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <Sparkles className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
          <div className="text-sm min-w-0">
            <p className="font-semibold text-amber-900 dark:text-amber-100">
              Plan créé en Express — relecture nécessaire avant publication
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
              {reason || "Vérifications requises."}
            </p>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <Badge variant="outline" className="bg-white/60 dark:bg-black/20 text-xs">
                {filled} affecté{filled > 1 ? "s" : ""}
              </Badge>
              {unfilled > 0 && (
                <Badge variant="outline" className="bg-amber-100 dark:bg-amber-900/40 text-xs">
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  {unfilled} manquant{unfilled > 1 ? "s" : ""}
                </Badge>
              )}
              {alertesCritiques > 0 && (
                <Badge variant="outline" className="bg-rose-100 dark:bg-rose-900/40 text-xs">
                  {alertesCritiques} alerte{alertesCritiques > 1 ? "s" : ""} critique
                  {alertesCritiques > 1 ? "s" : ""}
                </Badge>
              )}
              {includeWeekends && (
                <Badge variant="outline" className="bg-white/60 dark:bg-black/20 text-xs">
                  <CalendarRange className="mr-1 h-3 w-3" /> Week-ends inclus
                </Badge>
              )}
              {delaiCourt && (
                <Badge variant="outline" className="bg-rose-100 dark:bg-rose-900/40 text-xs">
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  Délai très court ({joursOuvres ?? "?"}j ouvrés)
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCancel}
            disabled={cancelling}
            className="text-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/40"
            title="Annuler ce plan (10 min après création)"
          >
            <Trash2 className="mr-1 h-3 w-3" />
            {cancelling ? "Annulation…" : "Annuler"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              document
                .getElementById("gantt-interactif-section")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="bg-white dark:bg-card"
          >
            <ListChecks className="mr-1 h-3 w-3" /> Ajuster
          </Button>
          <Button
            size="sm"
            variant="default"
            disabled={publishing || blocking}
            onClick={handlePublish}
            title={blocking ? "Résolvez les conflits avant publication" : "Publier vers le planning principal"}
          >
            <Send className="mr-1 h-3 w-3" />
            {publishing ? "Publication…" : "Publier quand même"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
