import { ResponsableAutocomplete } from "./ResponsableAutocomplete";
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
import { LieuAutocomplete } from "./LieuAutocomplete";
import {
  useAffairesPourLogistique, useInvalidateEtapes, useVehiculesActifs, type EtapeLogistique,
} from "@/hooks/use-etapes-logistiques";

const NONE = "__none__";
function payloadWithoutAffaire<T extends { affaire_id: string }>(payload: T) {
  const { affaire_id: _, ...patch } = payload;
  return patch;
}

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
      responsable: etape?.responsable ?? "",
      vehicule_id: etape?.vehicule_id ?? "",
      immatriculation_libre: etape?.immatriculation_libre ?? "",
      acces: etape?.acces ?? "",
      note: etape?.note ?? "",
      commentaire_equipe: (etape as { commentaire_equipe?: string | null } | null | undefined)?.commentaire_equipe ?? "",
      nb_chefs_equipe: etape?.nb_chefs_equipe?.toString() ?? "",
      nb_vehicules: etape?.nb_vehicules?.toString() ?? "",
      permis_requis: (etape?.permis_requis ?? []).join(","),
      caces_requis: (etape?.caces_requis ?? []).join(","),
    };
  }
  useEffect(() => { if (open) setF(init()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open, etape?.id]);

  const set = (k: keyof ReturnType<typeof init>, v: string) => setF((p) => ({ ...p, [k]: v }));
  // Véhicule proposé sur toutes les étapes ; facultatif, jamais bloquant.
  const showVehicule = true;
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
      responsable: f.responsable.trim() || null,
      vehicule_id: showVehicule && f.vehicule_id ? f.vehicule_id : null,
      immatriculation_libre: showVehicule && f.immatriculation_libre ? f.immatriculation_libre : null,
      acces: f.acces || null,
      note: f.note || null,
      commentaire_equipe: f.commentaire_equipe || null,
      // Besoins qualifiés : envoyés seulement s'ils sont renseignés ou déjà présents sur l'étape.
      // Création : toujours envoyés (colonnes non nulles). Modification : seulement si renseignés ou déjà présents.
      ...(!etape || f.nb_chefs_equipe || f.nb_vehicules || f.permis_requis || f.caces_requis || etape?.nb_chefs_equipe || etape?.nb_vehicules || etape?.permis_requis?.length || etape?.caces_requis?.length ? {
        // Champs facultatifs : vides = aucun besoin (colonnes non nulles côté base).
        nb_chefs_equipe: f.nb_chefs_equipe ? Number(f.nb_chefs_equipe) : 0,
        nb_vehicules: f.nb_vehicules ? Number(f.nb_vehicules) : null,
        permis_requis: f.permis_requis ? f.permis_requis.split(",") : [],
        caces_requis: f.caces_requis ? f.caces_requis.split(",") : [],
      } : {}),
    };
    const { error } = etape
      ? await supabase.rpc("app_modifier_etape_logistique", { _id: etape.id, _patch: payloadWithoutAffaire(payload) })
      : await supabase.rpc("app_creer_etape_logistique", { _payload: payload });
    setSaving(false);
    if (error) { toast.error("Enregistrement impossible", { description: error.message }); return; }
    toast.success(etape ? "Étape mise à jour" : "Étape ajoutée au planning");
    invalidate();
    onOpenChange(false);
  }

  async function remove() {
    if (!etape) return;
    // Annulation douce : les affectations liées restent dans l'historique (pas de suppression physique).
    const motif = window.prompt("Retirer cette étape du planning ? Indiquez un motif :", "Étape supprimée du planning");
    if (motif === null) return;
    const raison = motif.trim() || "Étape supprimée du planning";
    const precedent = (etape as { commentaire_equipe?: string | null }).commentaire_equipe?.trim();
    const commentaire = (precedent ? `Annulée : ${raison} — ${precedent}` : `Annulée : ${raison}`).slice(0, 2000);
    const { error } = await supabase.rpc("app_modifier_etape_logistique", { _id: etape.id, _patch: { statut: "annule", commentaire_equipe: commentaire } });
    if (error) { toast.error("Suppression impossible", { description: error.message }); return; }
    toast.success("Étape retirée du planning");
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
                    <SelectItem value={NONE}>Non choisi / location</SelectItem>
                    {vehicules.map((v) => <SelectItem key={v.id} value={v.id}>{v.nom}{v.immatriculation ? ` · ${v.immatriculation}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Autres véhicules / location (facultatif)</Label><Input placeholder="Autres véhicules, location, transporteur…" value={f.immatriculation_libre} onChange={(e) => set("immatriculation_libre", e.target.value)} /></div>
            </>
          )}
          <div><Label>Lieu</Label><LieuAutocomplete value={f.lieu_libre} onChange={(v) => set("lieu_libre", v)} /></div>
          <div><Label>Nb personnes</Label><Input type="number" min={0} value={f.nb_personnes} onChange={(e) => set("nb_personnes", e.target.value)} /></div>
          <div><Label>Chefs d'équipe requis</Label><Input type="number" min={0} value={f.nb_chefs_equipe} onChange={(e) => set("nb_chefs_equipe", e.target.value)} /></div>
          <div><Label>Nb véhicules</Label><Input type="number" min={0} value={f.nb_vehicules} onChange={(e) => set("nb_vehicules", e.target.value)} /></div>
          <div className="sm:col-span-2"><Label>Permis requis (1 personne par permis)</Label><ChoixMultiple options={["B", "C", "CE"]} value={f.permis_requis} onChange={(v) => set("permis_requis", v)} /></div>
          <div className="sm:col-span-2"><Label>CACES requis</Label><ChoixMultiple options={["R489", "R486"]} value={f.caces_requis} onChange={(v) => set("caces_requis", v)} /></div>
          <div className="sm:col-span-2"><Label>Responsable</Label><ResponsableAutocomplete value={f.responsable} onChange={(v) => set("responsable", v)} /></div>
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

/** Cases à cocher pour une liste de codes (permis, CACES), stockée « B,C ». */
function ChoixMultiple({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  const sel = new Set(value ? value.split(",") : []);
  return <div className="flex flex-wrap gap-3 pt-1">{options.map((o) => <label key={o} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={sel.has(o)} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(o); else n.delete(o); onChange(options.filter((x) => n.has(x)).join(",")); }} />{o}</label>)}</div>;
}
