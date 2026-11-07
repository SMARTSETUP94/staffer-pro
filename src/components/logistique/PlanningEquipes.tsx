import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { ajouterJours, numeroSemaine, plageSemaine, libelleJour } from '@/lib/dispos';
import { ChevronLeft, ChevronRight, CalendarDays, Download } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { personnesStaffees, memePersonne } from '@/lib/imports/planning-equipes';
import { EtapeDialog } from '@/components/logistique/EtapeDialog';
import type { EtapeLogistique } from '@/hooks/use-etapes-logistiques';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Pencil, Plus } from 'lucide-react';

type Personne = { id: string; nom: string; prenom: string; origine: 'employe' | 'dispos'; actif: boolean; poste: string | null };
type Affectation = { id: string; employe_id: string | null; dispos_intervenant_id: string | null; etape_id: string | null; date: string; affaire_id: string; historique: boolean };
type Etape = { id: string; date: string; fin: string; heure: string | null; type: string; nb_personnes: number | null; numero: string; nom: string; lieu: string | null; responsable: string | null };
type Semaine = { references: { personnes: Personne[]; affaires: { id: string; numero: string }[] }; affectations: Affectation[]; etapes: Etape[] };

export function PlanningEquipes() {
  const [debut, setDebut] = useState(() => { const d = new Date(); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(d); });
  const [recherche, setRecherche] = useState('');
  const [vue, setVue] = useState<'etape' | 'personne'>('etape');
  const [ajout, setAjout] = useState<{ etape: string; jour: string } | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportPret, setExportPret] = useState<Blob | null>(null);
  const [edition, setEdition] = useState<{ open: boolean; etape: EtapeLogistique | null }>({ open: false, etape: null });
  const [renommer, setRenommer] = useState<{ affaire: string; numero: string; nom: string } | null>(null);
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
    toast.success('Nom du chantier corrigé'); setRenommer(null); setExportPret(null); await q.refetch();
  }
  const changerSemaine = (date: string) => {
    if (!date) return;
    const d = new Date(`${date}T12:00:00`);
    setDebut(ajouterJours(date,-((d.getDay()+6)%7))); setExportPret(null);
  };
  const q = useQuery({ queryKey: ['planning-terrain', debut], queryFn: async () => { const { data, error } = await supabase.rpc('planning_terrain_semaine', { _debut: debut, _fin: ajouterJours(debut, 6) }); if (error) throw error; return data as unknown as Semaine; } });
  const droits = useQuery({ queryKey: ['planning-terrain-droits'], queryFn: async () => (await supabase.rpc('planning_terrain_ecrire_autorise')).data === true });
  const dates = Array.from({ length: 7 }, (_, i) => ajouterJours(debut, i));
  const personnes = q.data?.references.personnes ?? [];
  const affectations = q.data?.affectations ?? [];
  useEffect(() => { setExportPret(null); }, [q.data]);
  const staffees = personnesStaffees(personnes,affectations,debut,ajouterJours(debut,6));
  async function exporter() {
    if (exportPret) {
      const url = URL.createObjectURL(exportPret); const a = document.createElement('a');
      a.href=url; a.download=`Planning_${debut}_${ajouterJours(debut,6)}.xlsx`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),30000); return;
    }
    setExportBusy(true);
    try {
      const {creerExportPlanning} = await import('@/lib/imports/planning-equipes-export');
      setExportPret(await creerExportPlanning(dates,q.data?.etapes ?? [],affectations,personnes));
    } catch(e) { toast.error(e instanceof Error ? e.message : 'Export impossible'); }
    finally {setExportBusy(false);}
  }
  const personneDe = (a: Affectation) => personnes.find(p => p.id === (a.employe_id ?? a.dispos_intervenant_id));
  async function affecter(p: Personne) {
    if (!ajout) return;
    const { error } = await supabase.rpc('planning_terrain_affecter', { _etape: ajout.etape, _jour: ajout.jour, _personne: p.id, _origine: p.origine, _role: 'equipier' });
    if (error) toast.error(error.message); else { toast.success('Personne affectée'); setAjout(null); setExportPret(null); await q.refetch(); }
  }
  return <section className="space-y-4">
    <div className="space-y-3"><h2 className="text-xl font-semibold">Planning équipes · semaine {numeroSemaine(debut)}</h2><p className="text-sm text-muted-foreground">{plageSemaine(debut)}</p><div className="flex flex-wrap items-center gap-2"><Button variant="outline" size="icon" aria-label="Semaine précédente" title="Semaine précédente" onClick={() => changerSemaine(ajouterJours(debut, -7))}><ChevronLeft className="size-4" /></Button><Popover><PopoverTrigger asChild><Button variant="outline"><CalendarDays className="mr-2 size-4" />Choisir la semaine</Button></PopoverTrigger><PopoverContent className="w-64"><Input type="date" aria-label="Début de semaine terrain" value={debut} onChange={e => changerSemaine(e.target.value)} /></PopoverContent></Popover><Button variant="outline" size="icon" aria-label="Semaine suivante" title="Semaine suivante" onClick={() => changerSemaine(ajouterJours(debut, 7))}><ChevronRight className="size-4" /></Button><Button variant="ghost" onClick={() => changerSemaine(new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris'}).format(new Date()))}>Cette semaine</Button>{droits.data && <Button onClick={() => setEdition({ open: true, etape: null })}><Plus className="mr-2 size-4" />Ajouter un chantier</Button>}{droits.data && <Button variant="outline" disabled={exportBusy || q.isFetching} onClick={() => void exporter()}><Download className="mr-2 size-4" />{exportBusy ? 'Préparation…' : exportPret ? 'Télécharger le planning Excel' : 'Exporter le planning Excel'}</Button>}</div></div>
    <div className="flex gap-2"><Button variant={vue === 'etape' ? 'default' : 'outline'} onClick={() => setVue('etape')}>Par étape</Button><Button variant={vue === 'personne' ? 'default' : 'outline'} onClick={() => setVue('personne')}>Par personne</Button></div>
    {q.error && <p role="alert" className="text-sm text-destructive">{q.error.message}</p>}
    {vue === 'etape' ? dates.map(jour => <div key={jour} className="space-y-2 border-t border-border pt-3"><h3 className="font-semibold">{new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${jour}T12:00:00`))}</h3>{q.data?.etapes.filter(e => e.date <= jour && e.fin >= jour).map(e => { const aff = affectations.filter(a => a.etape_id === e.id && a.date === jour); return <div key={e.id} className="rounded border border-border p-3"><div className="flex flex-wrap items-center gap-2"><strong>{e.numero} · {e.nom}</strong><span>{e.type} · {e.heure?.slice(0, 5) ?? 'Heure non précisée'}</span><span className={aff.length >= (e.nb_personnes ?? 0) ? 'text-success' : 'text-warning'}>{aff.length}/{e.nb_personnes ?? '—'}</span>{droits.data && <Button size="sm" variant="outline" onClick={() => { setAjout({ etape: e.id, jour }); setRecherche(''); }}>Ajouter une personne</Button>}{droits.data && <Button size="sm" variant="ghost" onClick={() => void ouvrirEtape(e.id)}><Pencil className="mr-1 size-3" />Modifier / supprimer</Button>}{droits.data && <Button size="sm" variant="ghost" onClick={() => void ouvrirRenommer(e.id)}>Corriger le nom</Button>}</div><p className="text-sm text-muted-foreground">{e.lieu} · {e.responsable}</p><div className="mt-2 flex flex-wrap gap-2">{aff.map(a => <span key={a.id} className="rounded bg-primary/10 px-2 py-1 text-sm text-primary">{personneDe(a)?.nom} {personneDe(a)?.prenom}</span>)}</div></div>; })}</div>) : <div className="overflow-auto"><table className="w-full min-w-[750px] text-sm"><thead className="bg-muted/50"><tr><th className="sticky left-0 bg-background px-3 py-2 text-left">Personne</th>{dates.map(d => <th className="px-2 py-2" key={d}>{libelleJour(d)}</th>)}<th>Jours</th></tr></thead><tbody>{staffees.length === 0 && <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">Aucune personne staffée cette semaine.</td></tr>}{staffees.map(p => { const aff = affectations.filter(a => memePersonne(p,a)); return <tr key={`${p.origine}:${p.id}`} className="border-t border-border"><td className="sticky left-0 bg-background px-3 py-2 font-medium">{p.nom} {p.prenom}</td>{dates.map(d => <td key={d} className="p-1 text-center">{aff.filter(a => a.date === d).map(a => <button type="button" key={a.id} disabled={!droits.data || !a.etape_id} onClick={() => void ouvrirEtape(a.etape_id)} className="block w-full rounded bg-primary/10 px-1 text-primary enabled:hover:bg-primary/20">{q.data?.references.affaires.find(c => c.id === a.affaire_id)?.numero}{a.historique ? ' · historique' : ''}</button>)}</td>)}<td className="text-center">{new Set(aff.map(a => a.date)).size}</td></tr>; })}</tbody></table></div>}
    {ajout && <div className="space-y-2 rounded border border-border p-3"><div className="flex gap-2"><Input aria-label="Rechercher une personne terrain" placeholder="Nom, prénom ou poste" value={recherche} onChange={e => setRecherche(e.target.value)} /><Button variant="outline" onClick={() => setAjout(null)}>Fermer</Button></div><div className="flex max-h-64 flex-wrap gap-2 overflow-auto">{personnes.filter(p => p.actif && `${p.nom} ${p.prenom} ${p.poste}`.toLocaleLowerCase('fr').includes(recherche.toLocaleLowerCase('fr'))).map(p => <Button key={p.id} variant="outline" onClick={() => void affecter(p)}>{p.nom} {p.prenom}</Button>)}</div></div>}
    <EtapeDialog open={edition.open} onOpenChange={o => { setEdition(p => ({ ...p, open: o })); if (!o) { setExportPret(null); void q.refetch(); } }} etape={edition.etape} defaultDate={debut} />
    <Dialog open={!!renommer} onOpenChange={o => { if (!o) setRenommer(null); }}><DialogContent><DialogHeader><DialogTitle>Corriger le nom du chantier {renommer?.numero}</DialogTitle></DialogHeader><Input aria-label="Nom du chantier" value={renommer?.nom ?? ''} onChange={e => setRenommer(r => r && { ...r, nom: e.target.value })} /><DialogFooter><Button onClick={() => void enregistrerNom()}>Enregistrer</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}