import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ResponsableCombobox } from "./ResponsableCombobox";
import type { AffaireResponsableField } from "@/lib/affaire-affectations";

export function AffaireResponsablePicker({ affaireId, field, value, onSaved }: {
  affaireId: string;
  field: AffaireResponsableField;
  value: string | null;
  onSaved: (id: string | null) => void;
}) {
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const label = field === "chef_projet_id" ? "Chef de projet" : "Dessinateur";
  async function save(id: string | null) {
    if (id === value || saving) return;
    setSaving(true);
    try {
      const patch = field === "chef_projet_id" ? { chef_projet_id: id } : { dessinateur_id: id };
      const { data, error } = await supabase.rpc("app_modifier_affaire", { _id: affaireId, _patch: patch });
      if (error || !data) throw error ?? new Error("Enregistrement non autorisé.");
      onSaved(id);
      await queryClient.invalidateQueries({ queryKey: ["liste-chantiers"] });
      window.dispatchEvent(new Event("affaire-updated"));
      toast.success(`${label} enregistré`);
    } catch (error) {
      toast.error("Affectation impossible", { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setSaving(false);
    }
  }
  return <ResponsableCombobox label={label} value={value} onChange={(id) => { void save(id); }} disabled={saving} />;
}