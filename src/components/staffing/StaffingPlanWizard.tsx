// v0.35.4 / Sprint 4 — Wizard de création d'un plan de staffing
// Réutilisable depuis l'onglet Fabrication ET depuis le bouton Devis "Mettre au planning".
// Étapes :
//  1. Pré-rempli date_fin_fab depuis affaire.date_montage si dispo.
//  2. Liste cochable des fabrication_objets (corbeille = soft remove individuel).
//  3. Bouton "Calculer le planning" → createStaffingPlan() puis navigate /staffing/$id.
//  4. Si plan(s) actif(s) existant(s) : bandeau "Voir plan" (draft/published).
import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { format, parseISO, subDays } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarIcon, Loader2, Trash2, Calculator, ExternalLink, Sparkles, AlertTriangle, ArrowLeft, Wand2, CheckSquare, Square, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  listFabObjetsForWizard,
  getActivePlansForAffaire,
  createStaffingPlan,
} from "@/server/staffing-plan-create.functions";

interface Props {
  affaireId: string;
  defaultDateFin?: string | null; // affaire.date_montage (ISO yyyy-mm-dd)
  defaultDateDebut?: string | null;
  /** Mode dialog (compact, sans titre/badge externe) */
  compact?: boolean;
  /** Callback après création (ferme dialog par ex.) */
  onCreated?: (planId: string) => void;
}

interface DansPlanActif {
  plan_id: string;
  status: "draft" | "published";
  affaire_id: string;
  affaire_nom: string | null;
  affaire_numero: string | null;
  same_affaire: boolean;
  created_at: string;
  created_by: string | null;
}

interface ObjetRow {
  id: string;
  reference: string;
  nom: string;
  quantite: number;
  h_bois: number;
  heures_total: number;
  dans_plan_actif: DansPlanActif | null;
}

interface ExistingPlan {
  id: string;
  status: string;
  date_debut_fab: string;
  date_fin_fab: string;
  created_at: string;
  published_at: string | null;
}

