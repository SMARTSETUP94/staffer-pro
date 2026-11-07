import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Check } from 'lucide-react';
import { ETAPE_LABELS, type EtapeType } from '@/lib/logistique/etapes';
import { memePersonne, statutDispo, trierCandidats, type DispoPlanning } from '@/lib/imports/planning-equipes';
import type { AffectationSemaine, EtapeSemaine, PersonneSemaine } from '@/lib/logistique/planning-semaine';
import { PastilleDispo, BadgesQualifs } from '@/components/logistique/PastilleDispo';

type Filtre = '' | 'B' | 'C' | 'CE' | 'R489' | 'R486' | 'chef';
const FILTRES: { v: Filtre; l: string }[] = [{ v: '', l: 'Tous' }, { v: 'B', l: 'Permis B' }, { v: 'C', l: 'Permis C' }, { v: 'CE', l: 'Permis CE' }, { v: 'R489', l: 'R489' }, { v: 'R486', l: 'R486' }, { v: 'chef', l: 'Chef' }];
const passe = (p: PersonneSemaine, f: Filtre) => !f || (f === 'chef' ? !!p.chef : f.startsWith('R') ? (p.caces ?? []).some(c => c.replace(/^CACES_/, '') === f) : (p.permis ?? []).includes(f));

/** Panneau latéral « Compléter » : ajout en un clic, plusieurs à la suite, sans refermer. */
export function PanneauCompleter({ cible, onClose, personnes, dispos, affectations, etapes, onAjouter }: {
  cible: { etape: EtapeSemaine; jour: string } | null; onClose: () => void; personnes: (PersonneSemaine & { actif?: boolean; poste?: string | null })[]; dispos: DispoPlanning[]; affectations: AffectationSemaine[]; etapes: EtapeSemaine[];
  onAjouter: (p: PersonneSemaine) => Promise<void>;
}) {
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState<Filtre>('');
  const [busy, setBusy] = useState<string | null>(null);
  const jour = cible?.jour ?? '';
  const surEtape = (p: PersonneSemaine) => !!cible && affectations.some(a => a.etape_id === cible.etape.id && a.date === jour && memePersonne(p, a));
  const liste = cible ? trierCandidats(personnes.filter(p => p.actif !== false && passe(p, filtre) && `${p.nom} ${p.prenom} ${p.poste ?? ''}`.toLocaleLowerCase('fr').includes(recherche.toLocaleLowerCase('fr'))), jour, dispos) : [];
  const nb = cible ? affectations.filter(a => a.etape_id === cible.etape.id && a.date === jour).length : 0;
  return <Sheet open={!!cible} onOpenChange={o => { if (!o) onClose(); }}>
    <SheetContent className="flex w-full flex-col gap-3 sm:max-w-md">
      <SheetHeader><SheetTitle>{cible ? `Compléter ${cible.etape.numero} · ${ETAPE_LABELS[cible.etape.type as EtapeType] ?? cible.etape.type}` : 'Compléter'}</SheetTitle>
        {cible && <p className="text-sm text-muted-foreground">{new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${jour}T12:00:00`))} · {nb}/{cible.etape.nb_personnes || '—'} personnes</p>}</SheetHeader>
      <Input aria-label="Rechercher une personne terrain" placeholder="Nom, prénom ou poste" value={recherche} onChange={e => setRecherche(e.target.value)} />
      <div className="flex flex-wrap gap-1">{FILTRES.map(f => <button key={f.v} type="button" onClick={() => setFiltre(f.v)} className={`rounded border px-2 py-0.5 text-xs ${filtre === f.v ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>{f.l}</button>)}</div>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-auto">{liste.map(p => {
        const s = statutDispo(p, jour, dispos); const deja = surEtape(p);
        const ailleurs = affectations.filter(a => a.date === jour && a.etape_id !== cible?.etape.id && memePersonne(p, a)).map(a => etapes.find(e => e.id === a.etape_id)).filter(Boolean) as EtapeSemaine[];
        return <button key={`${p.origine}:${p.id}`} type="button" disabled={deja || busy !== null} onClick={async () => { setBusy(p.id); try { await onAjouter(p); } finally { setBusy(null); } }}
          className={`flex flex-wrap items-center gap-1.5 rounded border border-border px-2 py-1.5 text-left text-sm enabled:hover:bg-muted ${s === 'pas' ? 'opacity-50' : ''}`}>
          <PastilleDispo statut={s} /><span className="font-medium">{p.nom} {p.prenom}</span><BadgesQualifs p={p} />
          {ailleurs.length > 0 && <span className="text-xs text-warning">déjà sur {ailleurs.map(d => `${d.numero} · ${ETAPE_LABELS[d.type as EtapeType] ?? d.type}`).join(', ')}</span>}
          {deja && <span className="ml-auto flex items-center gap-1 text-xs text-success"><Check className="size-3" />Ajouté</span>}
          {busy === p.id && <span className="ml-auto text-xs">Ajout…</span>}
        </button>;
      })}</div>
    </SheetContent>
  </Sheet>;
}
