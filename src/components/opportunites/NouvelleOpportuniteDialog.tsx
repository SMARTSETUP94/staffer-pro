import { useState } from "react";
import { Loader2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  TAILLE_LABEL,
  TAILLE_ORDER,
  TAILLE_RANGE,
  type OpportuniteTaille,
} from "@/lib/opportunites";
import type { ChargeAffaires } from "@/hooks/use-charges-affaires";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ID du user connecté — pré-rempli comme CA par défaut. */
  defaultChargeId?: string | null;
  charges: ChargeAffaires[];
  onCreated: () => void;
}

/**
 * v0.17 — Modale de création d'une opportunité (9XXX).
 * Pré-remplit le code via RPC `next_affaire_numero(9)`, l'utilisateur peut éditer.
 */
export function NouvelleOpportuniteDialog({
  open,
  onOpenChange,
  defaultChargeId,
  charges,
  onCreated,
}: Props) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [client, setClient] = useState("");
  const [nom, setNom] = useState("");
  const [code, setCode] = useState("");
  const [chargeId, setChargeId] = useState<string>(defaultChargeId ?? "");
  const [taille, setTaille] = useState<OpportuniteTaille>("petit");
  const [dateOpp, setDateOpp] = useState(todayIso);
  const [commentaires, setCommentaires] = useState("");
  const [loadingCode, setLoadingCode] = useState(false);
  const [saving, setSaving] = useState(false);

  // Charge le prochain code à l'ouverture
  function reset() {
    setClient("");
    setNom("");
    setCode("");
    setChargeId(defaultChargeId ?? "");
    setTaille("petit");
    setDateOpp(todayIso);
    setCommentaires("");
  }

  async function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (next) {
      reset();
      setLoadingCode(true);
      const { data, error } = await supabase.rpc("next_affaire_numero", { _prefix: 9 });
      setLoadingCode(false);
      if (error) {
        toast.error("Impossible de suggérer un code 9XXX", { description: error.message });
        return;
      }
      if (data) setCode(String(data));
    }
  }

  async function handleSave() {
    if (!client.trim()) {
      toast.error("Client obligatoire");
      return;
    }
    if (!code.match(/^9\d{3}$/)) {
      toast.error("Code invalide", { description: "Format attendu : 9XXX (4 chiffres)." });
      return;
    }
    if (!chargeId) {
      toast.error("Chargé d'affaires obligatoire");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("create_opportunite", {
      _client: client.trim(),
      _nom: nom.trim() || client.trim(),
      _code: code.trim(),
      _charge_affaires_id: chargeId,
      _taille: taille,
      _date_opportunite: dateOpp,
      _commentaires: commentaires.trim() || undefined,
    });
    setSaving(false);
    if (error) {
      toast.error("Création impossible", { description: error.message });
      return;
    }
    toast.success(`Opportunité ${code} créée`);
    onOpenChange(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouvelle opportunité</DialogTitle>
          <DialogDescription>
            Création d'un dossier 9XXX (étude / chiffrage en cours). Une fois gagnée et
            signée, il sera converti en affaire 5XXX.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Client</Label>
            <Input
              value={client}
              onChange={(e) => setClient(e.target.value)}
              placeholder="Ex. Mercedes-Benz, Hermès…"
              autoFocus
            />
          </div>

          <div className="grid gap-1.5">
            <Label>
              Intitulé du chantier{" "}
              <span className="text-[10px] font-normal text-muted-foreground">
                (optionnel — défaut = client)
              </span>
            </Label>
            <Input
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Ex. Stand IAA 2026"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Code 9XXX</Label>
              <div className="relative">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="9000"
                  className="font-mono"
                  maxLength={4}
                />
                {loadingCode && (
                  <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Date opportunité</Label>
              <Input
                type="date"
                value={dateOpp}
                onChange={(e) => setDateOpp(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Chargé d'affaires</Label>
              <Select value={chargeId} onValueChange={setChargeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner…" />
                </SelectTrigger>
                <SelectContent>
                  {charges.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name || c.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Taille</Label>
              <Select
                value={taille}
                onValueChange={(v) => setTaille(v as OpportuniteTaille)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TAILLE_ORDER.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TAILLE_LABEL[t]}{" "}
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        ({TAILLE_RANGE[t]})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Commentaires (optionnel)</Label>
            <Textarea
              rows={3}
              value={commentaires}
              onChange={(e) => setCommentaires(e.target.value)}
              placeholder="Brief, contraintes, infos client…"
              maxLength={1000}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl">
            Annuler
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Créer l'opportunité
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
