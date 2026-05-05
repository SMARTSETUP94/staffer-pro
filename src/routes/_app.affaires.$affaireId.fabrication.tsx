import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Plus, Upload, MoreVertical, Pencil, Truck, Send } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  calcAvancementObjet,
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

export const Route = createFileRoute("/_app/affaires/$affaireId/fabrication")({
  head: () => ({ meta: [{ title: "Fabrication — Setup Paris" }] }),
  component: FabricationPage,
});

function FabricationPage() {
  const { affaireId } = Route.useParams();
  const { isAdminOrChef, isAdmin } = useAuth();
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
              {isAdminOrChef ? (
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
          {isAdminOrChef && (
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
      {pretALivrer && isAdminOrChef && (
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
      {isAdminOrChef &&
        affaireMeta?.typologie === "fabrication" && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Auto-staffing fabrication
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
          {isAdminOrChef && (
            <Button onClick={() => setOpenAjouter(true)} variant="outline" className="mt-4 rounded-xl">
              <Plus className="mr-1 h-4 w-4" /> Créer le premier objet
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Vue cards mobile (<lg) — Bloc 4 v0.20 */}
          <div className="space-y-3 lg:hidden">
            {objets.map((o) => (
              <ObjetCardMobile
                key={o.id}
                objet={o}
                isAdminOrChef={isAdminOrChef}
                onEditObjet={(obj) => setEditObjet(obj)}
                onEditEtape={(obj, etape) => setEditEtape({ objet: obj, etape })}
              />
            ))}
          </div>

          {/* Vue tableau desktop (>=lg) */}
          <div className="hidden rounded-xl border border-border bg-card overflow-hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Réf</TableHead>
                  <TableHead>Objet</TableHead>
                  <TableHead className="w-16 text-center">Qté</TableHead>
                  <TableHead className="w-32">Respo Fab</TableHead>
                  {ETAPES_ORDER.map((t) => (
                    <TableHead key={t} className="w-32 text-center">
                      {ETAPE_LABELS[t]}
                    </TableHead>
                  ))}
                  <TableHead className="w-20 text-center">Avanc.</TableHead>
                  {isAdminOrChef && <TableHead className="w-12"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {objets.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs">{o.reference}</TableCell>
                    <TableCell className="font-medium">{o.nom}</TableCell>
                    <TableCell className="text-center">{o.quantite}</TableCell>
                    <TableCell className="text-xs">
                      {o.respo_fab_name ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    {ETAPES_ORDER.map((t) => {
                      const e = o.etapes.find((x) => x.type_etape === t);
                      if (!e) return <TableCell key={t} className="text-center text-muted-foreground">—</TableCell>;
                      return (
                        <TableCell key={t} className="text-center">
                          <button
                            type="button"
                            onClick={() => isAdminOrChef && setEditEtape({ objet: o, etape: e })}
                            disabled={!isAdminOrChef}
                            className="flex w-full flex-col items-center gap-0.5 rounded-md p-1 text-xs transition-colors hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent"
                            title={isAdminOrChef ? "Modifier l'étape" : STATUT_LABELS[e.statut]}
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
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-center text-xs font-semibold">
                      {calcAvancementObjet(o)}%
                    </TableCell>
                    {isAdminOrChef && (
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
          </div>
        </>
      )}

      <p className="text-xs text-muted-foreground">
        Légende : ⬜ À faire · 🔄 En cours · ✅ Terminé · — Non applicable
        {!isAdminOrChef && " · Lecture seule (consultation)"}
        {isAdmin && " · Admin : peut tout modifier"}
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