export function StaffingPlanWizard({
  affaireId,
  defaultDateFin,
  defaultDateDebut,
  compact = false,
  onCreated,
}: Props) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [objets, setObjets] = useState<ObjetRow[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [included, setIncluded] = useState<Set<string>>(new Set());
  // v0.35.10 #2 — Dates intelligentes
  // - Si defaultDateFin (= date_montage) fourni : livraison fab = montage - 2j (marge logistique)
  // - dateDebut estimé après chargement objets (estimateStartDate)
  const initialDateFin = defaultDateFin
    ? subDays(parseISO(defaultDateFin), 2)
    : undefined;
  const [dateDebut, setDateDebut] = useState<Date | undefined>(
    defaultDateDebut ? parseISO(defaultDateDebut) : undefined,
  );
  const [dateFin, setDateFin] = useState<Date | undefined>(initialDateFin);
  const [hideShort, setHideShort] = useState(false);
  const [existingPlans, setExistingPlans] = useState<ExistingPlan[]>([]);
  const [creatingNew, setCreatingNew] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      listFabObjetsForWizard({ data: { affaire_id: affaireId } }),
      getActivePlansForAffaire({ data: { affaire_id: affaireId } }),
    ])
      .then(([objs, plans]) => {
        if (cancelled) return;
        setObjets(objs);
        // exclut par défaut les objets verrouillés (published)
        const eligibles = objs.filter(
          (o) => !(o.dans_plan_actif && o.dans_plan_actif.status === "published"),
        );
        setIncluded(new Set(eligibles.map((o) => o.id)));
        setExistingPlans(plans as ExistingPlan[]);

        // v0.35.10 #2 — estime dateDebut si non fourni : marche arrière depuis dateFin
        // Hypothèse simple : 8h/j × 5 personnes en moyenne → spanJ = totalH / 40
        // ajoute 30% marge sécu et arrondit à la semaine entière supérieure (multiple 5j ouvrés ≈ 7j cal).
        if (!defaultDateDebut && initialDateFin) {
          const totalH = eligibles.reduce((s, o) => s + o.heures_total, 0);
          if (totalH > 0) {
            const spanJ = Math.ceil(((totalH / 40) * 1.3) / 5) * 7;
            setDateDebut((prev) => prev ?? subDays(initialDateFin, spanJ));
          }
        }
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error("Chargement impossible", { description: String(err?.message ?? err) });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [affaireId]);

  /** Recalcule dateDebut estimé sur demande utilisateur. */
  const estimerDateDebut = () => {
    if (!dateFin) {
      toast.error("Renseignez d'abord la date de livraison.");
      return;
    }
    const totalH = visibleObjets
      .filter((o) => included.has(o.id))
      .reduce((s, o) => s + o.heures_total, 0);
    if (totalH <= 0) {
      toast.error("Sélectionnez au moins un objet pour estimer la durée.");
      return;
    }
    const spanJ = Math.ceil(((totalH / 40) * 1.3) / 5) * 7;
    const estimated = subDays(dateFin, spanJ);
    setDateDebut(estimated);
    toast.success(
      `Début estimé : ${format(estimated, "dd MMM yyyy", { locale: fr })} (~${spanJ}j calendaires)`,
    );
  };

  /** Sélection batch : toutes / aucune (hors verrouillés). */
  const selectAll = () => {
    setIncluded(new Set(visibleObjets.filter((o) => o.dans_plan_actif?.status !== "published").map((o) => o.id)));
  };
  const selectNone = () => {
    setIncluded(new Set());
  };
  /** Filtre : masque les objets < 5h. */
  const SHORT_THRESHOLD = 5;

  const visibleObjets = useMemo(
    () =>
      objets
        .filter((o) => !removed.has(o.id))
        .filter((o) => !hideShort || o.heures_total >= SHORT_THRESHOLD),
    [objets, removed, hideShort],
  );
  const hiddenShortCount = useMemo(
    () =>
      hideShort
        ? objets.filter((o) => !removed.has(o.id) && o.heures_total < SHORT_THRESHOLD).length
        : 0,
    [objets, removed, hideShort],
  );
  const includedCount = useMemo(
    () => visibleObjets.filter((o) => included.has(o.id)).length,
    [visibleObjets, included],
  );
  const totalHeures = useMemo(
    () =>
      visibleObjets
        .filter((o) => included.has(o.id))
        .reduce((s, o) => s + o.heures_total, 0),
    [visibleObjets, included],
  );

  const toggle = (o: ObjetRow) => {
    if (o.dans_plan_actif?.status === "published") {
      toast.error("Objet verrouillé", {
        description: `Déjà dans un plan publié${
          o.dans_plan_actif.affaire_numero ? ` (affaire ${o.dans_plan_actif.affaire_numero})` : ""
        }. Archivez le plan d'abord.`,
      });
      return;
    }
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(o.id)) {
        next.delete(o.id);
      } else {
        next.add(o.id);
        if (o.dans_plan_actif?.status === "draft") {
          const where = o.dans_plan_actif.same_affaire
            ? "le brouillon précédent"
            : `le brouillon de l'affaire ${o.dans_plan_actif.affaire_numero ?? "?"}`;
          toast.warning(`Cet objet sera retiré de ${where}.`);
        }
      }
      return next;
    });
  };

  const removeObjet = (id: string) => {
    setRemoved((prev) => new Set(prev).add(id));
    setIncluded((prev) => {
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
  };

  const handleCalculer = async (archiveExisting: boolean) => {
    if (!dateDebut || !dateFin) {
      toast.error("Renseignez les dates de début et de livraison.");
      return;
    }
    if (dateDebut > dateFin) {
      toast.error("La date de début doit précéder la livraison.");
      return;
    }
    const objetIds = visibleObjets
      .filter((o) => included.has(o.id))
      .map((o) => o.id);
    if (objetIds.length === 0) {
      toast.error("Sélectionnez au moins un objet à inclure.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await createStaffingPlan({
        data: {
          affaire_id: affaireId,
          date_debut_fab: format(dateDebut, "yyyy-MM-dd"),
          date_fin_fab: format(dateFin, "yyyy-MM-dd"),
          objet_ids: objetIds,
          archive_existing: archiveExisting,
        },
      });
      toast.success("Plan créé", {
        description: `${objetIds.length} objet${objetIds.length > 1 ? "s" : ""} inclus.`,
      });
      onCreated?.(res.plan_id);
      navigate({ to: "/staffing/$planId", params: { planId: res.plan_id } });
    } catch (err) {
      toast.error("Création impossible", { description: String((err as Error)?.message ?? err) });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-6">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  const hasExisting = existingPlans.length > 0;

  return (
    <div className="space-y-4">
      {!compact && (
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">Planning fabrication</h2>
              <Badge variant="secondary" className="gap-1">
                <Sparkles className="h-3 w-3" /> Auto-staffing v0.35
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Calcule un plan rétrograde depuis la livraison, par objet et métier.
            </p>
          </div>
        </div>
      )}

      {/* Plans existants */}
      {hasExisting && !creatingNew && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" />
            Plan{existingPlans.length > 1 ? "s" : ""} existant{existingPlans.length > 1 ? "s" : ""} pour cette affaire
          </div>
          <div className="space-y-1.5">
            {existingPlans.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-border bg-background/60 px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <Badge variant={p.status === "published" ? "default" : "outline"}>
                    {p.status === "published" ? "Publié" : "Brouillon"}
                  </Badge>
                  <span className="text-muted-foreground">
                    {format(parseISO(p.date_debut_fab), "dd MMM", { locale: fr })} →{" "}
                    {format(parseISO(p.date_fin_fab), "dd MMM yyyy", { locale: fr })}
                  </span>
                </div>
                <Button asChild variant="outline" size="sm" className="h-7 rounded-lg">
                  <Link to="/staffing/$planId" params={{ planId: p.id }}>
                    <ExternalLink className="mr-1 h-3 w-3" /> Voir le plan
                  </Link>
                </Button>
              </div>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setCreatingNew(true)}
          >
            Créer un nouveau plan (archive l'ancien)
          </Button>
        </div>
      )}

      {(!hasExisting || creatingNew) && (
        <>
          {/* Dates */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <DateField
                label="Début fabrication"
                value={dateDebut}
                onChange={setDateDebut}
                placeholder="Choisir une date"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-[11px] text-violet-600 hover:text-violet-700 hover:bg-violet-50"
                onClick={estimerDateDebut}
                disabled={!dateFin || includedCount === 0}
                title="Calcule un début rétrograde depuis la livraison selon les heures sélectionnées"
              >
                <Wand2 className="mr-1 h-3 w-3" /> Estimer auto
              </Button>
            </div>
            <DateField
              label="Livraison (HARD)"
              value={dateFin}
              onChange={(d) => {
                setDateFin(d);
                if (d && !dateDebut) {
                  // Re-déclenche estimation quand livraison change et début vide
                  const totalH = visibleObjets
                    .filter((o) => included.has(o.id))
                    .reduce((s, o) => s + o.heures_total, 0);
                  if (totalH > 0) {
                    const spanJ = Math.ceil(((totalH / 40) * 1.3) / 5) * 7;
                    setDateDebut(subDays(d, spanJ));
                  }
                }
              }}
              placeholder="Date de livraison"
            />
          </div>

          {/* Objets */}
          <div className="rounded-xl border border-border">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background/40 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Objets à planifier
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={selectAll}
                  title="Cocher tous les objets éligibles"
                >
                  <CheckSquare className="mr-1 h-3 w-3" /> Tout
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={selectNone}
                  title="Décocher tous les objets"
                >
                  <Square className="mr-1 h-3 w-3" /> Aucun
                </Button>
                <Button
                  type="button"
                  variant={hideShort ? "default" : "ghost"}
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => setHideShort((v) => !v)}
                  title={`Masquer les objets < ${SHORT_THRESHOLD}h`}
                >
                  <Filter className="mr-1 h-3 w-3" />
                  &lt; {SHORT_THRESHOLD}h
                  {hiddenShortCount > 0 && hideShort && (
                    <span className="ml-1 opacity-70">({hiddenShortCount})</span>
                  )}
                </Button>
              </div>
              <span className="text-xs text-muted-foreground">
                {includedCount} / {visibleObjets.length} inclus · {totalHeures.toFixed(1)} h
              </span>
            </div>
            {visibleObjets.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                Aucun objet de fabrication trouvé. Importez un devis ou ajoutez un objet
                manuellement avant de calculer le planning.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {visibleObjets.map((o) => {
                  const isOn = included.has(o.id);
                  const collision = o.dans_plan_actif;
                  const locked = collision?.status === "published";
                  return (
                    <li
                      key={o.id}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 text-sm",
                        !isOn && "opacity-60",
                        locked && "bg-muted/40",
                      )}
                    >
                      <Checkbox
                        checked={isOn}
                        disabled={locked}
                        onCheckedChange={() => toggle(o)}
                        id={`obj-${o.id}`}
                      />
                      <label
                        htmlFor={`obj-${o.id}`}
                        className={cn(
                          "flex flex-1 items-center gap-2 min-w-0",
                          locked ? "cursor-not-allowed" : "cursor-pointer",
                        )}
                      >
                        <span className="font-mono text-xs text-primary">{o.reference}</span>
                        <span className="truncate text-foreground">{o.nom}</span>
                        {o.quantite > 1 && (
                          <Badge variant="outline" className="h-5 text-[10px]">
                            ×{o.quantite}
                          </Badge>
                        )}
                        {collision && (
                          <Link
                            to="/staffing/$planId"
                            params={{ planId: collision.plan_id }}
                            onClick={(e) => e.stopPropagation()}
                            title={`Voir le plan ${collision.status === "published" ? "publié" : "brouillon"}`}
                          >
                            <Badge
                              variant={collision.status === "published" ? "default" : "secondary"}
                              className={cn(
                                "h-5 gap-1 text-[10px]",
                                collision.status === "published"
                                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                  : "",
                              )}
                            >
                              {collision.status === "published" ? "Publié" : "Brouillon"}
                              {!collision.same_affaire && collision.affaire_numero
                                ? ` · ${collision.affaire_numero}`
                                : ""}
                            </Badge>
                          </Link>
                        )}
                      </label>
                      <span className="hidden sm:inline text-xs text-muted-foreground">
                        {o.heures_total.toFixed(1)} h
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => removeObjet(o.id)}
                        title="Retirer de la sélection (réversible en rechargeant)"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* v0.35.x audit UX #3 — barre récap sticky toujours visible */}
          <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/95 px-3 py-2 shadow-md backdrop-blur">
            <Badge variant="outline" className="gap-1">
              <span className="font-mono">{includedCount}</span>
              <span className="text-muted-foreground">/ {visibleObjets.length} objets</span>
            </Badge>
            <Badge variant="outline" className="font-mono">
              {totalHeures.toFixed(1)} h
            </Badge>
            {dateDebut && dateFin && (
              <Badge variant="secondary" className="text-[10px]">
                {format(dateDebut, "dd MMM", { locale: fr })} → {format(dateFin, "dd MMM yyyy", { locale: fr })}
              </Badge>
            )}
            <div className="flex-1" />
            {hasExisting && creatingNew && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCreatingNew(false)}
                disabled={submitting}
                title="Revenir aux plans existants"
              >
                <ArrowLeft className="mr-1 h-3 w-3" />
                Précédent
              </Button>
            )}
            <Button
              onClick={() => handleCalculer(creatingNew && hasExisting)}
              disabled={submitting || includedCount === 0 || !dateDebut || !dateFin}
              className="rounded-xl"
            >
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Calculator className="mr-2 h-4 w-4" />
              )}
              Calculer le planning
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: Date | undefined;
  onChange: (d: Date | undefined) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal rounded-xl",
              !value && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value ? format(value, "PPP", { locale: fr }) : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            onSelect={onChange}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
