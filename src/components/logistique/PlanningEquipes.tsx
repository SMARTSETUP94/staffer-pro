import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { ajouterJours } from '@/lib/dispos';

type Personne = { id: string; nom: string; prenom: string; origine: 'employe' | 'dispos'; actif: boolean; poste: string | null };
type Affectation = { id: string; employe_id: string | null; dispos_intervenant_id: string | null; etape_id: string | null; date: string; affaire_id: string; historique: boolean };
type Etape = { id: string; date: string; fin: string; heure: string | null; type: string; nb_personnes: number | null; numero: string; nom: string; lieu: string | null; responsable: string | null };
type Semaine = { references: { personnes: Personne[]; affaires: { id: string; numero: string }[] }; affectations: Affectation[]; etapes: Etape[] };

export function PlanningEquipes() {
  const [debut, setDebut] = useState(() => { const d = new Date(); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(d); });
  const [recherche, setRecherche] = useState('');
  const [vue, setVue] = useState<'etape' | 'personne'>('etape');
  const [ajout, setAjout] = useState<{ etape: string; jour: string } | null>(null);
  const q = useQuery({ queryKey: ['planning-terrain', debut], queryFn: async () => { const { data, error } = await supabase.rpc('planning_terrain_semaine', { _debut: debut, _fin: ajouterJours(debut, 6) }); if (error) throw error; return data as unknown as Semaine; } });
  const droits = useQuery({ queryKey: ['planning-terrain-droits'], queryFn: async () => (await supabase.rpc('planning_terrain_ecrire_autorise')).data === true });
  const dates = Array.from({ length: 7 }, (_, i) => ajouterJours(debut, i));
  const personnes = q.data?.references.personnes ?? [];
  const affectations = q.data?.affectations ?? [];
  const personneDe = (a: Affectation) => personnes.find(p => p.id === (a.employe_id ?? a.dispos_intervenant_id));
  async function affecter(p: Personne) {
    if (!ajout) return;
    const { error } = await supabase.rpc('planning_terrain_affecter', { _etape: ajout.etape, _jour: ajout.jour, _personne: p.id, _origine: p.origine, _role: 'equipier' });
    if (error) toast.error(error.message); else { toast.success('Personne affectée'); setAjout(null); await q.refetch(); }
  }
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center gap-2"><h2 className="mr-auto text-xl font-semibold">Planning équipes</h2><Button variant="outline" onClick={() => setDebut(ajouterJours(debut, -7))}>Précédente</Button><Input className="w-40" type="date" aria-label="Début de semaine terrain" value={debut} onChange={e => setDebut(e.target.value)} /><Button variant="outline" onClick={() => setDebut(ajouterJours(debut, 7))}>Suivante</Button></div>
    <div className="flex gap-2"><Button variant={vue === 'etape' ? 'default' : 'outline'} onClick={() => setVue('etape')}>Par étape</Button><Button variant={vue === 'personne' ? 'default' : 'outline'} onClick={() => setVue('personne')}>Par personne</Button></div>
    {q.error && <p role="alert" className="text-sm text-destructive">{q.error.message}</p>}
    {vue === 'etape' ? dates.map(jour => <div key={jour} className="space-y-2 border-t border-border pt-3"><h3 className="font-semibold">{new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${jour}T12:00:00`))}</h3>{q.data?.etapes.filter(e => e.date <= jour && e.fin >= jour).map(e => { const aff = affectations.filter(a => a.etape_id === e.id && a.date === jour); return <div key={e.id} className="rounded border border-border p-3"><div className="flex flex-wrap items-center gap-2"><strong>{e.numero} · {e.nom}</strong><span>{e.type} · {e.heure?.slice(0, 5) ?? 'Heure non précisée'}</span><span className={aff.length >= (e.nb_personnes ?? 0) ? 'text-success' : 'text-warning'}>{aff.length}/{e.nb_personnes ?? '—'}</span>{droits.data && <Button size="sm" variant="outline" onClick={() => { setAjout({ etape: e.id, jour }); setRecherche(''); }}>Ajouter une personne</Button>}</div><p className="text-sm text-muted-foreground">{e.lieu} · {e.responsable}</p><div className="mt-2 flex flex-wrap gap-2">{aff.map(a => <span key={a.id} className="rounded bg-primary/10 px-2 py-1 text-sm text-primary">{personneDe(a)?.nom} {personneDe(a)?.prenom}</span>)}</div></div>; })}</div>) : <div className="overflow-auto"><table className="w-full min-w-[750px] text-sm"><thead><tr><th className="text-left">Personne</th>{dates.map(d => <th key={d}>{d.slice(5)}</th>)}<th>Jours</th></tr></thead><tbody>{personnes.filter(p => p.actif).map(p => { const aff = affectations.filter(a => (a.employe_id ?? a.dispos_intervenant_id) === p.id); return <tr key={p.id} className="border-t border-border"><td className="py-2">{p.nom} {p.prenom}</td>{dates.map(d => <td key={d} className="p-1 text-center">{aff.filter(a => a.date === d).map(a => <span key={a.id} className="block rounded bg-primary/10 px-1 text-primary">{q.data?.references.affaires.find(c => c.id === a.affaire_id)?.numero}{a.historique ? ' · historique' : ''}</span>)}</td>)}<td className="text-center">{new Set(aff.map(a => a.date)).size}</td></tr>; })}</tbody></table></div>}
    {ajout && <div className="space-y-2 rounded border border-border p-3"><div className="flex gap-2"><Input aria-label="Rechercher une personne terrain" placeholder="Nom, prénom ou poste" value={recherche} onChange={e => setRecherche(e.target.value)} /><Button variant="outline" onClick={() => setAjout(null)}>Fermer</Button></div><div className="flex max-h-64 flex-wrap gap-2 overflow-auto">{personnes.filter(p => p.actif && `${p.nom} ${p.prenom} ${p.poste}`.toLocaleLowerCase('fr').includes(recherche.toLocaleLowerCase('fr'))).map(p => <Button key={p.id} variant="outline" onClick={() => void affecter(p)}>{p.nom} {p.prenom}</Button>)}</div></div>}
  </section>;
}