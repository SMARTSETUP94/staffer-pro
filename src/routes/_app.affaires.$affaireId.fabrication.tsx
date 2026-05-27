import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Plus, Upload, MoreVertical, Pencil, Truck, Send, ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import { useCapability } from "@/hooks/use-capability";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  useFabricationObjets,
  useProfilesWithRoles,
  calcAvancementAffaire,
  ETAPE_LABELS,
  ETAPES_ORDER,
  STATUT_ICONS,
  STATUT_LABELS,
  type FabricationEtape,
  type FabricationObjet,
} from "@/hooks/use-fabrication";
import { AjouterObjetDialog } from "@/components/fabrication/AjouterObjetDialog";
import { EditerObjetDialog } from "@/components/fabrication/EditerObjetDialog";
import { EtapeDialog } from "@/components/fabrication/EtapeDialog";
import { StafferVehiculeInterneDialog } from "@/components/fabrication/StafferVehiculeInterneDialog";
import { ObjetCardMobile } from "@/components/fabrication/ObjetCardMobile";
import { TrajetDialog } from "@/components/flotte/TrajetDialog";
import { useLieux } from "@/hooks/use-lieux";
import { addDays, format as fmt } from "date-fns";
import { StaffingPlanWizard } from "@/components/staffing/StaffingPlanWizard";
import { MettreAuPlanningExpressButton } from "@/components/staffing/MettreAuPlanningExpressButton";
import { useVocab } from "@/hooks/use-vocab";

export const Route = createFileRoute("/_app/affaires/$affaireId/fabrication")({
  head: () => ({ meta: [{ title: "Fabrication — Setup Paris" }] }),
  component: FabricationPage,
});

