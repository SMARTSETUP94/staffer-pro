import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { ajouterJours, numeroSemaine, plageSemaine, libelleJour } from '@/lib/dispos';
import { Download, Pencil, Plus, AlertTriangle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { personnesStaffees, memePersonne, statutDispo, alerteDispo, trierCandidats, dispoNonStaffes, libelleCase, horaire, type DispoPlanning, type PersonnePlanning, type AffectationPlanning, type EtapePlanning } from '@/lib/imports/planning-equipes';
import { ETAPE_LABELS } from '@/lib/logistique/etapes';
import { EtapeDialog } from '@/components/logistique/EtapeDialog';
import type { EtapeLogistique } from '@/hooks/use-etapes-logistiques';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { NavigationSemaine } from '@/components/logistique/NavigationSemaine';
import { PastilleDispo, BadgesQualifs } from '@/components/logistique/PastilleDispo';

type Personne = PersonnePlanning & { actif: boolean; poste: string | null };
type Affectation = AffectationPlanning & { id: string; historique: boolean };
type Etape = EtapePlanning & { affaire_id: string };
type Semaine = { references: { personnes: Personne[]; affaires: { id: string; numero: string }[] }; affectations: Affectation[]; etapes: Etape[]; dispos: DispoPlanning[] };

const lundiCourant = () => { const d = new Date(); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(d); };
const titreJour = (jour: string) => new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${jour}T12:00:00`));
const ALERTE = { rouge: 'ring-2 ring-destructive', orange: 'ring-2 ring-warning' } as const;

export function PlanningEquipes() {
  const [debut, setDebut] = useState(lundiCourant);
  const [recherche, setRecherche] = useState('');
  const [vue, setVue] = useState<'etape' | 'personne'>('etape');
  const [ajout, setAjout] = useState<{ etape: string; jour: string } | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [edition, setEdition] = useState<{ open: boolean; etape: EtapeLogistique | null }>({ open: false, etape: null });
  const [renommer, setRenommer] = useState<{ affaire: string; numero: string; nom: string } | null>(null);
  const q = useQuery({ queryKey: ['planning-terrain', debut], queryFn: async () => { const { data, error } = await supabase.rpc('planning_terrain_semaine', { _debut: debut, _fin: ajouterJours(debut, 6) }); if (error) throw error; return data as unknown as Semaine; } });
  const droits = useQuery({ queryKey: ['planning-terrain-droits'], queryFn: async () => (await supabase.rpc('planning_terrain_ecrire_autorise')).data === true });
  const dates = Array.from({ length: 7 }, (_, i) => ajouterJours(debut, i));
  const personnes = q.data?.references.personnes ?? [];
  const affectations = q.data?.affectations ?? [];
  const etapes = q.data?.etapes ?? [];
  const dispos = q.data?.dispos ?? [];
  const staffees = personnesStaffees(personnes, affectations, debut, ajouterJours(debut, 6));
  const etapesDu = (jour: string) => etapes.filter(e => e.date <= jour && e.fin >= jour).sort((a, b) => (a.heure ?? '99').localeCompare(b.heure ?? '99'));
  const personneDe = (a: Affectation) => personnes.find(p => memePersonne(p, a));
  const etapeDe = (id: string | null) => etapes.find(e => e.id === id);

  async function ouvrirEtape(id: string | null) {
    if (!id) return;
    const { data, error } = await supabase.from('affaire_etapes_logistiques').select('*').eq('id', id).maybeSingle();
    if (error || !data) { toast.error('Étape introuvable'); return; }
    setEdition({ open: true, etape: data as EtapeLogistique });
  }
  async function ouvrirRenommer(id: string) {
    const { data } = await supabase.from('affaire_etapes_logistiques').select('affaire_id, affaires(numero, nom)').eq('id', id).maybeSingle();
    const a = (data as { affaire_id: string; affaires: { numero: string; nom: string } | null } | null);
    if (!a) { toast.error('Chantier introuvable'); return; }
    setRenommer({ affaire: a.affaire_id, numero: a.affaires?.numero ?? '', nom: a.affaires?.nom ?? '' });
  }
  async function enregistrerNom() {
    if (!renommer || !renommer.nom.trim()) return;
    const { error } = await supabase.rpc('app_modifier_affaire', { _id: renommer.affaire, _patch: { nom: renommer.nom.trim() } });
    if (error) { toast.error('Renommage impossible', { description: error.message }); return; }
    toast.success('Nom du chantier corrigé'); setRenommer(null); await q.refetch();
  }
  async function exporter() {
    setExportBusy(true);
    try {
      const { creerExportPlanning, nomFichierPlanning } = await import('@/lib/imports/planning-equipes-export');
      const blob = await creerExportPlanning(dates, etapes, affectations, personnes);
      const url = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href = url; a.download = nomFichierPlanning(debut, ajouterJours(debut, 6), numeroSemaine(debut)); document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Export impossible'); }
    finally { setExportBusy(false); }
  }
  async function affecter(p: Personne, cible = ajout) {
    if (!cible) return;
    const { error } = await supabase.rpc('planning_terrain_affecter', { _etape: cible.etape, _jour: cible.jour, _personne: p.id, _origine: p.origine, _role: 'equipier' });
    if (error) toast.error(error.message); else { toast.success('Personne affectée'); setAjout(null); await q.refetch(); }
  }
  const caseAffectation = (a: Affectation, p: Personne) => {
    const e = etapeDe(a.etape_id); const s = statutDispo(p, a.date, dispos); const al = alerteDispo(s);
    return <button type="button" key={a.id} disabled={!droits.data || !a.etape_id} onClick={() => void ouvrirEtape(a.etape_id)} className={`flex w-full flex-wrap items-center justify-center gap-1 rounded bg-primary/10 px-1 py-0.5 text-primary enabled:hover:bg-primary/20 ${al ? ALERTE[al] : ''}`} title={al === 'rouge' ? 'Staffé alors que pas dispo' : al === 'orange' ? 'Staffé sans réponse dispo' : undefined}>
      <span>{e ? libelleCase(e, ETAPE_LABELS) : 'Étape'}</span>{a.role === 'chef_equipe' && <span className="rounded bg-primary px-1 text-[10px] text-primary-foreground">Chef</span>}
    </button>;
  };

  return <section className="space-y-4">
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">Planning équipes · semaine {numeroSemaine(debut)}</h2>
      <p className="text-sm text-muted-foreground">{plageSemaine(debut)}</p>
      <div className="flex flex-wrap items-center gap-2">
        <NavigationSemaine debut={debut} onChange={setDebut} choisir><Button variant="outline" size="sm" onClick={() => setDebut(lundiCourant())}>Cette semaine</Button></NavigationSemaine>
        {droits.data && <Button onClick={() => setEdition({ open: true, etape: null })}><Plus className="mr-2 size-4" />Ajouter un chantier</Button>}
        {q.data && <Button variant="outline" disabled={exportBusy || q.isFetching} onClick={() => void exporter()}><Download className="mr-2 size-4" />{exportBusy ? 'Export…' : 'Exporter'}</Button>}
      </div>
    </div>
    <div className="flex gap-2"><Button variant={vue === 'etape' ? 'default' : 'outline'} onClick={() => setVue('etape')}>Par étape</Button><Button variant={vue === 'personne' ? 'default' : 'outline'} onClick={() => setVue('personne')}>Par personne</Button></div>
    {q.error && <p role="alert" className="text-sm text-destructive">{q.error.message}</p>}

    {vue === 'etape' ? dates.map(jour => { const libres = dispoNonStaffes(personnes, jour, dispos, affectations); return <div key={jour} className="space-y-2 border-t border-border pt-3">
      <h3 className="font-semibold first-letter:uppercase">{titreJour(jour)}</h3>
      {libres.length > 0 && <div className="rounded border border-border bg-muted/40 p-2"><p className="mb-1 text-xs font-medium text-muted-foreground">Dispo non staffés · {libres.length}</p><div className="flex flex-wrap gap-1.5">{libres.map(p => {
        const contenu = <span className="flex flex-wrap items-center gap-1"><PastilleDispo statut={statutDispo(p, jour, dispos)} />{p.nom} {p.prenom}<BadgesQualifs p={p} /></span>;
        return droits.data && etapesDu(jour).length ? <Popover key={`${p.origine}:${p.id}`}><PopoverTrigger asChild><button type="button" className="rounded border border-border bg-background px-2 py-1 text-sm hover:bg-muted">{contenu}</button></PopoverTrigger><PopoverContent className="w-72 p-1"><p className="px-2 py-1 text-xs text-muted-foreground">Affecter à</p>{etapesDu(jour).map(e => <button key={e.id} type="button" className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted" onClick={() => void affecter(p, { etape: e.id, jour })}>{libelleCase(e, ETAPE_LABELS)} · {e.nom}</button>)}</PopoverContent></Popover> : <span key={`${p.origine}:${p.id}`} className="rounded border border-border bg-background px-2 py-1 text-sm">{contenu}</span>;
      })}</div></div>}
      {etapesDu(jour).map(e => { const aff = affectations.filter(a => a.etape_id === e.id && a.date === jour); const besoin = e.nb_personnes ?? 0; const manque = aff.length < besoin || aff.length === 0; return <div key={e.id} className={`rounded border p-3 ${aff.length === 0 ? 'border-destructive' : 'border-border'}`}>
        <div className="flex flex-wrap items-center gap-2"><strong>{e.numero} · {e.nom}</strong><span>{ETAPE_LABELS[e.type as keyof typeof ETAPE_LABELS] ?? e.type} · {horaire(e) || 'Heure non précisée'}</span>
          <span className={`rounded px-2 py-0.5 text-sm font-semibold ${aff.length === 0 ? 'bg-destructive text-destructive-foreground' : manque ? 'bg-warning/20 text-foreground' : 'bg-success/15 text-success'}`}>{aff.length === 0 && <AlertTriangle className="mr-1 inline size-3" />}{aff.length}/{besoin || '—'}</span>
          {droits.data && <Button size="sm" variant="outline" onClick={() => { setAjout({ etape: e.id, jour }); setRecherche(''); }}>Ajouter une personne</Button>}
          {droits.data && <Button size="sm" variant="ghost" onClick={() => void ouvrirEtape(e.id)}><Pencil className="mr-1 size-3" />Modifier / supprimer</Button>}
          {droits.data && <Button size="sm" variant="ghost" onClick={() => void ouvrirRenommer(e.id)}>Corriger le nom</Button>}</div>
        <p className="text-sm text-muted-foreground">{[e.lieu, e.responsable, e.note].filter(Boolean).join(' · ')}</p>
        <div className="mt-2 flex flex-wrap gap-2">{aff.map(a => { const p = personneDe(a); const al = p ? alerteDispo(statutDispo(p, jour, dispos)) : 'orange'; return <span key={a.id} className={`flex items-center gap-1 rounded bg-primary/10 px-2 py-1 text-sm text-primary ${al ? ALERTE[al] : ''}`}>{p ? <PastilleDispo statut={statutDispo(p, jour, dispos)} /> : null}{p ? `${p.nom} ${p.prenom}` : 'À vérifier'}{a.role === 'chef_equipe' && <span className="rounded bg-primary px-1 text-[10px] text-primary-foreground">Chef</span>}</span>; })}</div>
        {ajout?.etape === e.id && ajout.jour === jour && <div className="mt-3 space-y-2 rounded border border-border p-3"><div className="flex gap-2"><Input aria-label="Rechercher une personne terrain" placeholder="Nom, prénom ou poste" value={recherche} onChange={ev => setRecherche(ev.target.value)} /><Button variant="outline" onClick={() => setAjout(null)}>Fermer</Button></div>
          <div className="flex max-h-72 flex-col gap-1 overflow-auto">{trierCandidats(personnes.filter(p => p.actif && `${p.nom} ${p.prenom} ${p.poste ?? ''}`.toLocaleLowerCase('fr').includes(recherche.toLocaleLowerCase('fr'))), jour, dispos).map(p => {
            const s = statutDispo(p, jour, dispos); const deja = affectations.filter(a => a.date === jour && memePersonne(p, a)).map(a => etapeDe(a.etape_id)).filter(Boolean) as Etape[];
            return <button key={`${p.origine}:${p.id}`} type="button" onClick={() => void affecter(p)} className={`flex flex-wrap items-center gap-1.5 rounded border border-border px-2 py-1.5 text-left text-sm hover:bg-muted ${s === 'pas' ? 'opacity-50' : ''}`}><PastilleDispo statut={s} /><span className="font-medium">{p.nom} {p.prenom}</span><BadgesQualifs p={p} />{deja.length > 0 && <span className="text-xs text-warning">déjà sur {deja.map(d => `${d.numero} · ${ETAPE_LABELS[d.type as keyof typeof ETAPE_LABELS] ?? d.type}`).join(', ')}</span>}</button>;
          })}</div></div>}
      </div>; })}
    </div>; }) : <>
      {staffees.length === 0 && <p className="py-8 text-center text-muted-foreground">Aucune personne staffée cette semaine.</p>}
      <div className="hidden overflow-auto md:block">{staffees.length > 0 && <table className="w-full text-sm"><thead className="bg-muted/50"><tr><th className="sticky left-0 bg-background px-3 py-2 text-left">Personne</th>{dates.map(d => <th className="px-2 py-2" key={d}>{libelleJour(d)}</th>)}<th>Jours</th></tr></thead><tbody>{staffees.map(p => { const aff = affectations.filter(a => memePersonne(p, a)); return <tr key={`${p.origine}:${p.id}`} className="border-t border-border"><td className="sticky left-0 bg-background px-3 py-2 font-medium">{p.nom} {p.prenom}</td>{dates.map(d => <td key={d} className="space-y-1 p-1 text-center align-top"><PastilleDispo statut={statutDispo(p, d, dispos)} />{aff.filter(a => a.date === d).map(a => caseAffectation(a, p))}</td>)}<td className="text-center">{new Set(aff.map(a => a.date)).size}</td></tr>; })}</tbody></table>}</div>
      <div className="space-y-3 md:hidden">{dates.map(d => { const du = staffees.filter(p => affectations.some(a => a.date === d && memePersonne(p, a))); return <div key={d} className="rounded-lg border border-border bg-card p-3"><h3 className="mb-2 font-semibold first-letter:uppercase">{titreJour(d)} <span className="text-sm font-normal text-muted-foreground">· {du.length} pers.</span></h3>{du.length === 0 ? <p className="text-sm text-muted-foreground">Personne staffée.</p> : <ul className="space-y-2">{du.map(p => <li key={`${p.origine}:${p.id}`} className="space-y-1"><div className="flex items-center gap-2 text-sm font-medium"><PastilleDispo statut={statutDispo(p, d, dispos)} />{p.nom} {p.prenom}</div>{affectations.filter(a => a.date === d && memePersonne(p, a)).map(a => caseAffectation(a, p))}</li>)}</ul>}</div>; })}</div>
    </>}
    <EtapeDialog open={edition.open} onOpenChange={o => { setEdition(p => ({ ...p, open: o })); if (!o) void q.refetch(); }} etape={edition.etape} defaultDate={debut} />
    <Dialog open={!!renommer} onOpenChange={o => { if (!o) setRenommer(null); }}><DialogContent><DialogHeader><DialogTitle>Corriger le nom du chantier {renommer?.numero}</DialogTitle></DialogHeader><Input aria-label="Nom du chantier" value={renommer?.nom ?? ''} onChange={e => setRenommer(r => r && { ...r, nom: e.target.value })} /><DialogFooter><Button onClick={() => void enregistrerNom()}>Enregistrer</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}
