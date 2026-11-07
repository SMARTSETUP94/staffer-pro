import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { lireAffectationsConsolide, rapprocherAffectations, type PersonneReference, type Rapprochement } from '@/lib/imports/affectations-consolide';

export function ImportHistoriqueConsolide() {
  const [lignes, setLignes] = useState<Rapprochement[]>([]);
  const [personnes, setPersonnes] = useState<PersonneReference[]>([]);
  const [affaires, setAffaires] = useState<{ id: string; numero: string; nom: string }[]>([]);
  const [choix, setChoix] = useState<Record<number, { personne?: string; affaire?: string }>>({});
  const [empreinte, setEmpreinte] = useState('');
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [bilan, setBilan] = useState('');
  const [recherche, setRecherche] = useState('');
  async function lire(file: File) {
    setBusy(true); setBilan('');
    try {
      const buffer = await file.arrayBuffer();
      const hash = await crypto.subtle.digest('SHA-256', buffer);
      setEmpreinte(Array.from(new Uint8Array(hash)).map(v => v.toString(16).padStart(2, '0')).join(''));
      const XLSX = await import('xlsx-js-style');
      const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
      const sheet = wb.Sheets['Affectations'];
      if (!sheet) throw new Error('Onglet Affectations introuvable.');
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' });
      const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date());
      const parsed = lireAffectationsConsolide(rows, today);
      setErreurs(parsed.erreurs);
      const { data, error } = await supabase.rpc('planning_terrain_references');
      if (error) throw error;
      const refs = data as unknown as { personnes: PersonneReference[]; affaires: { id: string; numero: string; nom: string }[] };
      setPersonnes(refs.personnes); setAffaires(refs.affaires); setChoix({});
      setLignes(rapprocherAffectations(parsed.lignes, refs.personnes, refs.affaires));
      if (parsed.doublons) toast.info(`${parsed.doublons} doublon(s) ignoré(s) dans le fichier.`);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Lecture impossible'); }
    finally { setBusy(false); }
  }
  const resolves = lignes.map(r => ({ r, personne: personnes.find(p => p.id === choix[r.ligne.ligne]?.personne) ?? (r.candidats.length === 1 ? r.candidats[0] : undefined), affaire: choix[r.ligne.ligne]?.affaire ?? r.affaireId }));
  const pretes = resolves.filter(r => r.personne?.origine === 'employe' && r.affaire);
  async function enregistrer() {
    setBusy(true);
    try {
      const payload = pretes.flatMap(({ r, personne, affaire }) => personne && affaire ? [{ date: r.ligne.date, affaire_id: affaire, employe_id: personne.id, operation: r.ligne.operation, responsable: r.ligne.responsable, nom_original: r.ligne.nomOriginal, sources: r.ligne.sources, format: r.ligne.format }] : []);
      const { data, error } = await supabase.rpc('planning_terrain_importer', { _lignes: payload, _empreinte: empreinte });
      if (error) throw error;
      const result = data as unknown as { ajoutes: number; existants: number };
      setBilan(`${result.ajoutes} passages enregistrés · ${result.existants} déjà présents · ${lignes.length - pretes.length} à rapprocher`);
      toast.success('Historique enregistré');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Enregistrement impossible'); }
    finally { setBusy(false); }
  }
  return <section className="space-y-4">
    <h2 className="text-lg font-semibold">Historique consolidé — Affectations</h2>
    <Input aria-label="Fichier historique consolidé" type="file" accept=".xlsx" disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f) void lire(f); }} />
    {erreurs.length > 0 && <div role="alert" className="text-sm text-destructive">{erreurs.slice(0, 20).map(e => <p key={e}>{e}</p>)}</div>}
    {lignes.length > 0 && <>
      <div className="flex flex-wrap items-center gap-3"><span className="text-sm">{lignes.length} passages · {pretes.length} prêts · {lignes.length - pretes.length} à rapprocher</span><Button disabled={busy || !pretes.length} onClick={() => void enregistrer()}>Enregistrer les passages rapprochés</Button></div>
      <Input aria-label="Rechercher un passage" placeholder="Personne ou code chantier" value={recherche} onChange={e => setRecherche(e.target.value)} />
      <div className="max-h-96 overflow-auto"><table className="w-full min-w-[700px] text-sm"><thead><tr><th className="text-left">Date</th><th className="text-left">Personne</th><th className="text-left">Chantier</th><th className="text-left">État</th></tr></thead><tbody>{resolves.filter(({ r }) => `${r.ligne.personne} ${r.ligne.code}`.toLocaleLowerCase('fr').includes(recherche.toLocaleLowerCase('fr'))).slice(0, 100).map(({ r, personne, affaire }) => <tr key={r.ligne.ligne} className="border-t border-border"><td className="py-2">{r.ligne.date}</td><td className="py-2"><div>{r.ligne.personne}</div>{(!personne || personne.origine === 'dispos') && <Input list="terrain-personnes" aria-label={`Rattacher ${r.ligne.personne}`} placeholder="Nom d’une fiche employé" onChange={e => { const p = personnes.find(p => `${p.nom} ${p.prenom} · ${p.id}` === e.target.value); if (p) setChoix(c => ({ ...c, [r.ligne.ligne]: { ...c[r.ligne.ligne], personne: p.id } })); }} />}</td><td className="py-2">{r.ligne.code} · {r.ligne.chantier}{!affaire && <Input list="terrain-affaires" aria-label={`Rattacher chantier ${r.ligne.code}`} placeholder="Code chantier existant" onChange={e => { const a = affaires.find(a => `${a.numero} · ${a.nom}` === e.target.value); if (a) setChoix(c => ({ ...c, [r.ligne.ligne]: { ...c[r.ligne.ligne], affaire: a.id } })); }} />}</td><td>{personne?.origine === 'employe' && affaire ? 'Prêt' : 'À rapprocher'}</td></tr>)}</tbody></table></div>
      <datalist id="terrain-personnes">{personnes.filter(p => p.origine === 'employe').map(p => <option key={p.id} value={`${p.nom} ${p.prenom} · ${p.id}`} />)}</datalist><datalist id="terrain-affaires">{affaires.map(a => <option key={a.id} value={`${a.numero} · ${a.nom}`} />)}</datalist>
    </>}
    {bilan && <p role="status" className="text-sm font-medium">{bilan}</p>}
  </section>;
}