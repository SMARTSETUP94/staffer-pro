import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  useProfilesWithRoles,
  type FabricationFinitionType,
  type FabricationEtapeType,
  type ProfileRole,
  FINITION_LABELS,
  ETAPE_LABELS,
  ETAPE_TO_FLAG,
} from "@/hooks/use-fabrication";

interface DevisLot {
  id: string;
  numero: string;
  libelle: string | null;
}

interface Props {
  affaireId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const FINITIONS: FabricationFinitionType[] = ["aucune", "peinture", "tapisserie", "autre"];
const ETAPES_ORDER: FabricationEtapeType[] = ["be", "respo_fab", "finition", "manutention"];

type AssigneesState = Record<FabricationEtapeType, string>; // "none" | id

const emptyAssignees: AssigneesState = {
  be: "none",
  respo_fab: "none",
  finition: "none",
  manutention: "none",
};

export function AjouterObjetDialog({ affaireId, open, onOpenChange, onCreated }: Props) {
  const { user } = useAuth();
  const { profiles } = useProfilesWithRoles();
  const [nom, setNom] = useState("");
  const [quantite, setQuantite] = useState(1);
  const [typeFinition, setTypeFinition] = useState<FabricationFinitionType>("aucune");
  const [devisId, setDevisId] = useState<string>("none");
  const [commentaire, setCommentaire] = useState("");
  const [devisLots, setDevisLots] = useState<DevisLot[]>([]);
  const [assignees, setAssignees] = useState<AssigneesState>(emptyAssignees);
  const [assignBlocOpen, setAssignBlocOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const eligiblesForEtape = (etape: FabricationEtapeType): ProfileRole[] => {
    const flag = ETAPE_TO_FLAG[etape];
    return profiles.filter((p) => p[flag]);
  };

  useEffect(() => {
    if (!open || !affaireId) return;
    void supabase
      .from("devis")
      .select("id, numero, libelle")
      .eq("affaire_id", affaireId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        const lots = (data ?? []) as DevisLot[];
        setDevisLots(lots);
        if (lots.length === 1) setDevisId(lots[0].id);
      });
  }, [open, affaireId]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setNom("");
      setQuantite(1);
      setTypeFinition("aucune");
      setDevisId("none");
      setCommentaire("");
      setAssignees(emptyAssignees);
      setAssignBlocOpen(false);
    }
  }, [open]);

  const assignedCount = ETAPES_ORDER.filter((e) => assignees[e] !== "none").length;

  const handleSubmit = async () => {
    if (!nom.trim()) {
      toast.error("Le nom de l'objet est obligatoire.");
      return;
    }
    if (quantite < 1) {
      toast.error("La quantité doit être au moins 1.");
      return;
    }
    setSaving(true);

    // 1. Insert objet (le trigger crée les 4 étapes en 'a_faire')
    const respoFabId = assignees.respo_fab === "none" ? null : assignees.respo_fab;
    const { data: objet, error } = await supabase
      .from("fabrication_objets")
      .insert({
        affaire_id: affaireId,
        devis_id: devisId === "none" ? null : devisId,
        nom: nom.trim(),
        quantite,
        respo_fab_id: respoFabId,
        type_finition: typeFinition,
        commentaire: commentaire.trim() || null,
        created_by: user?.id ?? null,
        reference: "", // sera généré par le trigger BEFORE INSERT
      })
      .select("id")
      .single();

    if (error || !objet) {
      setSaving(false);
      toast.error("Création impossible", { description: error?.message });
      return;
    }

    // 2. Pré-remplir les assignees sur les étapes correspondantes
    const updates: Promise<unknown>[] = [];
    for (const etape of ETAPES_ORDER) {
      const assigneeId = assignees[etape];
      if (assigneeId !== "none") {
        updates.push(
          supabase
            .from("fabrication_etapes")
            .update({ assignee_id: assigneeId })
            .eq("objet_id", objet.id)
            .eq("type_etape", etape),
        );
      }
    }
    if (updates.length) {
      await Promise.all(updates);
    }

    setSaving(false);
    toast.success("Objet créé", {
      description:
        assignedCount > 0
          ? `Les 4 étapes ont été initialisées (${assignedCount} pré-assignée${assignedCount > 1 ? "s" : ""}).`
          : "Les 4 étapes ont été initialisées en « À faire ».",
    });
    onCreated();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter un objet de fabrication</DialogTitle>
          <DialogDescription>
            La référence FAB-AAAA-NNNNN sera générée automatiquement. Les 4 étapes (BE, Respo Fab, Finition, Manutention)
            seront créées en statut « À faire ».
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[70vh] gap-4 overflow-y-auto py-2 pr-1">
          <div className="grid gap-2">
            <Label htmlFor="nom">Nom de l'objet *</Label>
            <Input
              id="nom"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Ex : Bar zinc 3m, Banquette tissus, Plinthe MDF…"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="quantite">Quantité *</Label>
              <Input
                id="quantite"
                type="number"
                min={1}
                value={quantite}
                onChange={(e) => setQuantite(Math.max(1, parseInt(e.target.value || "1", 10)))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Type de finition</Label>
              <Select value={typeFinition} onValueChange={(v) => setTypeFinition(v as FabricationFinitionType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FINITIONS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {FINITION_LABELS[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {devisLots.length > 1 && (
            <div className="grid gap-2">
              <Label>Lot de devis (optionnel)</Label>
              <Select value={devisId} onValueChange={setDevisId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Aucun lot —</SelectItem>
                  {devisLots.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.numero}
                      {d.libelle ? ` — ${d.libelle}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="commentaire">Commentaire / dimensions (optionnel)</Label>
            <Textarea
              id="commentaire"
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              placeholder="Notes sur dimensions, matériaux, finitions…"
              rows={3}
            />
          </div>

          {/* Sous-bloc collapsible : assignations initiales */}
          <div className="rounded-xl border border-border bg-background">
            <button
              type="button"
              onClick={() => setAssignBlocOpen((v) => !v)}
              className="flex w-full items-center justify-between p-3 text-left"
            >
              <div className="flex items-center gap-2">
                {assignBlocOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-sm font-semibold">Assignations initiales (optionnel)</span>
                {assignedCount > 0 && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {assignedCount}/4
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                Pré-affecter les étapes à des personnes
              </span>
            </button>

            {assignBlocOpen && (
              <div className="grid gap-3 border-t border-border p-3">
                {ETAPES_ORDER.map((etape) => {
                  const eligibles = eligiblesForEtape(etape);
                  const isFinitionDisabled = etape === "finition" && typeFinition === "aucune";
                  return (
                    <div key={etape} className="grid gap-1.5">
                      <Label className="text-xs">
                        {ETAPE_LABELS[etape]} (optionnel)
                        {isFinitionDisabled && (
                          <span className="ml-2 text-muted-foreground">— étape non applicable</span>
                        )}
                      </Label>
                      <Select
                        value={isFinitionDisabled ? "none" : assignees[etape]}
                        onValueChange={(v) => setAssignees((a) => ({ ...a, [etape]: v }))}
                        disabled={isFinitionDisabled}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder={`Choisir un ${ETAPE_LABELS[etape].toLowerCase()}`} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— Non assigné —</SelectItem>
                          {eligibles.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.full_name || p.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {eligibles.length === 0 && (
                        <p className="text-[11px] text-muted-foreground">
                          Aucun utilisateur avec ce rôle. Configurez-le dans Paramètres → Rôles fabrication.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Créer l'objet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
