import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Paperclip, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  demLogCreer, demLogFichier, demLogListes, demLogProjet,
  demLogPublicCreer, demLogPublicFichier, demLogPublicListes, demLogPublicProjet,
} from "@/lib/server-fns/demande-logistique.functions";
import { TYPES_ETAPE, type TypeEtape } from "@/lib/logistique/gabarit-demande";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CONFIG_FORMULAIRE_DEFAUT, erreurIntervention, type ConfigFormulaire } from "@/lib/logistique/formulaire-config";

const LIB: Record<TypeEtape, string> = { appro: "Appro", emballage: "Emballage", chargement: "Chargement", livraison: "Livraison", tracage: "Traçage", montage: "Montage", finitions: "Finitions", permanence: "Permanence", rotation: "Rotation", demontage: "Démontage", dechargement: "Déchargement" };
type Personne = { id: string; libelle: string; chef: boolean };
type Veh = { id: string; nom: string };
type Inter = { type: TypeEtape | ""; date: string; hDebut: string; hFin: string; aPartir: boolean; lieu: string; contactNom: string; contactTel: string; acces: string; vehicule: string; nb: string; chef: string; commentaire: string };
const vide = (): Inter => ({ type: "", date: "", hDebut: "", hFin: "", aPartir: false, lieu: "", contactNom: "", contactTel: "", acces: "", vehicule: "", nb: "", chef: "", commentaire: "" });
const ACCEPT = ["application/pdf", "image/jpeg", "image/png"];

