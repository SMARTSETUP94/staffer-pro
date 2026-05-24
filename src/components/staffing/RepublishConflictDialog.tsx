/**
 * Sprint C / C2 — Dialog de republication d'un plan déjà publié.
 *
 * Stratégies (copy verrouillée dans mem://features/republish-dialog-copy) :
 *   A — auto    : écrase toutes les modifications manuelles
 *   B — merge   : ajoute uniquement ce qui manque, conserve les manuelles
 *   C — manual  : enregistre la stratégie sans toucher aux équipes manuelles
 *
 * Stratégie suggérée par seuil :
 *   - 0 overrides → A
 *   - 1–30%      → B
 *   - >30%       → C
 */
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  detectEquipeOverrides,
  publishStaffingPlanV2,
  type RepublishStrategy,
} from "@/server/staffing-publish.functions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: string;
  onSuccess?: () => void;
}

const OPTIONS: Array<{
  value: RepublishStrategy;
  title: string;
  desc: string;
  cta: string;
}> = [
  {
    value: "auto",
    title: "A — Republier complètement",
    desc: "Le plan publié écrase toutes les modifications manuelles. Choix recommandé si le plan a été retravaillé en profondeur.",
    cta: "Republier en écrasant",
  },
  {
    value: "merge",
    title: "B — Republier en mode fusion",
    desc: "Le plan ajoute uniquement ce qui manque, vos modifications manuelles sont conservées. Choix recommandé pour la plupart des cas.",
    cta: "Republier en mode fusion",
  },
  {
    value: "manual",
    title: "C — Republier sans appliquer",
    desc: "Le plan est enregistré mais vos modifications manuelles restent prioritaires. Choix recommandé si vous voulez garder votre staffing actuel intact.",
    cta: "Enregistrer sans appliquer",
  },
];

export function RepublishConflictDialog({ open, onOpenChange, planId, onSuccess }: Props) {
  const qc = useQueryClient();
  const detectFn = useServerFn(detectEquipeOverrides);
  const publishFn = useServerFn(publishStaffingPlanV2);

  const { data: report, isLoading } = useQuery({
    queryKey: ["equipe-overrides", planId],
    queryFn: () => detectFn({ data: { planId } }),
    enabled: open,
    staleTime: 5_000,
  });

  const [strategy, setStrategy] = useState<RepublishStrategy>("auto");

  // Défaut suggéré dès qu'on a le rapport
  useEffect(() => {
    if (report?.suggested_strategy) {
      setStrategy(report.suggested_strategy);
    }
  }, [report?.suggested_strategy]);

  const mutation = useMutation({
    mutationFn: () => publishFn({ data: { planId, mergeStrategy: strategy } }),
    onSuccess: (res) => {
      toast.success(
        `Republié (${res.strategy}) — ${res.equipes_n2} N2, ${res.equipes_n3} N3, ${report?.overrides ?? 0} override(s) gérés.`,
      );
      qc.invalidateQueries({ queryKey: ["casting-chantier"] });
      qc.invalidateQueries({ queryKey: ["objet-equipe"] });
      qc.invalidateQueries({ queryKey: ["equipe-overrides", planId] });
      onSuccess?.();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const recommended = report?.suggested_strategy ?? "auto";
  const currentOption = OPTIONS.find((o) => o.value === strategy)!;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Republier le plan de fabrication</DialogTitle>
          <DialogDescription>
            Vous avez modifié manuellement le casting depuis la dernière publication.
            Comment voulez-vous combiner ces deux versions&nbsp;?
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <RadioGroup
              value={strategy}
              onValueChange={(v) => setStrategy(v as RepublishStrategy)}
              className="gap-3"
            >
              {OPTIONS.map((opt) => {
                const isRecommended = opt.value === recommended;
                const selected = opt.value === strategy;
                return (
                  <label
                    key={opt.value}
                    htmlFor={`strat-${opt.value}`}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                      selected
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    <RadioGroupItem
                      value={opt.value}
                      id={`strat-${opt.value}`}
                      className="mt-1"
                    />
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {opt.title}
                        </span>
                        {isRecommended && (
                          <Badge
                            variant="outline"
                            className="border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-300"
                          >
                            Recommandé
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{opt.desc}</p>
                    </div>
                  </label>
                );
              })}
            </RadioGroup>

            {report && (
              <div className="mt-3 flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>
                  <span className="font-mono font-semibold text-foreground">
                    {report.overrides}
                  </span>{" "}
                  modification(s) manuelle(s) détectée(s) sur{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {report.total_slots}
                  </span>{" "}
                  slot(s) ({report.ratio}%).
                </span>
              </div>
            )}
          </>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Annuler
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || isLoading}
            data-testid="republish-confirm"
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {currentOption.cta}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
