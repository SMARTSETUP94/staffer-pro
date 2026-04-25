import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Plus, Upload } from "lucide-react";
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
  STATUT_ICONS,
  STATUT_LABELS,
  type FabricationEtape,
  type FabricationObjet,
  type FabricationEtapeType,
} from "@/hooks/use-fabrication";
import { AjouterObjetDialog } from "@/components/fabrication/AjouterObjetDialog";
import { EtapeDialog } from "@/components/fabrication/EtapeDialog";

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
  const [editEtape, setEditEtape] = useState<{ objet: FabricationObjet; etape: FabricationEtape } | null>(null);
  const [chefProjetId, setChefProjetId] = useState<string | null>(null);
  const [savingChef, setSavingChef] = useState(false);

  // Charger chef_projet_id de l'affaire
  useState(() => {
    void supabase
      .from("affaires")
      .select("chef_projet_id")
      .eq("id", affaireId)
      .maybeSingle()
      .then(({ data }) => setChefProjetId((data?.chef_projet_id as string | null) ?? null));
  });

  const chefsProjet = profiles.filter((p) => p.est_chef_projet);
  const avancement = calcAvancementAffaire(objets);
  const totalEtapes = objets.flatMap((o) => o.etapes);
  const compteurs = {
    a_faire: totalEtapes.filter((e) => e.statut === "a_faire").length,
    en_cours: totalEtapes.filter((e) => e.statut === "en_cours").length,
    termine: totalEtapes.filter((e) => e.statut === "termine").length,
  };

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
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Réf</TableHead>
                <TableHead>Objet</TableHead>
                <TableHead className="w-16 text-center">Qté</TableHead>
                <TableHead className="w-32">Respo Fab</TableHead>
                {(["be", "respo_fab", "finition", "manutention"] as FabricationEtapeType[]).map((t) => (
                  <TableHead key={t} className="w-36 text-center">
                    {ETAPE_LABELS[t]}
                  </TableHead>
                ))}
                <TableHead className="w-20 text-center">Avanc.</TableHead>
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
                  {(["be", "respo_fab", "finition", "manutention"] as FabricationEtapeType[]).map((t) => {
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
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

      {editEtape && (
        <EtapeDialog
          objet={editEtape.objet}
          etape={editEtape.etape}
          open={!!editEtape}
          onOpenChange={(o) => !o && setEditEtape(null)}
          onSaved={reload}
        />
      )}
    </div>
  );
}
