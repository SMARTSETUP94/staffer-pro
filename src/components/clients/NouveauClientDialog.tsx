import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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

export function NouveauClientDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (clientId?: string) => void;
}) {
  const [nom, setNom] = useState("");
  const [domaines, setDomaines] = useState("");
  const [secteur, setSecteur] = useState("");
  const [siret, setSiret] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    const cleanNom = nom.trim();
    if (!cleanNom) {
      toast.error("Nom du client requis");
      return;
    }
    setSaving(true);
    const domList = domaines
      .split(/[,\s;]+/)
      .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
      .filter(Boolean);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    const { data, error } = await supabase
      .from("clients")
      // nom_normalise est calculé côté DB par trigger — on passe une valeur
      // de complaisance pour satisfaire le NOT NULL ; le trigger l'écrase.
      .insert({
        nom: cleanNom,
        nom_normalise: cleanNom.toLowerCase(),
        domaines_email: domList,
        secteur: secteur.trim() || null,
        siret: siret.trim() || null,
        notes: notes.trim() || null,
        created_by: userId ?? null,
      })
      .select("id")
      .single();
    setSaving(false);
    if (error || !data) {
      toast.error("Erreur", { description: error?.message });
      return;
    }
    toast.success("Client créé");
    onDone(data.id);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau client</DialogTitle>
          <DialogDescription>
            Centralise tous les chantiers, opportunités et emails de ce client.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nom *</Label>
            <Input
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="EDF, Hermès, BNP…"
              autoFocus
            />
          </div>
          <div>
            <Label>Domaines email</Label>
            <Input
              value={domaines}
              onChange={(e) => setDomaines(e.target.value)}
              placeholder="edf.fr, edf.com"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Séparés par virgule. Sert à l'auto-rattachement des emails reçus.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Secteur</Label>
              <Input
                value={secteur}
                onChange={(e) => setSecteur(e.target.value)}
                placeholder="Énergie, Luxe…"
              />
            </div>
            <div>
              <Label>SIRET</Label>
              <Input value={siret} onChange={(e) => setSiret(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
