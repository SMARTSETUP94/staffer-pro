import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import type { Vehicule } from "@/hooks/use-vehicules";
import type { TablesInsert } from "@/integrations/supabase/types";

interface Employe {
  id: string;
  prenom: string;
  nom: string;
  est_livreur: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  vehicule: Vehicule | null;
  onSaved: () => void;
}

const emptyDraft: TablesInsert<"vehicules"> = {
  nom: "",
  immatriculation: null,
  marque: null,
  modele: null,
  type: "VL",
  volume_m3: null,
  poids_max_kg: null,
  capacite_passagers: null,
  permis_requis: "B",
  date_controle_technique: null,
  date_prochaine_revision: null,
  date_expiration_assurance: null,
  proprietaire: "interne",
  fournisseur_location: null,
  cout_journalier_eur: null,
  date_debut_location: null,
  date_fin_location: null,
  prestataire_location: null,
  reference_contrat: null,
  actif: true,
  notes: null,
};

export function VehiculeDialog({ open, onOpenChange, vehicule, onSaved }: Props) {
  const [draft, setDraft] = useState<TablesInsert<"vehicules">>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [employesPL, setEmployesPL] = useState<Employe[]>([]);
  const [autorises, setAutorises] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setDraft(vehicule ? { ...vehicule } : emptyDraft);
    void loadAutorises();
    void loadEmployes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vehicule?.id]);

  const loadEmployes = async () => {
    const { data } = await supabase
      .from("employes")
      .select("id, prenom, nom, est_livreur")
      .eq("actif", true)
      .eq("est_livreur", true)
      .order("nom");
    setEmployesPL((data as Employe[]) ?? []);
  };

  const loadAutorises = async () => {
    if (!vehicule?.id) {
      setAutorises(new Set());
      return;
    }
    const { data } = await supabase
      .from("vehicule_chauffeurs_autorises")
      .select("employe_id")
      .eq("vehicule_id", vehicule.id);
    setAutorises(new Set((data ?? []).map((r) => r.employe_id)));
  };

  const set = <K extends keyof TablesInsert<"vehicules">>(k: K, v: TablesInsert<"vehicules">[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const toggleAutorise = (employeId: string, checked: boolean) => {
    setAutorises((s) => {
      const next = new Set(s);
      if (checked) next.add(employeId);
      else next.delete(employeId);
      return next;
    });
  };

  const handleSave = async () => {
    if (!draft.nom.trim()) {
      toast.error("Le surnom du véhicule est requis");
      return;
    }
    setSaving(true);
    try {
      let vehiculeId = vehicule?.id;
      if (vehicule) {
        const { error } = await supabase.from("vehicules").update(draft).eq("id", vehicule.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("vehicules")
          .insert(draft)
          .select("id")
          .single();
        if (error) throw error;
        vehiculeId = data.id;
      }

      // Sync atomique des chauffeurs autorisés via RPC (DELETE + INSERT en transaction)
      if (vehiculeId) {
        const employeIds = draft.type === "poids_lourd" ? Array.from(autorises) : [];
        const { error: errSync } = await supabase.rpc("set_vehicule_chauffeurs_autorises", {
          _vehicule_id: vehiculeId,
          _employe_ids: employeIds,
        });
        if (errSync) throw errSync;
      }

      toast.success(vehicule ? "Véhicule modifié" : "Véhicule créé");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      toast.error("Sauvegarde impossible", { description: msg });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{vehicule ? "Modifier le véhicule" : "Nouveau véhicule"}</DialogTitle>
          <DialogDescription>
            Les surnoms (« Le gros bleu ») rendent le planning plus parlant.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Surnom *</Label>
              <Input value={draft.nom} onChange={(e) => set("nom", e.target.value)} />
            </div>
            <div>
              <Label>Immatriculation</Label>
              <Input
                value={draft.immatriculation ?? ""}
                onChange={(e) => set("immatriculation", e.target.value || null)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Marque</Label>
              <Input
                value={draft.marque ?? ""}
                onChange={(e) => set("marque", e.target.value || null)}
              />
            </div>
            <div>
              <Label>Modèle</Label>
              <Input
                value={draft.modele ?? ""}
                onChange={(e) => set("modele", e.target.value || null)}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={draft.type} onValueChange={(v) => set("type", v as Vehicule["type"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VL">Véhicule léger</SelectItem>
                  <SelectItem value="M3_20">20 m³</SelectItem>
                  <SelectItem value="poids_lourd">Poids lourd</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Permis requis</Label>
              <Select
                value={draft.permis_requis ?? "B"}
                onValueChange={(v) => set("permis_requis", v as "B" | "C" | "CE")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="B">B</SelectItem>
                  <SelectItem value="C">C</SelectItem>
                  <SelectItem value="CE">CE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Propriétaire</Label>
              <Select
                value={draft.proprietaire ?? "interne"}
                onValueChange={(v) => set("proprietaire", v as Vehicule["proprietaire"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="interne">Interne</SelectItem>
                  <SelectItem value="location">Location</SelectItem>
                  <SelectItem value="sous_traitance">Sous-traitance</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Volume (m³)</Label>
              <Input
                type="number"
                step="0.1"
                value={draft.volume_m3 ?? ""}
                onChange={(e) => set("volume_m3", e.target.value ? Number(e.target.value) : null)}
              />
            </div>
            <div>
              <Label>Poids max (kg)</Label>
              <Input
                type="number"
                value={draft.poids_max_kg ?? ""}
                onChange={(e) =>
                  set("poids_max_kg", e.target.value ? Number(e.target.value) : null)
                }
              />
            </div>
            <div>
              <Label>Capacité passagers</Label>
              <Input
                type="number"
                value={draft.capacite_passagers ?? ""}
                onChange={(e) =>
                  set("capacite_passagers", e.target.value ? Number(e.target.value) : null)
                }
              />
            </div>
          </div>

          {(draft.proprietaire === "location" || draft.proprietaire === "sous_traitance") && (
            <div className="grid gap-3 rounded-lg border border-warning/30 bg-warning/5 p-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Fournisseur / Loueur</Label>
                  <Input
                    placeholder="ex Europcar, Hertz"
                    value={draft.fournisseur_location ?? ""}
                    onChange={(e) => set("fournisseur_location", e.target.value || null)}
                  />
                </div>
                <div>
                  <Label>Coût journalier (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={draft.cout_journalier_eur ?? ""}
                    onChange={(e) =>
                      set("cout_journalier_eur", e.target.value ? Number(e.target.value) : null)
                    }
                  />
                </div>
              </div>

              {/* v0.15.2 — Plage de dates location pour filtrer du planning hors période */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Date début location</Label>
                  <Input
                    type="date"
                    value={draft.date_debut_location ?? ""}
                    onChange={(e) => set("date_debut_location", e.target.value || null)}
                  />
                </div>
                <div>
                  <Label>Date fin location</Label>
                  <Input
                    type="date"
                    value={draft.date_fin_location ?? ""}
                    onChange={(e) => set("date_fin_location", e.target.value || null)}
                  />
                </div>
              </div>
              <p className="-mt-2 text-[11px] text-muted-foreground">
                Hors de cette plage, le véhicule sera masqué du planning flotte automatiquement.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Prestataire</Label>
                  <Input
                    placeholder="Nom commercial du loueur"
                    value={draft.prestataire_location ?? ""}
                    onChange={(e) => set("prestataire_location", e.target.value || null)}
                  />
                </div>
                <div>
                  <Label>Référence contrat</Label>
                  <Input
                    placeholder="N° de contrat ou bon de commande"
                    value={draft.reference_contrat ?? ""}
                    onChange={(e) => set("reference_contrat", e.target.value || null)}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Dernier contrôle technique</Label>
              <Input
                type="date"
                value={draft.date_controle_technique ?? ""}
                onChange={(e) => set("date_controle_technique", e.target.value || null)}
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                Validité 2 ans · alerte 30 j avant échéance
              </p>
            </div>
            <div>
              <Label>Prochaine révision</Label>
              <Input
                type="date"
                value={draft.date_prochaine_revision ?? ""}
                onChange={(e) => set("date_prochaine_revision", e.target.value || null)}
              />
            </div>
            <div>
              <Label>Expiration assurance</Label>
              <Input
                type="date"
                value={draft.date_expiration_assurance ?? ""}
                onChange={(e) => set("date_expiration_assurance", e.target.value || null)}
              />
            </div>
          </div>

          {draft.type === "poids_lourd" && (
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <Label className="mb-2 block">Chauffeurs autorisés (PL)</Label>
              {employesPL.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Aucun employé n'est marqué « livreur ». Active le badge sur la fiche employé.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                  {employesPL.map((e) => (
                    <label key={e.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={autorises.has(e.id)}
                        onCheckedChange={(v) => toggleAutorise(e.id, !!v)}
                      />
                      <span>
                        {e.prenom} {e.nom}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <Label>Notes</Label>
            <Textarea
              value={draft.notes ?? ""}
              onChange={(e) => set("notes", e.target.value || null)}
              rows={2}
            />
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={draft.actif ?? true} onCheckedChange={(v) => set("actif", v)} />
            <Label className="cursor-pointer">Véhicule actif</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
