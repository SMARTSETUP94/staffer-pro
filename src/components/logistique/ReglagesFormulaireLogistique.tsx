import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { demLogConfigAdmin, demLogConfigEnregistrer } from "@/lib/server-fns/demande-logistique.functions";
import { CHAMPS_FORMULAIRE, type ConfigFormulaire } from "@/lib/logistique/formulaire-config";
import { TYPES_ETAPE } from "@/lib/logistique/gabarit-demande";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const CATEGORIES = { appro: "Appro", emballage: "Emballage", chargement: "Chargement", livraison: "Livraison", tracage: "Traçage", montage: "Montage", finitions: "Finitions", permanence: "Permanence", rotation: "Rotation", demontage: "Démontage", dechargement: "Déchargement" };
type Personne = { id: string; libelle: string; chef: boolean };
export function ReglagesFormulaireLogistique() {
  const lire = useServerFn(demLogConfigAdmin);
  const enregistrer = useServerFn(demLogConfigEnregistrer);
  const [config, setConfig] = useState<ConfigFormulaire | null>(null);
  const [personnes, setPersonnes] = useState<Personne[]>([]);
  const [recherche, setRecherche] = useState("");
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState("");
  useEffect(() => { void lire().then(r => { setConfig(r.config); setPersonnes(r.personnes); }).catch(e => setErreur(e.message)); }, [lire]);
  if (erreur) return <p className="text-destructive">{erreur}</p>;
  if (!config) return <Loader2 aria-label="Chargement des réglages" className="h-5 w-5 animate-spin" />;
  const selection = config.chefs ?? (personnes.some(p => p.chef) ? personnes.filter(p => p.chef).map(p => p.id) : personnes.map(p => p.id));
  const normaliser = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  async function sauvegarder() {
    if (!config) return;
    setBusy(true);
    try { await enregistrer({ data: config }); const r = await lire(); setConfig(r.config); toast.success("Réglages enregistrés"); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="max-w-2xl space-y-6 border-t pt-6">
    <h2 className="text-lg font-semibold">Réglages du formulaire logistique</h2>
    <fieldset className="space-y-3">
      <legend className="mb-3 font-medium">Chefs d'équipe proposés</legend>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={config.chefs === null} onCheckedChange={v => setConfig({ ...config, chefs: v ? null : selection })} />Utiliser les chefs d'équipe de Dispos</label>
      <Input aria-label="Rechercher un chef d'équipe" placeholder="Rechercher un nom…" value={recherche} onChange={e => setRecherche(e.target.value)} />
      <div className="grid max-h-60 gap-2 overflow-y-auto sm:grid-cols-2">
        {personnes.filter(p => normaliser(p.libelle).includes(normaliser(recherche))).map(p => <label key={p.id} className="flex items-center gap-2 py-1 text-sm"><Checkbox checked={selection.includes(p.id)} onCheckedChange={v => setConfig({ ...config, chefs: v ? [...selection, p.id] : selection.filter(id => id !== p.id) })} />{p.libelle}</label>)}
      </div>
      <p className="text-xs text-muted-foreground">{selection.length} chef(s) proposé(s)</p>
    </fieldset>
    <fieldset><legend className="mb-3 font-medium">Catégories proposées</legend><div className="grid gap-3 sm:grid-cols-2">{TYPES_ETAPE.map(t => <label key={t} className="flex items-center gap-2 text-sm"><Checkbox checked={config.categories.includes(t)} onCheckedChange={v => setConfig({ ...config, categories: v ? [...config.categories, t] : config.categories.filter(c => c !== t) })} />{CATEGORIES[t]}</label>)}</div></fieldset>
    <fieldset><legend className="mb-3 font-medium">Champs obligatoires</legend><p className="mb-3 text-xs text-muted-foreground">Demandeur, projet, catégorie et date restent obligatoires.</p><div className="grid gap-3 sm:grid-cols-2">{Object.entries(CHAMPS_FORMULAIRE).map(([cle, label]) => {
      const k = cle as keyof typeof CHAMPS_FORMULAIRE;
      return <label key={k} className="flex items-center gap-2 text-sm"><Checkbox checked={config.obligatoires.includes(k)} onCheckedChange={v => setConfig({ ...config, obligatoires: v ? [...config.obligatoires, k] : config.obligatoires.filter(c => c !== k) })} />{label}</label>;
    })}</div></fieldset>
    <div className="space-y-2"><Label htmlFor="form-log-accueil">Texte d'accueil</Label><Textarea id="form-log-accueil" maxLength={1000} rows={3} value={config.accueil} onChange={e => setConfig({ ...config, accueil: e.target.value })} /></div>
    <Button disabled={busy || config.categories.length === 0} onClick={sauvegarder}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Enregistrer les réglages</Button>
  </section>;
}