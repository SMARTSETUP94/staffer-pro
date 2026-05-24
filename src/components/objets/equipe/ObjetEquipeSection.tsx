/**
 * Lot 8.3a/b — Zone Équipe.
 *
 * 8.3a (lecture) : KPIs par métier, chips employés assignés.
 * 8.3b (mutations) : Auto-remplir / + Personne / Retirer (cap `objet.team.manage`).
 *
 * Les boutons ne sont rendus actifs que si la cap est présente ET qu'un plan
 * publié couvre l'objet. Sinon ils sont disabled avec tooltip explicatif.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus, Wand2, AlertTriangle, Check, Info, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getObjetEquipe } from "@/server/objet-equipe.functions";
import { autoStaffObjet } from "@/server/objet-equipe-mutations.functions";
import { useCapability } from "@/hooks/use-capability";
import { AddPersonneDialog } from "./AddPersonneDialog";
import { RemovePersonneDialog } from "./RemovePersonneDialog";

interface Props {
  objetId: string;
}

interface AddDialogState {
  open: boolean;
  metierId: number;
  metierLabel: string;
}

interface RemoveDialogState {
  open: boolean;
  metierId: number;
  metierLabel: string;
  employeId: string;
  employeLabel: string;
}

export function ObjetEquipeSection({ objetId }: Props) {
  const fetchEquipe = useServerFn(getObjetEquipe);
  const autoStaffFn = useServerFn(autoStaffObjet);
  const canManage = useCapability("objet.team.manage");
  const qc = useQueryClient();

  const [addDialog, setAddDialog] = useState<AddDialogState>({
    open: false,
    metierId: 0,
    metierLabel: "",
  });
  const [removeDialog, setRemoveDialog] = useState<RemoveDialogState>({
    open: false,
    metierId: 0,
    metierLabel: "",
    employeId: "",
    employeLabel: "",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["objet-equipe", objetId],
    queryFn: () => fetchEquipe({ data: { objetId } }),
    staleTime: 30_000,
  });

  const autoStaffMutation = useMutation({
    mutationFn: () => autoStaffFn({ data: { objetId } }),
    onSuccess: (res) => {
      if (res.status === "no_plan") {
        toast.error("Aucun plan publié sur cet objet.");
        return;
      }
      if (res.status === "all_full") {
        toast.info("Tous les besoins sont déjà couverts.");
        return;
      }
      const skipMsg = res.skipped > 0 ? ` · ${res.skipped} restant(s) non comblé(s)` : "";
      toast.success(`${res.filled} affectation(s) ajoutée(s)${skipMsg}`);
      qc.invalidateQueries({ queryKey: ["objet-equipe", objetId] });
      qc.invalidateQueries({ queryKey: ["fiche-objet", objetId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hasPublishedPlan = data?.plan_status === "published";
  const mutationsEnabled = Boolean(canManage && hasPublishedPlan);
  const disabledReason = !canManage
    ? "Capability `objet.team.manage` requise"
    : !hasPublishedPlan
      ? "Nécessite un plan publié"
      : "";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <div className="min-w-0">
          <CardTitle className="text-base">Équipe affectée</CardTitle>
          {data && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {data.plan_status === "published" && data.window && (
                <>
                  Plan publié · fenêtre {fmtDate(data.window.start)} →{" "}
                  {fmtDate(data.window.end)}
                </>
              )}
              {data.plan_status === "draft" && data.window && (
                <>
                  Plan brouillon · fenêtre {fmtDate(data.window.start)} →{" "}
                  {fmtDate(data.window.end)}
                </>
              )}
              {data.plan_status === "no_plan" && (
                <>Aucun plan publié — équipe dérivée du devis</>
              )}
            </p>
          )}
        </div>
        {canManage && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!mutationsEnabled || autoStaffMutation.isPending}
                    onClick={() => autoStaffMutation.mutate()}
                    className="gap-1.5"
                    data-testid="objet-equipe-autostaff"
                  >
                    {autoStaffMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Wand2 className="h-3.5 w-3.5" />
                    )}
                    Auto-remplir
                  </Button>
                </span>
              </TooltipTrigger>
              {!mutationsEnabled && (
                <TooltipContent>{disabledReason}</TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && (
          <>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </>
        )}
        {!isLoading && data && data.metiers.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Aucun métier requis pour cet objet.
          </p>
        )}
        {!isLoading &&
          data?.metiers.map((row) => {
            const personsAssigned = row.assignations.length;
            const heuresPct =
              row.heures_devis > 0
                ? Math.round((row.heures_staffees / row.heures_devis) * 100)
                : 0;
            let statusBadge: { icon: typeof Check; tone: string; label: string };
            if (row.pers_requis === 0) {
              statusBadge = { icon: Info, tone: "text-muted-foreground", label: "—" };
            } else if (personsAssigned === 0) {
              statusBadge = {
                icon: AlertTriangle,
                tone: "text-amber-600",
                label: `${row.pers_requis} manque${row.pers_requis > 1 ? "s" : ""}`,
              };
            } else if (personsAssigned < row.pers_requis) {
              statusBadge = {
                icon: AlertTriangle,
                tone: "text-amber-600",
                label: `${row.pers_requis - personsAssigned} manque${row.pers_requis - personsAssigned > 1 ? "s" : ""}`,
              };
            } else if (heuresPct > 115) {
              statusBadge = { icon: Info, tone: "text-blue-600", label: "Sur-staffé" };
            } else {
              statusBadge = { icon: Check, tone: "text-emerald-600", label: "OK" };
            }
            const Icon = statusBadge.icon;

            return (
              <div
                key={row.metier_id}
                className="rounded-md border border-border bg-card/50 p-3"
                data-testid={`equipe-metier-${row.metier_key}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-medium">
                      {row.metier_label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {personsAssigned}/{row.pers_requis || "—"} pers ·{" "}
                      {fmtHeures(row.heures_staffees)}/{fmtHeures(row.heures_devis)} h
                    </span>
                  </div>
                  <span className={`flex items-center gap-1 text-xs ${statusBadge.tone}`}>
                    <Icon className="h-3.5 w-3.5" />
                    {statusBadge.label}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {row.assignations.length === 0 && (
                    <span className="text-xs italic text-muted-foreground">
                      Aucun assigné
                    </span>
                  )}
                  {row.assignations.map((a) => {
                    const label = `${a.prenom} ${a.nom.charAt(0)}.`;
                    return (
                      <Badge
                        key={a.employe_id}
                        variant="secondary"
                        className="gap-1 pr-1 font-normal"
                      >
                        {label}
                        <span className="text-[10px] text-muted-foreground">
                          {a.jours_count}j
                        </span>
                        {mutationsEnabled && (
                          <button
                            type="button"
                            onClick={() =>
                              setRemoveDialog({
                                open: true,
                                metierId: row.metier_id,
                                metierLabel: row.metier_label,
                                employeId: a.employe_id,
                                employeLabel: `${a.prenom} ${a.nom}`,
                              })
                            }
                            className="ml-0.5 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            aria-label={`Retirer ${label}`}
                            data-testid={`equipe-remove-${row.metier_key}-${a.employe_id}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </Badge>
                    );
                  })}
                  {canManage && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={!mutationsEnabled}
                              onClick={() =>
                                setAddDialog({
                                  open: true,
                                  metierId: row.metier_id,
                                  metierLabel: row.metier_label,
                                })
                              }
                              className="h-6 gap-1 px-2 text-xs"
                              data-testid={`equipe-add-${row.metier_key}`}
                            >
                              <Plus className="h-3 w-3" />
                              Personne
                            </Button>
                          </span>
                        </TooltipTrigger>
                        {!mutationsEnabled && (
                          <TooltipContent>{disabledReason}</TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </div>
            );
          })}
      </CardContent>

      {addDialog.open && (
        <AddPersonneDialog
          open={addDialog.open}
          onOpenChange={(o) => setAddDialog((s) => ({ ...s, open: o }))}
          objetId={objetId}
          metierId={addDialog.metierId}
          metierLabel={addDialog.metierLabel}
        />
      )}
      {removeDialog.open && (
        <RemovePersonneDialog
          open={removeDialog.open}
          onOpenChange={(o) => setRemoveDialog((s) => ({ ...s, open: o }))}
          objetId={objetId}
          metierId={removeDialog.metierId}
          metierLabel={removeDialog.metierLabel}
          employeId={removeDialog.employeId}
          employeLabel={removeDialog.employeLabel}
        />
      )}
    </Card>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

function fmtHeures(h: number): string {
  return h % 1 === 0 ? String(h) : h.toFixed(1);
}
