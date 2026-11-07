import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { ajouterJours, libelleJour } from '@/lib/dispos';
import { MessageCircle, Phone, MapPin } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { personnesStaffees, memePersonne, statutDispo, alerteDispo, dispoNonStaffes, libelleCase, horaire, type DispoPlanning } from '@/lib/imports/planning-equipes';
import { equipeDe, equipeACopier, filtrerEtapes, messageWhatsappJour, missionsPersonne, type Alerte, type AffectationSemaine, type EtapeSemaine, type FiltresPlanning, type PersonneSemaine } from '@/lib/logistique/planning-semaine';
import { ETAPE_LABELS } from '@/lib/logistique/etapes';
import { EtapeDialog } from '@/components/logistique/EtapeDialog';
import type { EtapeLogistique } from '@/hooks/use-etapes-logistiques';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PastilleDispo, BadgesQualifs } from '@/components/logistique/PastilleDispo';
import { EtapeCarte, DND_TYPE, type CibleCopie, type DragPayload } from '@/components/logistique/EtapeCarte';
import { PanneauCompleter } from '@/components/logistique/PanneauCompleter';

export type Personne = PersonneSemaine & { actif: boolean; poste: string | null };
export type Affectation = AffectationSemaine & { historique: boolean };
export type Semaine = { references: { personnes: Personne[]; affaires: { id: string; numero: string }[] }; affectations: Affectation[]; etapes: EtapeSemaine[]; dispos: DispoPlanning[] };

