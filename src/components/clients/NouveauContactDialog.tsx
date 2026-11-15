import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function NouveauContactDialog({ clientId, clientNom, onClose, onCreated }: {
  clientId: string;
  clientNom: string;
  onClose: () => void;
  onCreated: (id: string) => Promise<boolean>;
}) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [form, setForm] = useState({ prenom: "", nom: "", email: "", telephone: "", fonction: "" });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      let id = createdId;
      if (!id) {
        const { data, error } = await supabase.from("client_contacts").insert({
          client_id: clientId,
          prenom: form.prenom.trim() || null,
          nom: form.nom.trim() || null,
          email: form.email.trim(),
          telephone: form.telephone.trim() || null,
          fonction: form.fonction.trim() || null,
        }).select("id").single();
        if (error) throw error;
        id = data.id;
        setCreatedId(id);
        await queryClient.invalidateQueries({ queryKey: ["client-contacts", clientId] });
      }
      if (await onCreated(id)) {
        toast.success("Contact enregistré dans la fiche client et sélectionné pour le devis");
        onClose();
      } else {
        toast.warning("Contact enregistré dans la fiche client, mais non sélectionné dans le devis. Vous pouvez réessayer.");
      }
    } catch (error) {
      toast.error("Impossible d’enregistrer le contact", { description: error && typeof error === "object" && "message" in error ? String(error.message) : String(error) });
    } finally {
      setSaving(false);
    }
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Nouveau contact d’envoi</DialogTitle>
        <DialogDescription className="break-words">{clientNom}</DialogDescription>
      </DialogHeader>
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <fieldset disabled={saving || !!createdId} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label htmlFor="contact-prenom">Prénom</Label><Input id="contact-prenom" autoComplete="given-name" value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="contact-nom">Nom</Label><Input id="contact-nom" autoComplete="family-name" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} /></div>
          </div>
          <div className="space-y-1"><Label htmlFor="contact-email">Email d’envoi</Label><Input id="contact-email" type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="contact-telephone">Téléphone</Label><Input id="contact-telephone" type="tel" autoComplete="tel" value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="contact-fonction">Fonction</Label><Input id="contact-fonction" value={form.fonction} onChange={(e) => setForm({ ...form, fonction: e.target.value })} /></div>
        </fieldset>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Annuler</Button>
          <Button type="submit" disabled={saving}>{saving ? "Enregistrement…" : createdId ? "Sélectionner pour le devis" : "Enregistrer et sélectionner"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}