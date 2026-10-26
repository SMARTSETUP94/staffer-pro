import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ClientCombobox } from "@/components/clients/ClientCombobox";
import { normalizeForMatch } from "@/lib/string-normalize";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  affaireId: string;
  client: string | null;
  clientId: string | null;
  canRenameFiche: boolean;
  onSaved: () => void;
}

/** Changer, attacher (existant ou nouveau) ou renommer le client d'un chantier / d'une opportunité. */
export function ChangerClientDialog({ open, onOpenChange, affaireId, client, clientId, canRenameFiche, onSaved }: Props) {
  const [selId, setSelId] = useState<string | null>(clientId);
  const [nom, setNom] = useState(client ?? "");
  const [renameFiche, setRenameFiche] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setSelId(clientId); setNom(client ?? ""); setRenameFiche(false); }
  }, [open, client, clientId]);

  const save = async () => {
    const trimmed = nom.trim();
    if (!trimmed) { toast.error("Le nom du client est obligatoire"); return; }
    setSaving(true);
    try {
      if (renameFiche && selId) {
        const { error } = await supabase.from("clients").update({ nom: trimmed, nom_normalise: normalizeForMatch(trimmed) }).eq("id", selId);
        if (error) throw error;
        const { error: syncError } = await supabase.from("affaires").update({ client: trimmed }).eq("client_id", selId);
        if (syncError) throw syncError;
      }
      const { error } = await supabase.from("affaires").update({ client_id: selId, client: trimmed }).eq("id", affaireId);
      if (error) throw error;
      toast.success("Client mis à jour");
      onOpenChange(false);
      onSaved();
      window.dispatchEvent(new Event("affaire-updated"));
    } catch (e) {
      toast.error("Modification impossible", { description: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Client du chantier</DialogTitle>
          <DialogDescription>Rattachez un client existant, créez-en un nouveau ou corrigez le nom affiché.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Fiche client rattachée</Label>
            <ClientCombobox value={nom} clientId={selId} onChange={(id, n) => { setSelId(id); if (n) setNom(n); setRenameFiche(false); }} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="client-nom">Nom du client</Label>
            <Input id="client-nom" value={nom} onChange={(e) => setNom(e.target.value)} className="h-10 rounded-xl" />
          </div>
          {selId && canRenameFiche && (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={renameFiche} onCheckedChange={(v) => setRenameFiche(v === true)} className="mt-0.5" />
              <span>Renommer aussi la fiche client <span className="text-muted-foreground">(s'applique à tous ses chantiers et opportunités)</span></span>
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Annuler</Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
