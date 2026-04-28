import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import {
  useProfilesWithRoles,
  type FabricationFinitionType,
  type FabricationEtapeType,
  type ProfileRole,
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

const FINITIONS_VISIBLES: FabricationFinitionType[] = ["peinture", "tapisserie", "autre"];

interface FlagsState {
  a_dessiner: boolean;
  a_construire: boolean;
  est_brut: boolean;
  a_emballer: boolean;
}

const defaultFlags: FlagsState = {
  a_dessiner: true,
  a_construire: true,
  est_brut: false,
  a_emballer: true,
};

type AssigneesState = Record<FabricationEtapeType, string>; // "none" | id

const emptyAssignees: AssigneesState = {
  be: "none",
  usinage: "none",
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
  const [flags, setFlags] = useState<FlagsState>(defaultFlags);
  const [assignees, setAssignees] = useState<AssigneesState>(emptyAssignees);
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
      setFlags(defaultFlags);
      setAssignees(emptyAssignees);
    }
  }, [open]);

  // Quand est_brut bascule à true, reset typeFinition à "aucune" et reset assignee finition
  useEffect(() => {
    if (flags.est_brut) {
      setTypeFinition("aucune");
      setAssignees((a) => ({ ...a, finition: "none" }));
    }
  }, [flags.est_brut]);

  // Quand un flag passe à "non applicable", reset l'assignee correspondant
  useEffect(() => {
    if (!flags.a_dessiner) setAssignees((a) => ({ ...a, be: "none" }));
  }, [flags.a_dessiner]);
  useEffect(() => {
    if (!flags.a_construire) setAssignees((a) => ({ ...a, respo_fab: "none" }));
  }, [flags.a_construire]);
  useEffect(() => {
    if (!flags.a_emballer) setAssignees((a) => ({ ...a, manutention: "none" }));
  }, [flags.a_emballer]);

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

    // 1. Insert objet (le trigger crée les 4 étapes selon les flags)
    const respoFabId = assignees.respo_fab === "none" ? null : assignees.respo_fab;
    const { data: objet, error } = await supabase
      .from("fabrication_objets")
      .insert({
        affaire_id: affaireId,
        devis_id: devisId === "none" ? null : devisId,
        nom: nom.trim(),
        quantite,
        respo_fab_id: respoFabId,
        type_finition: flags.est_brut ? "aucune" : typeFinition,
        commentaire: commentaire.trim() || null,
        created_by: user?.id ?? null,
        reference: "", // sera généré par le trigger BEFORE INSERT
        a_dessiner: flags.a_dessiner,
        a_construire: flags.a_construire,
        est_brut: flags.est_brut,
        a_emballer: flags.a_emballer,
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
    (["be", "respo_fab", "finition", "manutention"] as FabricationEtapeType[]).forEach((etape) => {
      const assigneeId = assignees[etape];
      if (assigneeId !== "none") {
        updates.push(
          Promise.resolve(
            supabase
              .from("fabrication_etapes")
              .update({ assignee_id: assigneeId })
              .eq("objet_id", objet.id)
              .eq("type_etape", etape),
          ),
        );
      }
    });
    if (updates.length) {
      await Promise.all(updates);
    }

    setSaving(false);
    const assignedCount = updates.length;
    toast.success("Objet créé", {
      description:
        assignedCount > 0
          ? `${assignedCount} étape${assignedCount > 1 ? "s" : ""} pré-assignée${assignedCount > 1 ? "s" : ""}.`
          : "Étapes initialisées.",
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
            La référence FAB-AAAA-NNNNN sera générée automatiquement. Réponds aux 4 questions ci-dessous pour
            définir les étapes nécessaires.
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
          </div>

          <div className="grid gap-2">
            <Label htmlFor="commentaire">Commentaire / dimensions (optionnel)</Label>
            <Textarea
              id="commentaire"
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              placeholder="Notes sur dimensions, matériaux, finitions…"
              rows={2}
            />
          </div>

          {/* Bloc Étapes nécessaires */}
          <div className="rounded-xl border border-border bg-background p-3">
            <div className="mb-3 text-sm font-semibold">Étapes nécessaires</div>
            <div className="grid gap-3">
              {/* 1. BE */}
              <EtapeQuestion
                question="L'objet doit être dessiné ?"
                value={flags.a_dessiner}
                onChange={(v) => setFlags((f) => ({ ...f, a_dessiner: v }))}
              >
                {flags.a_dessiner && (
                  <AssigneeSelect
                    label="BE (optionnel)"
                    value={assignees.be}
                    onChange={(v) => setAssignees((a) => ({ ...a, be: v }))}
                    eligibles={eligiblesForEtape("be")}
                    placeholder="Choisir un BE…"
                  />
                )}
              </EtapeQuestion>

              {/* 2. Respo Fab */}
              <EtapeQuestion
                question="L'objet est à construire (ou existant) ?"
                value={flags.a_construire}
                onChange={(v) => setFlags((f) => ({ ...f, a_construire: v }))}
              >
                {flags.a_construire && (
                  <AssigneeSelect
                    label="Respo Fab (optionnel)"
                    value={assignees.respo_fab}
                    onChange={(v) => setAssignees((a) => ({ ...a, respo_fab: v }))}
                    eligibles={eligiblesForEtape("respo_fab")}
                    placeholder="Choisir un Respo Fab…"
                  />
                )}
              </EtapeQuestion>

              {/* 3. Finition (logique inversée) */}
              <EtapeQuestion
                question="L'objet est brut ?"
                value={flags.est_brut}
                onChange={(v) => setFlags((f) => ({ ...f, est_brut: v }))}
              >
                {!flags.est_brut && (
                  <div className="grid gap-2">
                    <AssigneeSelect
                      label="Finition (optionnel)"
                      value={assignees.finition}
                      onChange={(v) => setAssignees((a) => ({ ...a, finition: v }))}
                      eligibles={eligiblesForEtape("finition")}
                      placeholder="Choisir un Finition…"
                    />
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Type de finition (optionnel)</Label>
                      <Select
                        value={typeFinition === "aucune" ? "none" : typeFinition}
                        onValueChange={(v) =>
                          setTypeFinition((v === "none" ? "aucune" : v) as FabricationFinitionType)
                        }
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="— Non précisé —" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— Non précisé —</SelectItem>
                          {FINITIONS_VISIBLES.map((f) => (
                            <SelectItem key={f} value={f}>
                              {f === "peinture" ? "Peinture" : f === "tapisserie" ? "Tapisserie" : "Autre"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </EtapeQuestion>

              {/* 4. Manutention */}
              <EtapeQuestion
                question="L'objet doit être emballé ?"
                value={flags.a_emballer}
                onChange={(v) => setFlags((f) => ({ ...f, a_emballer: v }))}
              >
                {flags.a_emballer && (
                  <AssigneeSelect
                    label="Manutention (optionnel)"
                    value={assignees.manutention}
                    onChange={(v) => setAssignees((a) => ({ ...a, manutention: v }))}
                    eligibles={eligiblesForEtape("manutention")}
                    placeholder="Choisir un Manutention…"
                  />
                )}
              </EtapeQuestion>
            </div>
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

/** Bloc question Oui/Non avec contenu conditionnel. */
function EtapeQuestion({
  question,
  value,
  onChange,
  children,
}: {
  question: string;
  value: boolean;
  onChange: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm">{question}</span>
        <RadioGroup
          value={value ? "oui" : "non"}
          onValueChange={(v) => onChange(v === "oui")}
          className="flex gap-3"
        >
          <label className="flex cursor-pointer items-center gap-1 text-xs">
            <RadioGroupItem value="oui" /> Oui
          </label>
          <label className="flex cursor-pointer items-center gap-1 text-xs">
            <RadioGroupItem value="non" /> Non
          </label>
        </RadioGroup>
      </div>
      {children && <div className="mt-2 pl-2">{children}</div>}
    </div>
  );
}

function AssigneeSelect({
  label,
  value,
  onChange,
  eligibles,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  eligibles: ProfileRole[];
  placeholder: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder={placeholder} />
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
}
