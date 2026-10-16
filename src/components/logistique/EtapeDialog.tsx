import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronsUpDown, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ETAPE_LABELS, ETAPE_TYPES, type EtapeType } from "@/lib/logistique/etapes";
import {
  useAffairesPourLogistique, useInvalidateEtapes, useVehiculesActifs, type EtapeLogistique,
} from "@/hooks/use-etapes-logistiques";

const NONE = "__none__";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  etape?: EtapeLogistique | null;
  defaultDate?: string;
  defaultAffaireId?: string;
}

export function EtapeDialog({ open, onOpenChange, etape, defaultDate, defaultAffaireId }: Props) {
  const { data: affaires = [] } = useAffairesPourLogistique();
  const { data: vehicules = [] } = useVehiculesActifs();
  const invalidate = useInvalidateEtapes();
  const [saving, setSaving] = useState(false);
  const [affaireOpen, setAffaireOpen] = useState(false);
  const [f, setF] = useState(() => init());

  function init() {
    return {
      affaire_id: etape?.affaire_id ?? defaultAffaireId ?? "",
      type: (etape?.type ?? "livraison") as EtapeType,
      sens: etape?.sens ?? "",
      date_debut: etape?.date_debut ?? defaultDate ?? "",
      date_fin: etape?.date_fin ?? "",
      heure_debut: etape?.heure_debut?.slice(0, 5) ?? "",
      heure_fin: etape?.heure_fin?.slice(0, 5) ?? "",
      horaire_libre: etape?.horaire_libre ?? "",
      lieu_libre: etape?.lieu_libre ?? "",
      nb_personnes: etape?.nb_personnes?.toString() ?? "",
      vehicule_id: etape?.vehicule_id ?? "",
      immatriculation_libre: etape?.immatriculation_libre ?? "",
      acces: etape?.acces ?? "",
      note: etape?.note ?? "",
      commentaire_equipe: (etape as { commentaire_equipe?: string | null } | null | undefined)?.commentaire_equipe ?? "",
    };
  }
  useEffect(() => { if (open) setF(init()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open, etape?.id]);

  const set = (k: keyof ReturnType<typeof init>, v: string) => setF((p) => ({ ...p, [k]: v }));
  const showVehicule = f.type === "chargement" || f.type === "livraison" || f.type === "dechargement";
  const affaireLabel = useMemo(() => new Map(affaires.map((a) => [a.id, `${a.numero} — ${a.nom}`])), [affaires]);

  async function save() {
    if (!f.affaire_id || !f.date_debut) { toast.error("Choisissez un chantier et une date."); return; }
    if (f.date_fin && f.date_fin < f.date_debut) { toast.error("La date de fin est avant la date de début."); return; }
    setSaving(true);
    const payload = {
      affaire_id: f.affaire_id,
      type: f.type,
      sens: f.type === "chargement" && f.sens ? f.sens : null,
      date_debut: f.date_debut,
      date_fin: f.date_fin || null,
      heure_debut: f.heure_debut || null,
      heure_fin: f.heure_fin || null,
      horaire_libre: f.horaire_libre || null,
      lieu_libre: f.lieu_libre || null,
      nb_personnes: f.nb_personnes ? Number(f.nb_personnes) : null,
      vehicule_id: showVehicule && f.vehicule_id ? f.vehicule_id : null,
      immatriculation_libre: showVehicule && f.immatriculation_libre ? f.immatriculation_libre : null,
      acces: f.acces || null,
      note: f.note || null,
      commentaire_equipe: f.commentaire_equipe || null,
    };
    const { error } = etape
      ? await supabase.from("affaire_etapes_logistiques").update(payload).eq("id", etape.id)
      : await supabase.from("affaire_etapes_logistiques").insert({ ...payload, origine: "manuel", statut: "valide" });
    setSaving(false);
    if (error) { toast.error("Enregistrement impossible", { description: error.message }); return; }
    toast.success(etape ? "Étape mise à jour" : "Étape ajoutée au planning");
    invalidate();
    onOpenChange(false);
  }

  async function remove() {
    if (!etape || !confirm("Supprimer cette étape du planning ?")) return;
    const { data, error } = await supabase.from("affaire_etapes_logistiques").delete().eq("id", etape.id).select("id");
    if (error) { toast.error("Suppression impossible", { description: error.message }); return; }
    if (!data?.length) { toast.error("Suppression refusée : vous n'avez pas le droit de modifier cette étape."); return; }
    toast.success("Étape supprimée");
    invalidate();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>{etape ? "Modifier l'étape" : "Nouvelle étape logistique"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Chantier / opportunité</Label>
            <Popover open={affaireOpen} onOpenChange={setAffaireOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={affaireOpen} className="w-full justify-between font-normal">
                  <span className="truncate">{f.affaire_id ? affaireLabel.get(f.affaire_id) : "Choisir"}</span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[22rem] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Rechercher par numéro ou mot clé…" />
                  <CommandList>
                    <CommandEmpty>Aucun chantier trouvé.</CommandEmpty>
                    {affaires.map((a) => (
                      <CommandItem
                        key={a.id}
                        value={`${a.numero} ${a.nom}`}
                        onSelect={() => { set("affaire_id", a.id); setAffaireOpen(false); }}
                      >
                        <Check className={`mr-2 h-4 w-4 ${f.affaire_id === a.id ? "opacity-100" : "opacity-0"}`} />
                        {a.numero} — {a.nom}
                      </CommandItem>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <Label>Étape</Label>
            <Select value={f.type} onValueChange={(v) => set("type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ETAPE_TYPES.map((t) => <SelectItem key={t} value={t}>{ETAPE_LABELS[t]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {f.type === "chargement" ? (
            <div>
              <Label>Sens</Label>
              <Select value={f.sens || NONE} onValueChange={(v) => set("sens", v === NONE ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  <SelectItem value="aller">Aller (atelier)</SelectItem>
                  <SelectItem value="retour">Retour (site)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : <div />}
          <div><Label>Du</Label><Input type="date" value={f.date_debut} onChange={(e) => set("date_debut", e.target.value)} /></div>
          <div><Label>Au (optionnel)</Label><Input type="date" value={f.date_fin} onChange={(e) => set("date_fin", e.target.value)} /></div>
          <div><Label>Heure début</Label><Input type="time" value={f.heure_debut} onChange={(e) => set("heure_debut", e.target.value)} /></div>
          <div><Label>Heure fin</Label><Input type="time" value={f.heure_fin} onChange={(e) => set("heure_fin", e.target.value)} /></div>
          <div className="sm:col-span-2"><Label>Horaires détaillés</Label><Input placeholder="camion 1 @ 11h, camion 2 @ 15h" value={f.horaire_libre} onChange={(e) => set("horaire_libre", e.target.value)} /></div>
          {showVehicule && (
            <>
              <div>
                <Label>Véhicule</Label>
                <Select value={f.vehicule_id || NONE} onValueChange={(v) => set("vehicule_id", v === NONE ? "" : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Aucun / location</SelectItem>
                    {vehicules.map((v) => <SelectItem key={v.id} value={v.id}>{v.nom}{v.immatriculation ? ` · ${v.immatriculation}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Location / transporteur</Label><Input placeholder="Immatriculation ou transporteur" value={f.immatriculation_libre} onChange={(e) => set("immatriculation_libre", e.target.value)} /></div>
            </>
          )}
          <div><Label>Lieu</Label><Input value={f.lieu_libre} onChange={(e) => set("lieu_libre", e.target.value)} /></div>
          <div><Label>Nb personnes</Label><Input type="number" min={0} value={f.nb_personnes} onChange={(e) => set("nb_personnes", e.target.value)} /></div>
          <div className="sm:col-span-2"><Label>Accès (quai, code…)</Label><Input value={f.acces} onChange={(e) => set("acces", e.target.value)} /></div>
          <div className="sm:col-span-2"><Label>Note</Label><Textarea rows={2} value={f.note} onChange={(e) => set("note", e.target.value)} /></div>
          <div className="sm:col-span-2"><Label>Commentaire pour l'équipe</Label><Textarea rows={3} placeholder="Indications du chef d'équipe au chef logistique et à tous…" value={f.commentaire_equipe} onChange={(e) => set("commentaire_equipe", e.target.value)} /></div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {etape ? <Button variant="outline" className="text-destructive" onClick={remove}><Trash2 className="mr-1 h-4 w-4" />Supprimer l'étape</Button> : <span />}
          <Button onClick={save} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
