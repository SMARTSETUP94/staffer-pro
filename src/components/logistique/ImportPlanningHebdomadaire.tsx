import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, Check, ChevronsUpDown } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { analyserPlanningHebdomadaire } from '@/lib/server-fns/planning-import.functions';
import { candidatsPersonne, passagesMultiples, rattachementBloc, verifierPlanning, type InterventionLue, type ReferencesPlanning } from '@/lib/imports/planning-hebdomadaire';
import { ETAPE_LABELS, ETAPE_TYPES, type EtapeType } from '@/lib/logistique/etapes';
import { cleNomTerrain } from '@/lib/imports/affectations-consolide';
import { lirePlanningExcel, statutDispo, alerteDispo, type DispoPlanning, type LectureDeterministe } from '@/lib/imports/planning-equipes';
import { PastilleDispo } from '@/components/logistique/PastilleDispo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from '@/components/ui/command';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

function ChoixCherchable({ label, value, options, onChange }: { label: string; value: string; options: { id: string; label: string }[]; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button variant="outline" role="combobox" aria-label={label} aria-expanded={open} className="w-full justify-between"><span className="truncate">{options.find(o => o.id === value)?.label ?? label}</span><ChevronsUpDown className="ml-2 size-4 shrink-0" /></Button></PopoverTrigger><PopoverContent className="w-80 max-w-[90vw] p-0"><Command><CommandInput placeholder="Rechercher…" /><CommandList><CommandEmpty>Aucun résultat</CommandEmpty>{options.map(o => <CommandItem key={o.id} value={o.label} onSelect={() => { onChange(o.id); setOpen(false); }}><Check className={`mr-2 size-4 ${value === o.id ? 'opacity-100' : 'opacity-0'}`} />{o.label}</CommandItem>)}</CommandList></Command></PopoverContent></Popover>;
}

export function ImportPlanningHebdomadaire() {
  const analyser = useServerFn(analyserPlanningHebdomadaire);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocs, setBlocs] = useState<InterventionLue[]>([]);
  const [refs, setRefs] = useState<ReferencesPlanning>({ personnes: [], affaires: [] });
  const [personnes, setPersonnes] = useState<Record<string, string>>({});
  const [affaires, setAffaires] = useState<Record<string, string>>({});
  const [erreur, setErreur] = useState('');
  const [fichier, setFichier] = useState('');
  const [bilan, setBilan] = useState('');
  const [valide, setValide] = useState(false);
  const [etapes, setEtapes] = useState<{ id: string; affaire_id: string; type: string; date: string; fin: string; heure: string | null }[]>([]);
  const [choixEtapes, setChoixEtapes] = useState<Record<number, string>>({});
  const [creations, setCreations] = useState<Record<number, boolean>>({});
  const [dispos, setDispos] = useState<DispoPlanning[]>([]);
  const [lecture, setLecture] = useState('');
  async function lire(file: File) {
    setBusy(true); setErreur(''); setBlocs([]); setBilan(''); setValide(false); setChoixEtapes({}); setCreations({});
    try {
      if (file.size > 15 * 1024 * 1024) throw new Error('Fichier trop volumineux (15 Mo maximum).');
      const base64 = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1] ?? ''); r.onerror = () => reject(new Error('Lecture impossible')); r.readAsDataURL(file); });
      let lu: LectureDeterministe | null = null;
      if (/\.xlsx$/i.test(file.name)) {
        const { lireClasseur } = await import('@/lib/imports/planning-equipes-export');
        lu = lirePlanningExcel(await lireClasseur(await file.arrayBuffer()), ETAPE_LABELS, cleNomTerrain);
      }
      const result = lu ? verifierPlanning(lu.interventions) : await analyser({ data: { name: file.name, base64 } });
      if (result.erreurs.length) throw new Error(result.erreurs.join('\n'));
      setLecture(lu ? 'Lecture directe du format planning (sans IA)' : 'Lecture assistée');
      const reference = await supabase.rpc('planning_terrain_references');
      if (reference.error) throw reference.error;
      const r = reference.data as unknown as ReferencesPlanning;
      setRefs(r); setPersonnes(lu?.personnes ?? {}); setAffaires(lu?.affaires ?? {}); setFichier(file.name);
      if (lu) { const cle = (b: InterventionLue) => [b.date, b.code, b.type, b.heure ?? '', b.lieu.trim().toLocaleLowerCase('fr')].join('|'); const ordre = new Map(lu.interventions.map((b, i) => [cle(b), lu!.etapes[i]])); setChoixEtapes(Object.fromEntries(result.interventions.map((b, i) => [i, ordre.get(cle(b))]).filter(([, v]) => v))); }
      const debut = result.interventions[0]?.date;
      const fin = result.interventions.at(-1)?.date;
      if (debut && fin) {
        if (Math.round((Date.parse(fin) - Date.parse(debut)) / 86400000) > 31) throw new Error('Importez au maximum un mois à la fois.');
        const week = await supabase.rpc('planning_terrain_semaine', { _debut: debut, _fin: fin });
        if (week.error) throw week.error;
        const w = week.data as unknown as { etapes: typeof etapes; dispos: DispoPlanning[] };
        setEtapes(w.etapes); setDispos(w.dispos ?? []);
      }
      setBlocs(result.interventions);
    } catch (e) { setErreur(e instanceof Error ? e.message : 'Lecture impossible'); }
    finally { setBusy(false); }
  }
  const personneDe = (nom: string) => refs.personnes.find(p => `${p.origine}:${p.id}` === personnes[cleNomTerrain(nom)]) ?? (() => { const c = candidatsPersonne(nom, refs.personnes); return c.length === 1 ? c[0] : undefined; })();
  const affaireDe = (code: string) => affaires[code] ?? refs.affaires.find(a => a.numero === code)?.id;
  const total = blocs.reduce((n, b) => n + b.personnes.length, 0);
  const manquants = blocs.reduce((n, b) => n + b.personnes.filter(p => !personneDe(p)).length + (affaireDe(b.code) ? 0 : 1), 0);
  const rattachement = (b: InterventionLue, i: number) => rattachementBloc(b, affaireDe(b.code), etapes, choixEtapes[i]);
  // Aucune création silencieuse : choix obligatoire si ambigu, confirmation explicite si nouvelle étape ou même intervention proposée.
  const ambigus = blocs.some((b, i) => { const r = rattachement(b, i); return r.etat === 'choix' || ((r.etat === 'nouvelle' || r.etat === 'meme_intervention') && !creations[i]); });
  const libelleEtape = (e: { type: string; date: string; heure: string | null }) => `${ETAPE_LABELS[e.type as EtapeType] ?? e.type} · ${e.date.split('-').reverse().join('/')} · ${e.heure ? e.heure.slice(0, 5) : 'heure inconnue'}`;
  const lienCreation = (b: InterventionLue) => `/affaires?${new URLSearchParams({ creer_numero: b.code, creer_nom: b.chantier, creer_lieu: b.lieu }).toString()}`;
  async function actualiserReferences() { const r = await supabase.rpc('planning_terrain_references'); if (!r.error) setRefs(r.data as unknown as ReferencesPlanning); }
  const modifier = (index: number, patch: Partial<InterventionLue>) => { setBlocs(v => v.map((b, i) => i === index ? { ...b, ...patch } : b)); setValide(false); };
  async function enregistrer() {
    setBusy(true); setErreur('');
    try {
      const check = verifierPlanning(blocs);
      if (check.erreurs.length || manquants || ambigus || !valide) throw new Error(check.erreurs.join('\n') || 'Terminez les rattachements (étape à choisir ou création à confirmer) et validez l’aperçu.');
      const payload = blocs.map((b, index) => ({ affaire_id: affaireDe(b.code), date: b.date, type: b.type, heure: b.heure, heure_fin: b.heure_fin, lieu: b.lieu, responsable: b.responsable, note: b.note, etape_id: (() => { const r = rattachement(b, index); return r.etat === 'rattache' ? r.etape.id : null; })(), creer: !!creations[index] && rattachement(b, index).etat !== 'rattache',
        personnes: b.personnes.map(nom => { const p = personneDe(nom); if (!p) throw new Error(`Personne non rapprochée : ${nom}`); return { id: p.id, origine: p.origine, nom_original: nom }; }) }));
      const result = await supabase.rpc('planning_terrain_import_semaine', { _blocs: payload, _fichier: fichier });
      if (result.error) throw new Error(/Date et personnes/.test(result.error.message) ? 'Date manquante, aucune personne, texte trop long ou opération invalide.' : result.error.message);
      const r = result.data as unknown as { ajoutes: number; existants: number; etapes_creees: number };
      setBilan(`${r.ajoutes} affectations ajoutées · ${r.existants} déjà présentes · ${r.etapes_creees} étapes créées`);
      await queryClient.invalidateQueries({ queryKey: ['planning-terrain'] });
      await queryClient.invalidateQueries({ queryKey: ['etapes-logistiques'] });
      toast.success('Planning enregistré'); setValide(false);
    } catch (e) { setErreur(e instanceof Error ? e.message : 'Enregistrement impossible'); }
    finally { setBusy(false); }
  }
  return <><Button variant="outline" onClick={() => setOpen(true)}><Upload className="mr-2 size-4" />Importer un planning Excel/PDF</Button><Dialog open={open} onOpenChange={o => { if (!busy) setOpen(o); }}><DialogContent className="max-h-[92vh] max-w-[calc(100vw-1rem)] grid-cols-[minmax(0,1fr)] overflow-x-hidden overflow-y-auto p-4 sm:max-w-4xl sm:p-6"><DialogHeader><DialogTitle>Importer un planning</DialogTitle></DialogHeader>
    <Label htmlFor="planning-fichier">Planning Excel (.xlsx) ou PDF</Label><Input id="planning-fichier" type="file" accept=".xlsx,.pdf" disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f) void lire(f); }} />
    {busy && <p role="status">{blocs.length ? 'Enregistrement…' : 'Lecture du planning…'}</p>}{erreur && <p role="alert" className="whitespace-pre-line text-sm text-destructive">{erreur}</p>}
    {blocs.length > 0 && <>{lecture && <p className="text-xs text-muted-foreground">{lecture}</p>}<p className="font-medium">{blocs.length} interventions · {total} affectations · {manquants} rattachements manquants</p>
      {passagesMultiples(blocs).length > 0 && <details className="text-sm text-warning"><summary>Plusieurs interventions le même jour : {passagesMultiples(blocs).length} personnes à vérifier</summary>{passagesMultiples(blocs).map(v => <p key={`${v.date}-${v.nom}`}>{v.date} · {v.nom} · {v.nombre} interventions</p>)}</details>}
      {blocs.map((b, i) => <section key={i} className="space-y-3 border-t border-border pt-4"><div className="grid gap-2 sm:grid-cols-3"><div><Label>Date</Label><Input type="date" aria-label={`Date intervention ${i + 1}`} value={b.date} disabled={busy} onChange={e => modifier(i, { date: e.target.value })} /></div><div><Label>Opération</Label><Select value={b.type} disabled={busy} onValueChange={v => modifier(i, { type: v as EtapeType })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ETAPE_TYPES.map(t => <SelectItem key={t} value={t}>{ETAPE_LABELS[t]}</SelectItem>)}</SelectContent></Select></div><div><Label>Heure de début</Label><Input type="time" aria-label={`Heure intervention ${i + 1}`} disabled={busy} value={b.heure ?? ''} onChange={e => modifier(i, { heure: e.target.value || null })} /></div></div>
      <ChoixCherchable label={`${b.code} · ${b.chantier} — rattacher le chantier`} value={affaireDe(b.code) ?? ''} options={refs.affaires.map(a => ({ id: a.id, label: `${a.numero} · ${a.nom}` }))} onChange={id => { setAffaires(v => ({ ...v, [b.code]: id })); setValide(false); }} />
      <div className="grid gap-2 sm:grid-cols-2"><div><Label>Lieu</Label><Input value={b.lieu} disabled={busy} onChange={e => modifier(i, { lieu: e.target.value })} /></div><div><Label>Responsable</Label><Input value={b.responsable} disabled={busy} onChange={e => modifier(i, { responsable: e.target.value })} /></div></div><Label>Commentaires / horaires à confirmer</Label><Input value={b.note} disabled={busy} onChange={e => modifier(i, { note: e.target.value })} />
      {(() => { const r = rattachement(b, i); const choisir = (v: string) => { setChoixEtapes(c => ({ ...c, [i]: v })); setValide(false); };
        if (r.etat === 'chantier_inconnu') return <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning p-2 text-sm"><span className="text-warning">Chantier {b.code} introuvable : rien ne sera créé automatiquement.</span><Button size="sm" variant="outline" asChild><a href={lienCreation(b)} target="_blank" rel="noreferrer">Créer le chantier</a></Button><Button size="sm" variant="ghost" onClick={() => void actualiserReferences()}>Actualiser la liste</Button></div>;
        if (r.etat === 'rattache') return <div className="flex flex-wrap items-center gap-2 rounded-md border border-success p-2 text-sm"><span className="font-medium text-success">Rattaché à : {libelleEtape(r.etape)}</span>{r.choisi && <Button size="sm" variant="ghost" onClick={() => choisir('')}>Changer</Button>}</div>;
        if (r.etat === 'choix') return <div className="space-y-1 rounded-md border border-warning p-2"><p className="text-sm text-warning">Plusieurs étapes possibles : choix obligatoire.</p><Select value="" disabled={busy} onValueChange={choisir}><SelectTrigger aria-label={`Étape existante intervention ${i + 1}`}><SelectValue placeholder="Choisir l’étape" /></SelectTrigger><SelectContent>{r.candidats.map(e => <SelectItem key={e.id} value={e.id}>{libelleEtape(e)}</SelectItem>)}</SelectContent></Select></div>;
        return <div className="space-y-2 rounded-md border border-warning p-2 text-sm">{r.etat === 'meme_intervention' && <><p className="text-warning">Même intervention ? Une étape de ce chantier existe ce jour avec une autre opération.</p><div className="flex flex-wrap gap-2">{r.candidats.map(e => <Button key={e.id} size="sm" variant="outline" disabled={busy} onClick={() => choisir(e.id)}>Rattacher à : {libelleEtape(e)}</Button>)}</div></>}<label className="flex items-center gap-2"><input type="checkbox" checked={!!creations[i]} disabled={busy} onChange={e => { setCreations(c => ({ ...c, [i]: e.target.checked })); setValide(false); }} /><span className="font-medium">Nouvelle étape à créer</span> ({ETAPE_LABELS[b.type]} · {b.date.split('-').reverse().join('/')})</label></div>; })()}
      <Label>Noms du fichier (une personne par ligne)</Label><textarea aria-label={`Noms intervention ${i + 1}`} className="min-h-24 w-full rounded-md border border-input bg-background p-2 text-sm" disabled={busy} value={b.personnes.join('\n')} onChange={e => modifier(i, { personnes: e.target.value.split('\n') })} />
      <div className="grid gap-2 sm:grid-cols-2">{b.personnes.map((nom, j) => { const p = personneDe(nom); return <div key={j} className="min-w-0"><Label className={`flex items-center gap-1 ${p ? '' : 'text-warning'}`}>{p && <PastilleDispo statut={statutDispo({ ...p, origine: p.origine as 'employe' | 'dispos' }, b.date, dispos)} />}{nom}{p && alerteDispo(statutDispo({ ...p, origine: p.origine as 'employe' | 'dispos' }, b.date, dispos)) === 'rouge' && <span className="text-xs text-destructive">pas dispo</span>}</Label><ChoixCherchable label={`Rattacher ${nom}`} value={p ? `${p.origine}:${p.id}` : ''} options={refs.personnes.filter(p => p.actif !== false).map(p => ({ id: `${p.origine}:${p.id}`, label: `${p.nom} ${p.prenom} · ${p.origine === 'dispos' ? 'Dispos' : 'Employé'}` }))} onChange={id => { setPersonnes(v => ({ ...v, [cleNomTerrain(nom)]: id })); setValide(false); }} /></div>; })}</div></section>)}
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={valide} disabled={busy} onChange={e => setValide(e.target.checked)} />Je valide les dates, les interventions et les rattachements de cet aperçu.</label><Button disabled={busy || manquants > 0 || ambigus || !valide} onClick={() => void enregistrer()}>Enregistrer le planning</Button>
    </>}{bilan && <p role="status" className="font-medium text-success">{bilan}</p>}
  </DialogContent></Dialog></>;
}