export function DemandeLogistiqueForm({ jeton, onDone }: { jeton?: string; onDone?: (id: string) => void }) {
  const pub = !!jeton;
  const fListes = useServerFn(pub ? demLogPublicListes : demLogListes);
  const fProjet = useServerFn(pub ? demLogPublicProjet : demLogProjet);
  const fCreer = useServerFn(pub ? demLogPublicCreer : demLogCreer);
  const fFichier = useServerFn(pub ? demLogPublicFichier : demLogFichier);
  const [personnes, setPersonnes] = useState<Personne[]>([]);
  const [config, setConfig] = useState<ConfigFormulaire>(CONFIG_FORMULAIRE_DEFAUT);
  const [qChef, setQChef] = useState("");
  const [vehicules, setVehicules] = useState<Veh[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [demandeur, setDemandeur] = useState("");
  const [qDemandeur, setQDemandeur] = useState("");
  const [numero, setNumero] = useState("");
  const [projet, setProjet] = useState<{ id: string; numero: string; nom: string } | null>(null);
  const [projetMsg, setProjetMsg] = useState("");
  const [inters, setInters] = useState<Inter[]>([vide()]);
  const [fichiers, setFichiers] = useState<File[]>([]);
  const [piege, setPiege] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [fini, setFini] = useState(false);

  useEffect(() => {
    (fListes as (a: unknown) => Promise<{ personnes: Personne[]; vehicules: Veh[]; config: ConfigFormulaire; moi?: string | null }>)(pub ? { data: { jeton } } : {})
      .then((r) => { setPersonnes(r.personnes); setVehicules(r.vehicules); setConfig(r.config); if (r.moi) setDemandeur(r.moi); })
      .catch((e) => setErreur((e as Error).message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setProjet(null); setProjetMsg("");
    if (!/^\d{4,5}$/.test(numero)) return;
    const t = setTimeout(() => {
      (fProjet as (a: unknown) => Promise<{ id: string; numero: string; nom: string } | null>)({ data: pub ? { jeton, numero } : { numero } })
        .then((p) => { setProjet(p); setProjetMsg(p ? "" : "Aucun chantier ou opportunité actif avec ce numéro"); })
        .catch((e) => setProjetMsg((e as Error).message));
    }, 300);
    return () => clearTimeout(t);
  }, [numero]); // eslint-disable-line react-hooks/exhaustive-deps

  const upd = (i: number, p: Partial<Inter>) => setInters((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const chefs = personnes.filter((p) => p.chef);
  const listeChefs = config.chefs === null ? (chefs.length ? chefs : personnes) : personnes.filter(p => config.chefs?.includes(p.id));
  const requis = (k: ConfigFormulaire["obligatoires"][number]) => config.obligatoires.includes(k) ? " *" : "";
  const filtres = personnes.filter((p) => p.libelle.toLowerCase().includes(qDemandeur.toLowerCase())).slice(0, 30);

  async function envoyer() {
    if (!demandeur) return toast.error("Choisissez votre nom");
    if (!projet) return toast.error("Indiquez un numéro de projet valide");
    if (inters.some((x) => !x.type || !x.date)) return toast.error("Chaque intervention a besoin d'une catégorie et d'une date");
    for (const f of fichiers) if (!ACCEPT.includes(f.type) || f.size > 10 * 1024 * 1024) return toast.error(`${f.name} : PDF/JPG/PNG de 10 Mo maximum`);
    setEnvoi(true);
    try {
      const interventions = inters.map((x) => {
        const v = vehicules.find((y) => y.id === x.vehicule);
        const chef = personnes.find((p) => p.id === x.chef);
        return {
          type: x.type as TypeEtape, date: x.date, heure_debut: x.hDebut || null, heure_fin: x.aPartir ? null : x.hFin || null, a_partir_de: x.aPartir,
          lieu: x.lieu || null, contact_sur_place: [x.contactNom, x.contactTel].filter(Boolean).join(" — ") || null, acces: x.acces || null,
          vehicule: v?.nom ?? (x.vehicule === "petit_colis" ? "petit colis" : x.vehicule === "aucun" ? "aucun" : null), vehicule_id: v?.id ?? null,
          nb_personnes: x.nb ? Number(x.nb) : null, responsable: chef?.libelle ?? null, responsable_id: chef?.id ?? null, commentaire: x.commentaire || null,
        };
      });
      for (const i of interventions) {
        const message = erreurIntervention(config, i);
        if (message) throw new Error(message);
      }
      const payload = { demandeur, projet: projet.id, interventions, fichiers: fichiers.map((f) => ({ type: f.type, taille: f.size })), piege: piege || undefined };
      const r = await (fCreer as (a: unknown) => Promise<{ id: string; uploads: Array<{ path: string; token: string }> }>)({ data: pub ? { ...payload, jeton } : payload });
      let ko = 0;
      for (let k = 0; k < r.uploads.length; k++) {
        const u = r.uploads[k];
        const { error } = await supabase.storage.from("demandes-logistique").uploadToSignedUrl(u.path, u.token, fichiers[k], { contentType: fichiers[k].type });
        if (error) { ko++; continue; }
        try { await (fFichier as (a: unknown) => Promise<unknown>)({ data: pub ? { jeton, demande: r.id, path: u.path } : { demande: r.id, path: u.path } }); } catch { ko++; }
      }
      if (ko) toast.warning(`${ko} pièce(s) jointe(s) non transmise(s)`);
      setFini(true);
      onDone?.(r.id);
    } catch (e) { toast.error((e as Error).message); } finally { setEnvoi(false); }
  }

  if (erreur) return <p className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{erreur}</p>;
  if (fini) return (
    <div className="space-y-3 rounded-lg border bg-card p-6 text-center">
      <p className="text-lg font-medium">Demande envoyée, merci.</p>
      <p className="text-sm text-muted-foreground">La logistique la valide avant de l'ajouter au planning.</p>
      <Button variant="outline" onClick={() => { setFini(false); setInters([vide()]); setFichiers([]); setNumero(""); }}>Nouvelle demande</Button>
    </div>
  );

  return (
    <div className="space-y-5">
      {config.accueil && <p className="whitespace-pre-wrap break-words text-sm">{config.accueil}</p>}
      <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" value={piege} onChange={(e) => setPiege(e.target.value)} name="site_web" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Demandeur *</Label>
          <Input placeholder="Rechercher votre nom…" value={qDemandeur} onChange={(e) => setQDemandeur(e.target.value)} />
          <Select value={demandeur} onValueChange={setDemandeur}>
            <SelectTrigger aria-label="Demandeur"><SelectValue placeholder="Choisir votre nom" /></SelectTrigger>
            <SelectContent>{(qDemandeur ? filtres : personnes).map((p) => <SelectItem key={p.id} value={p.id}>{p.libelle}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dl-projet">Numéro de projet *</Label>
          <Input id="dl-projet" inputMode="numeric" placeholder="Ex. 6053 ou 9486" value={numero} onChange={(e) => setNumero(e.target.value.replace(/\D/g, "").slice(0, 5))} />
          {projet ? <p className="text-sm font-medium">{projet.numero} — {projet.nom}</p> : projetMsg && <p className="text-xs text-muted-foreground">{projetMsg}</p>}
        </div>
      </div>

      {inters.map((x, i) => (
        <fieldset key={i} className="space-y-3 rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between">
            <legend className="text-sm font-semibold">Intervention {i + 1}</legend>
            {inters.length > 1 && <Button size="icon" variant="ghost" aria-label="Retirer l'intervention" onClick={() => setInters((l) => l.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1"><Label>Catégorie *</Label>
              <Select value={x.type} onValueChange={(v) => upd(i, { type: v as TypeEtape })}>
                <SelectTrigger aria-label="Catégorie"><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent>{config.categories.map((t) => <SelectItem key={t} value={t}>{LIB[t]}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1"><Label>Date *</Label><Input type="date" aria-label="Date" value={x.date} onChange={(e) => upd(i, { date: e.target.value })} /></div>
            <div className="space-y-1"><Label>Heures{requis("heure_debut")}</Label>
              <div className="flex items-center gap-1.5">
                <Input className="min-w-0" type="time" aria-label="Heure de début" value={x.hDebut} onChange={(e) => upd(i, { hDebut: e.target.value })} />
                {!x.aPartir && <><span className="text-xs">à</span><Input className="min-w-0" type="time" aria-label="Heure de fin" value={x.hFin} onChange={(e) => upd(i, { hFin: e.target.value })} /></>}
              </div>
              <label className="flex items-center gap-2 text-xs"><Checkbox checked={x.aPartir} onCheckedChange={(v) => upd(i, { aPartir: !!v })} />À partir de (sans heure de fin)</label>
            </div>
          </div>
          <div className="space-y-1"><Label>Adresse{requis("lieu")}</Label><Input aria-label="Adresse" value={x.lieu} onChange={(e) => upd(i, { lieu: e.target.value })} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>Contact sur place (nom){requis("contact_sur_place")}</Label><Input value={x.contactNom} onChange={(e) => upd(i, { contactNom: e.target.value })} /></div>
            <div className="space-y-1"><Label>Téléphone du contact</Label><Input type="tel" value={x.contactTel} onChange={(e) => upd(i, { contactTel: e.target.value })} /></div>
          </div>
          <div className="space-y-1"><Label>Accès / contraintes</Label><Input value={x.acces} onChange={(e) => upd(i, { acces: e.target.value })} /></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1"><Label>Véhicule{requis("vehicule")}</Label>
              <Select value={x.vehicule} onValueChange={(v) => upd(i, { vehicule: v })}>
                <SelectTrigger aria-label="Véhicule"><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="petit_colis">Petit colis</SelectItem>
                  <SelectItem value="aucun">Aucun</SelectItem>
                  {vehicules.map((v) => <SelectItem key={v.id} value={v.id}>{v.nom}</SelectItem>)}
                </SelectContent>
              </Select></div>
            <div className="space-y-1"><Label>Nombre de personnes{requis("nb_personnes")}</Label><Input type="number" min={0} max={50} value={x.nb} onChange={(e) => upd(i, { nb: e.target.value })} /></div>
            <div className="space-y-1"><Label>Chef d'équipe{requis("responsable")}</Label>
              <Input aria-label="Rechercher un chef d'équipe" placeholder="Rechercher un nom…" value={qChef} onChange={e => setQChef(e.target.value)} />
              <Select value={x.chef} onValueChange={(v) => upd(i, { chef: v })}>
                <SelectTrigger aria-label="Chef d'équipe"><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent>{listeChefs.filter(p => p.libelle.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().includes(qChef.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase())).map((p) => <SelectItem key={p.id} value={p.id}>{p.libelle}</SelectItem>)}</SelectContent>
              </Select></div>
          </div>
          <div className="space-y-1"><Label>Commentaire{requis("commentaire")}</Label><Textarea rows={2} value={x.commentaire} onChange={(e) => upd(i, { commentaire: e.target.value })} /></div>
        </fieldset>
      ))}
      {inters.length < 10 && <Button variant="outline" onClick={() => setInters((l) => [...l, { ...vide(), lieu: l.at(-1)?.lieu ?? "" }])}><Plus className="mr-1 h-4 w-4" />Ajouter une intervention</Button>}

      <div className="space-y-1.5">
        <Label htmlFor="dl-pj" className="flex items-center gap-1"><Paperclip className="h-4 w-4" />Pièces jointes (PDF, JPG, PNG — 5 max, 10 Mo chacune)</Label>
        <Input id="dl-pj" type="file" multiple accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFichiers(Array.from(e.target.files ?? []).slice(0, 5))} />
        {fichiers.length > 0 && <p className="text-xs text-muted-foreground">{fichiers.map((f) => f.name).join(" · ")}</p>}
      </div>
      <Button className="w-full sm:w-auto" onClick={envoyer} disabled={envoi}>{envoi && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Envoyer la demande</Button>
    </div>
  );
}