export const lundiCourant = () => { const d = new Date(); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(d); };
export const titreJour = (jour: string) => new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${jour}T12:00:00`));
const ALERTE = { rouge: 'ring-2 ring-destructive', orange: 'ring-2 ring-warning' } as const;

/** Lecture partagée de la semaine terrain (étapes, affectations, personnes, dispos). */
export function usePlanningTerrain(debut: string, actif = true) {
  return useQuery({ queryKey: ['planning-terrain', debut], enabled: actif, queryFn: async () => { const { data, error } = await supabase.rpc('planning_terrain_semaine', { _debut: debut, _fin: ajouterJours(debut, 6) }); if (error) throw error; return data as unknown as Semaine; } });
}
export function useDroitsTerrain() {
  return useQuery({ queryKey: ['planning-terrain-droits'], queryFn: async () => (await supabase.rpc('planning_terrain_ecrire_autorise')).data === true });
}

async function copier(texte: string, quoi: string) {
  try { await navigator.clipboard.writeText(texte); toast.success(`${quoi} copié`, { description: 'Collez-le dans WhatsApp.' }); }
  catch { toast.error('Copie impossible', { description: texte.slice(0, 200) }); }
}

export function PlanningEquipes({ debut, vue, filtres, alertes, focus }: { debut: string; vue: 'equipes' | 'personnes' | 'chef'; filtres: FiltresPlanning; alertes: Alerte[]; focus?: { etape_id?: string; jour?: string } | null }) {
  const qc = useQueryClient();
  const [completer, setCompleter] = useState<{ etape: EtapeSemaine; jour: string } | null>(null);
  const [edition, setEdition] = useState<{ open: boolean; etape: EtapeLogistique | null }>({ open: false, etape: null });
  const [renommer, setRenommer] = useState<{ affaire: string; numero: string; nom: string } | null>(null);
  const q = usePlanningTerrain(debut);
  const droitsQ = useDroitsTerrain();
  const droits = !!droitsQ.data && vue !== 'chef';
  const dates = Array.from({ length: 7 }, (_, i) => ajouterJours(debut, i));
  const personnes = q.data?.references.personnes ?? [];
  const affectations = q.data?.affectations ?? [];
  const toutes = q.data?.etapes ?? [];
  const dispos = q.data?.dispos ?? [];
  const etapes = filtrerEtapes(toutes, filtres, { affectations, personnes, alertes });
  const etapesDu = (jour: string) => etapes.filter(e => e.date <= jour && e.fin >= jour).sort((a, b) => (a.heure ?? '99').localeCompare(b.heure ?? '99'));
  const etapeDe = (id: string | null) => toutes.find(e => e.id === id);
  const rafraichir = async () => { await qc.invalidateQueries({ queryKey: ['planning-terrain'] }); await qc.invalidateQueries({ queryKey: ['etapes-logistiques'] }); };

  useEffect(() => {
    if (!focus?.etape_id || !q.data) return;
    const el = document.getElementById(`etape-${focus.etape_id}-${focus.jour}`) ?? document.querySelector(`[id^="etape-${focus.etape_id}-"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focus, q.data]);

  async function ouvrirEtape(id: string | null) {
    if (!id) return;
    const { data, error } = await supabase.from('affaire_etapes_logistiques').select('*').eq('id', id).maybeSingle();
    if (error || !data) { toast.error('Étape introuvable'); return; }
    setEdition({ open: true, etape: data as EtapeLogistique });
  }
  function ouvrirRenommer(e: EtapeSemaine) { setRenommer({ affaire: e.affaire_id, numero: e.numero, nom: e.nom }); }
  async function enregistrerNom() {
    if (!renommer || !renommer.nom.trim()) return;
    const { error } = await supabase.rpc('app_modifier_affaire', { _id: renommer.affaire, _patch: { nom: renommer.nom.trim() } });
    if (error) { toast.error('Renommage impossible', { description: error.message }); return; }
    toast.success('Nom du chantier corrigé'); setRenommer(null); await rafraichir();
  }
  async function affecterUn(p: PersonneSemaine, etape: string, jour: string, role: 'chef_equipe' | 'equipier' = 'equipier') {
    const { error } = await supabase.rpc('planning_terrain_affecter', { _etape: etape, _jour: jour, _personne: p.id, _origine: p.origine, _role: role });
    if (error) throw new Error(error.message);
  }
  async function affecter(p: PersonneSemaine, etape: string, jour: string) {
    try { await affecterUn(p, etape, jour); toast.success(`${p.nom} ${p.prenom} affecté`); await rafraichir(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Affectation impossible'); }
  }
  async function deplacer(id: string, cible: EtapeSemaine, jour: string) {
    const a = affectations.find(x => x.id === id); if (!a) return;
    if (a.date !== jour) { toast.error('Déplacement possible seulement le même jour'); return; }
    if (a.etape_id === cible.id) return;
    if (affectations.some(x => x.etape_id === cible.id && x.date === jour && (a.employe_id ? x.employe_id === a.employe_id : x.dispos_intervenant_id === a.dispos_intervenant_id))) { toast.error('Déjà sur cette étape'); return; }
    const { error } = await supabase.from('assignations').update({ etape_logistique_id: cible.id, affaire_id: cible.affaire_id, heure_debut: cible.heure, heure_fin: cible.heure_fin ?? null }).eq('id', id);
    if (error) toast.error('Déplacement impossible', { description: error.message }); else { toast.success('Personne déplacée'); await rafraichir(); }
  }
  async function surDrop(d: DragPayload, e: EtapeSemaine, jour: string) {
    if (d.kind === 'move') return deplacer(d.affectation, e, jour);
    const p = personnes.find(p => p.id === d.id && p.origine === d.origine); if (p) await affecter(p, e.id, jour);
  }
  async function copierEquipe(source: EtapeSemaine, jour: string, cibles: CibleCopie[], equipeSource = equipeDe(source, jour, affectations, personnes)) {
    let n = 0; const erreurs: string[] = [];
    for (const c of cibles) for (const x of equipeACopier(equipeSource, c.etape, c.jour, affectations)) {
      try { await affecterUn(x.p, c.etape.id, c.jour, x.role as 'chef_equipe' | 'equipier'); n++; } catch (e) { erreurs.push(`${x.p.nom} : ${e instanceof Error ? e.message : ''}`); }
    }
    if (erreurs.length) toast.warning(`${n} ajout(s), ${erreurs.length} refus`, { description: erreurs.slice(0, 3).join('\n') }); else toast.success(n ? `${n} affectation(s) copiée(s)` : 'Équipe déjà en place, rien à copier');
    await rafraichir();
  }
  async function semaineDerniere(e: EtapeSemaine, jour: string) {
    const avant = ajouterJours(jour, -7);
    const { data, error } = await supabase.rpc('planning_terrain_semaine', { _debut: avant, _fin: avant });
    if (error) { toast.error(error.message); return; }
    const s = data as unknown as Semaine;
    const src = s.etapes.filter(x => x.affaire_id === e.affaire_id && x.type === e.type && x.date <= avant && x.fin >= avant);
    const eq = src.flatMap(x => equipeDe(x, avant, s.affectations, s.references.personnes));
    if (!eq.length) { toast.info('Aucune équipe trouvée sur la même opération 7 jours avant'); return; }
    await copierEquipe(e, jour, [{ etape: e, jour }], eq);
  }
  async function majAffectation(a: AffectationSemaine, patch: { statut_confirmation?: 'en_attente' | 'confirmee' | 'refusee'; role_terrain?: string }) {
    const { error } = await supabase.from('assignations').update({ ...patch, ...(patch.statut_confirmation === 'confirmee' ? { confirmee_le: new Date().toISOString() } : {}) }).eq('id', a.id);
    if (error) toast.error('Modification impossible', { description: error.message }); else await rafraichir();
  }
  const ciblesCopie = (e: EtapeSemaine, jour: string): CibleCopie[] => dates.filter(d => d > jour).flatMap(d => toutes.filter(x => x.date <= d && x.fin >= d && (x.id === e.id || (x.affaire_id === e.affaire_id && x.type === e.type))).map(x => ({ etape: x, jour: d })));

  const caseAffectation = (a: Affectation, p: Personne) => {
    const e = etapeDe(a.etape_id); const al = alerteDispo(statutDispo(p, a.date, dispos));
    return <button type="button" key={a.id} disabled={!droits || !a.etape_id} onClick={() => void ouvrirEtape(a.etape_id)} className={`flex w-full flex-wrap items-center justify-center gap-1 rounded bg-primary/10 px-1 py-0.5 text-primary enabled:hover:bg-primary/20 ${al ? ALERTE[al] : ''}`} title={al === 'rouge' ? 'Staffé alors que pas dispo' : al === 'orange' ? 'Staffé sans réponse dispo' : undefined}>
      <span>{e ? libelleCase(e, ETAPE_LABELS) : 'Étape'}</span>{a.role === 'chef_equipe' && <span className="rounded bg-primary px-1 text-[10px] text-primary-foreground">Chef</span>}
    </button>;
  };

  if (q.error) return <p role="alert" className="text-sm text-destructive">{q.error.message}</p>;
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Chargement…</p>;

  if (vue === 'chef') return <VueChef dates={dates} etapes={toutes} affectations={affectations} personnes={personnes} />;

  if (vue === 'equipes') return <section className="space-y-4">
    {dates.map(jour => {
      const libres = dispoNonStaffes(personnes, jour, dispos, affectations); const du = etapesDu(jour);
      return <div key={jour} className="space-y-2 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold first-letter:uppercase">{titreJour(jour)}</h3>
          <Button size="sm" variant="outline" onClick={() => void copier(messageWhatsappJour(jour, toutes, affectations, personnes, ETAPE_LABELS), 'Message du jour')}><MessageCircle className="mr-1 size-3" />Copier le message WhatsApp</Button></div>
        {libres.length > 0 && <div className="rounded border border-border bg-muted/40 p-2"><p className="mb-1 text-xs font-medium text-muted-foreground">Dispo non staffés · {libres.length}{droits && <span className="hidden md:inline"> · glissez un nom sur une carte</span>}</p><div className="flex flex-wrap gap-1.5">{libres.map(p => {
          const contenu = <span className="flex flex-wrap items-center gap-1"><PastilleDispo statut={statutDispo(p, jour, dispos)} />{p.nom} {p.prenom}<BadgesQualifs p={p} /></span>;
          const drag = droits ? { draggable: true, onDragStart: (ev: React.DragEvent) => { ev.dataTransfer.setData(DND_TYPE, JSON.stringify({ kind: 'libre', id: p.id, origine: p.origine } satisfies DragPayload)); ev.dataTransfer.effectAllowed = 'copy'; } } : {};
          return droits && du.length ? <Popover key={`${p.origine}:${p.id}`}><PopoverTrigger asChild><button type="button" {...drag} className="cursor-grab rounded border border-border bg-background px-2 py-1 text-sm hover:bg-muted">{contenu}</button></PopoverTrigger><PopoverContent className="w-72 p-1"><p className="px-2 py-1 text-xs text-muted-foreground">Affecter à</p>{du.map(e => <button key={e.id} type="button" className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted" onClick={() => void affecter(p, e.id, jour)}>{libelleCase(e, ETAPE_LABELS)} · {e.nom}</button>)}</PopoverContent></Popover> : <span key={`${p.origine}:${p.id}`} className="rounded border border-border bg-background px-2 py-1 text-sm">{contenu}</span>;
        })}</div></div>}
        {du.length === 0 && <p className="text-sm text-muted-foreground">Aucune étape.</p>}
        <div className="grid gap-2 lg:grid-cols-2">{du.map(e => <EtapeCarte key={e.id} e={e} jour={jour} equipe={equipeDe(e, jour, affectations, personnes)} dispos={dispos} droits={droits}
          focus={focus?.etape_id === e.id && (!focus.jour || focus.jour === jour)} cibles={ciblesCopie(e, jour)}
          onCompleter={() => setCompleter({ etape: e, jour })} onModifier={() => void ouvrirEtape(e.id)} onRenommer={() => ouvrirRenommer(e)}
          onDrop={d => void surDrop(d, e, jour)} onCopier={c => void copierEquipe(e, jour, c)} onSemaineDerniere={() => void semaineDerniere(e, jour)}
          onConfirmation={(a, s) => void majAffectation(a, { statut_confirmation: s as 'en_attente' | 'confirmee' | 'refusee' })} onRole={(a, r) => void majAffectation(a, { role_terrain: r })} />)}</div>
      </div>;
    })}
    <PanneauCompleter cible={completer} onClose={() => setCompleter(null)} personnes={personnes} dispos={dispos} affectations={affectations} etapes={toutes} onAjouter={async p => { if (completer) await affecter(p, completer.etape.id, completer.jour); }} />
    <EtapeDialog open={edition.open} onOpenChange={o => { setEdition(p => ({ ...p, open: o })); if (!o) void rafraichir(); }} etape={edition.etape} defaultDate={debut} />
    <Dialog open={!!renommer} onOpenChange={o => { if (!o) setRenommer(null); }}><DialogContent><DialogHeader><DialogTitle>Corriger le nom du chantier {renommer?.numero}</DialogTitle></DialogHeader><Input aria-label="Nom du chantier" value={renommer?.nom ?? ''} onChange={e => setRenommer(r => r && { ...r, nom: e.target.value })} /><DialogFooter><Button onClick={() => void enregistrerNom()}>Enregistrer</Button></DialogFooter></DialogContent></Dialog>
  </section>;

  const visibles = new Set(etapes.map(e => e.id));
  const affVisibles = affectations.filter(a => a.etape_id && visibles.has(a.etape_id));
  const staffees = personnesStaffees(personnes, affVisibles, debut, ajouterJours(debut, 6));
  const boutonMissions = (p: Personne) => <Button size="sm" variant="ghost" className="h-6 px-1" aria-label={`Copier les missions de ${p.nom} ${p.prenom}`} title="Copier ses missions de la semaine" onClick={() => void copier(missionsPersonne(p, dates, toutes, affectations, ETAPE_LABELS), 'Missions')}><MessageCircle className="size-3" /></Button>;
  return <section className="space-y-4">
    {staffees.length === 0 && <p className="py-8 text-center text-muted-foreground">Aucune personne staffée cette semaine.</p>}
    <div className="hidden overflow-auto md:block">{staffees.length > 0 && <table className="w-full text-sm"><thead className="bg-muted/50"><tr><th className="sticky left-0 bg-background px-3 py-2 text-left">Personne</th>{dates.map(d => <th className="px-2 py-2" key={d}>{libelleJour(d)}</th>)}<th>Jours</th></tr></thead><tbody>{staffees.map(p => { const aff = affVisibles.filter(a => memePersonne(p, a)); return <tr key={`${p.origine}:${p.id}`} className="border-t border-border"><td className="sticky left-0 bg-background px-3 py-2 font-medium"><span className="flex items-center gap-1">{p.nom} {p.prenom}{boutonMissions(p)}</span></td>{dates.map(d => <td key={d} className="space-y-1 p-1 text-center align-top"><PastilleDispo statut={statutDispo(p, d, dispos)} />{aff.filter(a => a.date === d).map(a => caseAffectation(a, p))}</td>)}<td className="text-center">{new Set(aff.map(a => a.date)).size}</td></tr>; })}</tbody></table>}</div>
    <div className="space-y-3 md:hidden">{dates.map(d => { const du = staffees.filter(p => affVisibles.some(a => a.date === d && memePersonne(p, a))); return <div key={d} className="rounded-lg border border-border bg-card p-3"><h3 className="mb-2 font-semibold first-letter:uppercase">{titreJour(d)} <span className="text-sm font-normal text-muted-foreground">· {du.length} pers.</span></h3>{du.length === 0 ? <p className="text-sm text-muted-foreground">Personne staffée.</p> : <ul className="space-y-2">{du.map(p => <li key={`${p.origine}:${p.id}`} className="space-y-1"><div className="flex items-center gap-2 text-sm font-medium"><PastilleDispo statut={statutDispo(p, d, dispos)} />{p.nom} {p.prenom}{boutonMissions(p)}</div>{affVisibles.filter(a => a.date === d && memePersonne(p, a)).map(a => caseAffectation(a, p))}</li>)}</ul>}</div>; })}</div>
    <EtapeDialog open={edition.open} onOpenChange={o => { setEdition(p => ({ ...p, open: o })); if (!o) void rafraichir(); }} etape={edition.etape} defaultDate={debut} />
  </section>;
}

/** Vue chef d'équipe (lecture seule) : ses étapes, son équipe, téléphones cliquables, adresse en lien carte. */
function VueChef({ dates, etapes, affectations, personnes }: { dates: string[]; etapes: EtapeSemaine[]; affectations: Affectation[]; personnes: Personne[] }) {
  const [portee, setPortee] = useState<'jour' | 'semaine'>('jour');
  const moi = useQuery({ queryKey: ['mon-employe'], queryFn: async () => { const { data: u } = await supabase.auth.getUser(); if (!u.user) return null; const { data } = await supabase.from('employes').select('id').eq('profile_id', u.user.id).maybeSingle(); return data?.id ?? null; } });
  const aujourdhui = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date());
  const jours = portee === 'jour' ? [dates.includes(aujourdhui) ? aujourdhui : dates[0]] : dates;
  const mes = (jour: string) => etapes.filter(e => e.date <= jour && e.fin >= jour && affectations.some(a => a.etape_id === e.id && a.date === jour && a.employe_id === moi.data));
  if (moi.isLoading) return <p className="text-sm text-muted-foreground">Chargement…</p>;
  if (!moi.data) return <p className="text-sm text-muted-foreground">Votre compte n’est relié à aucune fiche employé : aucune mission à afficher.</p>;
  return <section className="space-y-3">
    <div className="flex gap-2"><Button size="sm" variant={portee === 'jour' ? 'default' : 'outline'} onClick={() => setPortee('jour')}>Ma journée</Button><Button size="sm" variant={portee === 'semaine' ? 'default' : 'outline'} onClick={() => setPortee('semaine')}>Ma semaine</Button></div>
    {jours.map(jour => <div key={jour} className="space-y-2"><h3 className="font-semibold first-letter:uppercase">{titreJour(jour)}</h3>
      {mes(jour).length === 0 ? <p className="text-sm text-muted-foreground">Aucune mission.</p> : mes(jour).map(e => <article key={e.id} className="space-y-2 rounded-lg border border-border bg-card p-3">
        <p className="font-semibold">{e.numero} · {ETAPE_LABELS[e.type as keyof typeof ETAPE_LABELS] ?? e.type} · {horaire(e) || 'horaire à confirmer'}</p>
        <p className="text-sm">{e.nom}</p>
        {e.lieu && <a className="flex items-center gap-1 text-sm text-primary underline" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.lieu)}`} target="_blank" rel="noreferrer"><MapPin className="size-4" />{e.lieu}</a>}
        {e.note && <p className="text-sm text-muted-foreground">{e.note}</p>}
        <ul className="space-y-1">{equipeDe(e, jour, affectations, personnes).map(({ a, p }) => <li key={a.id} className="flex flex-wrap items-center gap-2 text-sm"><span className="font-medium">{p ? `${p.nom} ${p.prenom}` : 'À vérifier'}</span>{a.role === 'chef_equipe' && <span className="rounded bg-primary px-1 text-[10px] text-primary-foreground">Chef</span>}{p?.telephone && <a className="flex items-center gap-1 text-primary underline" href={`tel:${p.telephone.replace(/\s/g, '')}`}><Phone className="size-3" />{p.telephone}</a>}</li>)}</ul>
      </article>)}</div>)}
  </section>;
}