function FabricationPage() {
  const { affaireId } = Route.useParams();
  // L3b1-A — Refacto rôles → capabilities.
  // - canEditFab : pilote tous les contrôles d'édition (select chef projet,
  //   ajouter/éditer objet & étapes, bandeau "prête à livrer", wizard staffing
  //   express, dropdowns Modifier). Mappé sur casting.edit_phase_fabrication
  //   conformément au plan L3b1 §2 (les rôles ayant ce droit sont exactement
  //   ceux qui pilotent la production atelier).
  // - canSeeAdminHint : libellé "Admin : peut tout modifier" en pied de page →
  //   section.admin (info contextuelle réservée admin, pas une action).
  const canEditFab = useCapability("casting.edit_phase_fabrication");
  const canSeeAdminHint = useCapability("section.admin");
  const vocab = useVocab();
  // Lot 8.2b — Lien temporaire vers la Fiche Objet (sera remplacé en 8.5 par un lien intégré natif).
  const ficheFlagOn = useFeatureFlag("fiche_objet_v1");
  const canViewFiche = useCapability("objet.view");
  const showFicheLink = ficheFlagOn && canViewFiche;
  const { objets, loading, reload } = useFabricationObjets(affaireId);
  const { profiles } = useProfilesWithRoles();
  const [openAjouter, setOpenAjouter] = useState(false);
  const [editObjet, setEditObjet] = useState<FabricationObjet | null>(null);
  const [editEtape, setEditEtape] = useState<{ objet: FabricationObjet; etape: FabricationEtape } | null>(null);
  const [chefProjetId, setChefProjetId] = useState<string | null>(null);
  const [savingChef, setSavingChef] = useState(false);
  const [affaireMeta, setAffaireMeta] = useState<{
    numero: string;
    nom: string;
    lieu: string | null;
    date_montage: string | null;
    date_demontage: string | null;
    typologie: string | null;
  } | null>(null);
  const [openStaffer, setOpenStaffer] = useState(false);
  const [openSousTraiter, setOpenSousTraiter] = useState(false);
  const { atelier } = useLieux();

  // Vue par défaut : tableur dense (matrice objets × étapes), persistée en localStorage
  const [viewMode, setViewMode] = useState<"tableur" | "cards">(() => {
    if (typeof window === "undefined") return "tableur";
    const v = window.localStorage.getItem("fabrication-view-mode");
    return v === "cards" ? "cards" : "tableur";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("fabrication-view-mode", viewMode);
  }, [viewMode]);
  // Filtre statut global appliqué uniquement à la vue tableur
  const [statutFilter, setStatutFilter] = useState<"all" | "a_faire" | "en_cours" | "termine">("all");
  const filteredObjets = (() => {
    if (statutFilter === "all") return objets;
    return objets.filter((o) =>
      o.etapes.some((e) => e.statut === statutFilter),
    );
  })();

  // Charger meta affaire (chef projet, lieu, dates, typologie) — useEffect, pas useState
  useEffect(() => {
    void supabase
      .from("affaires")
      .select("chef_projet_id, numero, nom, lieu, date_montage, date_demontage, typologie")
      .eq("id", affaireId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setChefProjetId((data.chef_projet_id as string | null) ?? null);
        setAffaireMeta({
          numero: data.numero as string,
          nom: data.nom as string,
          lieu: (data.lieu as string | null) ?? null,
          date_montage: (data.date_montage as string | null) ?? null,
          date_demontage: (data.date_demontage as string | null) ?? null,
          typologie: (data.typologie as string | null) ?? null,
        });
      });
  }, [affaireId]);

  const chefsProjet = profiles.filter((p) => p.est_chef_projet);
  const avancement = calcAvancementAffaire(objets);
  const totalEtapes = objets.flatMap((o) => o.etapes);
  const compteurs = {
    a_faire: totalEtapes.filter((e) => e.statut === "a_faire").length,
    en_cours: totalEtapes.filter((e) => e.statut === "en_cours").length,
    termine: totalEtapes.filter((e) => e.statut === "termine").length,
  };

  // v0.20 Bloc 7 — détection "prête à livrer" : toutes les étapes Manutention
  // de tous les objets non archivés sont termine ou non_applicable
  const objetsActifs = objets.filter((o) => !o.archive);
  const manutEtapes = objetsActifs.flatMap((o) =>
    o.etapes.filter((e) => e.type_etape === "manutention"),
  );
  const pretALivrer =
    objetsActifs.length > 0 &&
    manutEtapes.length > 0 &&
    manutEtapes.every((e) => e.statut === "termine" || e.statut === "non_applicable");

  const handleSetChefProjet = async (id: string) => {
    setSavingChef(true);
    const newId = id === "none" ? null : id;
    const { error } = await supabase.from("affaires").update({ chef_projet_id: newId }).eq("id", affaireId);
    setSavingChef(false);
    if (error) {
      toast.error("Modification impossible", { description: error.message });
      return;
    }
    setChefProjetId(newId);
    toast.success("Chef de projet mis à jour");
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Chef de projet
              </span>
              {canEditFab ? (
                <Select
                  value={chefProjetId ?? "none"}
                  onValueChange={handleSetChefProjet}
                  disabled={savingChef}
                >
                  <SelectTrigger className="h-8 w-64">
                    <SelectValue placeholder="Désigner un chef de projet" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Non désigné —</SelectItem>
                    {chefsProjet.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name || p.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-sm font-medium">
                  {chefsProjet.find((p) => p.id === chefProjetId)?.full_name ?? "Non désigné"}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Avancement global
              </span>
              <Progress value={avancement} className="h-2 max-w-xs flex-1" />
              <span className="text-sm font-semibold">{avancement}%</span>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">{objets.length} objet{objets.length > 1 ? "s" : ""}</Badge>
              <Badge variant="outline">⬜ {compteurs.a_faire} à faire</Badge>
              <Badge variant="outline">🔄 {compteurs.en_cours} en cours</Badge>
              <Badge variant="outline">✅ {compteurs.termine} terminés</Badge>
            </div>
          </div>
          {canEditFab && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={() => setOpenAjouter(true)} className="rounded-xl">
                <Plus className="mr-1 h-4 w-4" /> Ajouter un objet
              </Button>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button variant="outline" disabled className="rounded-xl">
                        <Upload className="mr-1 h-4 w-4" /> Importer depuis devis
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Disponible en v0.20.1 (parser à étendre)</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
        </div>
      </div>

      {/* v0.20 Bloc 7 — Bandeau "prête à livrer" */}
      {pretALivrer && canEditFab && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              ✅ Affaire prête à livrer — toutes les étapes manutention sont terminées.
            </p>
            <div className="flex flex-shrink-0 gap-2">
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl"
                onClick={() => setOpenStaffer(true)}
              >
                <Truck className="mr-1 h-3 w-3" /> Staffer véhicule interne
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl"
                onClick={() => setOpenSousTraiter(true)}
              >
                <Send className="mr-1 h-3 w-3" /> Demander trajet sous-traité
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* v0.35.4 — Wizard / v0.35.11 — Express en option principale */}
      {canEditFab &&
        affaireMeta?.typologie === "fabrication" && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {vocab.autoRemplirFabrication}
                </p>
                <p className="text-xs text-muted-foreground">
                  Express : 1 clic pour créer + staffer + publier (si aucun conflit). Sinon utilisez le wizard ci-dessous.
                </p>
              </div>
              <MettreAuPlanningExpressButton
                affaireId={affaireId}
                dateMontage={affaireMeta?.date_montage ?? null}
                onConfigurer={() => {
                  // Wizard inline déjà visible : on scroll dessus
                  document
                    .getElementById("staffing-wizard-inline")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              />
            </div>
            <details id="staffing-wizard-inline" className="group">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground select-none">
                ▸ Configurer manuellement (wizard détaillé)
              </summary>
              <div className="mt-3">
                <StaffingPlanWizard
                  affaireId={affaireId}
                  defaultDateFin={affaireMeta.date_montage}
                />
              </div>
            </details>
          </div>
        )}

      {/* Tableau */}
      {objets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Aucun objet de fabrication pour cette affaire.
          </p>
          {canEditFab && (
            <Button onClick={() => setOpenAjouter(true)} variant="outline" className="mt-4 rounded-xl">
              <Plus className="mr-1 h-4 w-4" /> Créer le premier objet
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Barre de bascule vue + filtre statut */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-xl border border-border bg-card p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setViewMode("tableur")}
                className={`px-3 py-1.5 rounded-lg transition-colors ${viewMode === "tableur" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Tableur
              </button>
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                className={`px-3 py-1.5 rounded-lg transition-colors ${viewMode === "cards" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Cards
              </button>
            </div>
            {viewMode === "tableur" && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Filtre statut</span>
                <Select value={statutFilter} onValueChange={(v) => setStatutFilter(v as typeof statutFilter)}>
                  <SelectTrigger className="h-8 w-[160px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les objets</SelectItem>
                    <SelectItem value="en_cours">Au moins 1 en cours</SelectItem>
                    <SelectItem value="a_faire">Au moins 1 à faire</SelectItem>
                    <SelectItem value="termine">Au moins 1 terminé</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {filteredObjets.length}/{objets.length}
                </span>
              </div>
            )}
          </div>

          {/* Vue cards — Bloc 4 v0.20 */}
          {viewMode === "cards" && (
            <div className="space-y-3">
              {objets.map((o) => (
                <ObjetCardMobile
                  key={o.id}
                  objet={o}
                  isAdminOrChef={canEditFab}
                  affaireIdForFiche={showFicheLink ? affaireId : null}
                  onEditObjet={(obj) => setEditObjet(obj)}
                  onEditEtape={(obj, etape) => setEditEtape({ objet: obj, etape })}
                />
              ))}
            </div>
          )}

          {/* Vue tableur dense (matrice objets × étapes) */}
          {viewMode === "tableur" && (
          <div className="rounded-xl border border-border bg-card overflow-x-auto">
            <TooltipProvider delayDuration={150}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Objet</TableHead>
                  <TableHead className="w-10 text-center">Qté</TableHead>
                  {ETAPES_ORDER.map((t) => (
                    <TableHead key={t} className="w-32 text-center">
                      {ETAPE_LABELS[t]}
                    </TableHead>
                  ))}
                  {showFicheLink && <TableHead className="w-20 text-center">Détail</TableHead>}
                  {canEditFab && <TableHead className="w-12"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredObjets.map((o) => (
                  <TableRow key={o.id} data-objet-id={o.id}>


                    <TableCell className="font-medium">
                      <InlineNomEdit
                        objetId={o.id}
                        initialNom={o.nom}
                        canEdit={canEditFab}
                        onSaved={reload}
                      />
                    </TableCell>
                    <TableCell className="text-center">{o.quantite}</TableCell>
                    {ETAPES_ORDER.map((t) => {
                      const e = o.etapes.find((x) => x.type_etape === t);
                      if (!e) return <TableCell key={t} className="text-center text-muted-foreground">—</TableCell>;
                      return (
                        <TableCell key={t} className="text-center">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={() => canEditFab && setEditEtape({ objet: o, etape: e })}
                                disabled={!canEditFab}
                                className="flex w-full flex-col items-center gap-0.5 rounded-md p-1 text-xs transition-colors hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent"
                              >
                                <span className="text-base leading-none">{STATUT_ICONS[e.statut]}</span>
                                {e.assignee_name && e.statut === "termine" && (
                                  <span className="text-[10px] text-muted-foreground">
                                    {e.assignee_name}
                                    {e.date_fin && (
                                      <> · {new Date(e.date_fin).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}</>
                                    )}
                                  </span>
                                )}
                                {e.assignee_name && e.statut === "en_cours" && (
                                  <span className="text-[10px] text-muted-foreground">{e.assignee_name}</span>
                                )}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              <div className="space-y-0.5">
                                <div className="font-semibold">{ETAPE_LABELS[t]} — {STATUT_LABELS[e.statut]}</div>
                                <div>Responsable pôle : {e.assignee_name ?? "—"}</div>
                                <div>Respo Fab objet : {o.respo_fab_name ?? "—"}</div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                      );
                    })}
                    {showFicheLink && (
                      <TableCell className="text-center">
                        <Button asChild variant="outline" size="sm" className="h-7 gap-1 px-2">
                          <Link
                            to="/affaires/$affaireId/objets/$objetId"
                            params={{ affaireId, objetId: o.id }}
                            data-testid="objet-fiche-link"
                            data-objet-id={o.id}
                            title="Voir la fiche objet"
                          >
                            <ExternalLink className="h-3 w-3" />
                            <span className="text-xs">Fiche</span>
                          </Link>
                        </Button>
                      </TableCell>
                    )}

                    {canEditFab && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditObjet(o)}>
                              <Pencil className="mr-2 h-4 w-4" /> Modifier l'objet
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </TooltipProvider>
          </div>
          )}
        </>
      )}

      <p className="text-xs text-muted-foreground">
        Légende : ⬜ À faire · 🔄 En cours · ✅ Terminé · — Non applicable
        {!canEditFab && " · Lecture seule (consultation)"}
        {canSeeAdminHint && " · Admin : peut tout modifier"}
      </p>

      <AjouterObjetDialog
        affaireId={affaireId}
        open={openAjouter}
        onOpenChange={setOpenAjouter}
        onCreated={reload}
      />

      {editObjet && (
        <EditerObjetDialog
          objet={editObjet}
          open={!!editObjet}
          onOpenChange={(o) => !o && setEditObjet(null)}
          onSaved={reload}
        />
      )}

      {editEtape && (
        <EtapeDialog
          objet={editEtape.objet}
          etape={editEtape.etape}
          open={!!editEtape}
          onOpenChange={(o) => !o && setEditEtape(null)}
          onSaved={reload}
        />
      )}

      {affaireMeta && (
        <StafferVehiculeInterneDialog
          open={openStaffer}
          onOpenChange={setOpenStaffer}
          affaireId={affaireId}
          affaireNumero={affaireMeta.numero}
          affaireNom={affaireMeta.nom}
          affaireLieu={affaireMeta.lieu}
          dateMontage={affaireMeta.date_montage}
          objetsCount={objetsActifs.length}
          onCreated={reload}
        />
      )}

      {/* v0.20.1 Phase 1 — Modale "Demander trajet sous-traité" pré-remplie */}
      {affaireMeta && openSousTraiter && (
        <TrajetDialog
          open={openSousTraiter}
          onOpenChange={setOpenSousTraiter}
          trajet={null}
          defaultDate={
            affaireMeta.date_montage
              ? fmt(addDays(new Date(affaireMeta.date_montage), -1), "yyyy-MM-dd")
              : undefined
          }
          defaultVehiculeId={null}
          defaultAdresseDepart={atelier?.adresse_complete ?? ""}
          defaultAdresseArrivee={affaireMeta.lieu ?? ""}
          defaultCategorie="pose"
          defaultAffaireId={affaireId}
          affaires={[{ id: affaireId, numero: affaireMeta.numero, nom: affaireMeta.nom }]}
          employesLivreurs={[]}
          onSaved={() => {
            setOpenSousTraiter(false);
            toast.success("Demande de trajet sous-traité créée");
          }}
        />
      )}
    </div>
  );
}

function InlineNomEdit({
  objetId,
  initialNom,
  canEdit,
  onSaved,
}: {
  objetId: string;
  initialNom: string;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(initialNom);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setValue(initialNom);
  }, [initialNom]);

  if (!canEdit) {
    return <span>{initialNom}</span>;
  }

  const commit = async () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === initialNom) {
      setValue(initialNom);
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("fabrication_objets")
      .update({ nom: trimmed })
      .eq("id", objetId);
    setSaving(false);
    if (error) {
      toast.error("Modification impossible", { description: error.message });
      setValue(initialNom);
      return;
    }
    toast.success("Nom mis à jour");
    onSaved();
  };

  return (
    <Input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          setValue(initialNom);
          e.currentTarget.blur();
        }
      }}
      disabled={saving}
      className="h-7 border-transparent bg-transparent px-1 text-sm font-medium shadow-none hover:border-input focus-visible:border-input"
    />
  );
}
