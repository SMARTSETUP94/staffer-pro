import { useState, type DragEvent } from 'react';
import { AlertTriangle, Copy, MoreHorizontal, Pencil, Truck, UserPlus, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ETAPE_CLASSES, ETAPE_LABELS, type EtapeType } from '@/lib/logistique/etapes';
import { horaire, statutDispo, alerteDispo, type DispoPlanning } from '@/lib/imports/planning-equipes';
import { besoinsEtape, type AffectationSemaine, type EtapeSemaine, type PersonneSemaine } from '@/lib/logistique/planning-semaine';
import { PastilleDispo } from '@/components/logistique/PastilleDispo';

export type MembreEquipe = { a: AffectationSemaine; p?: PersonneSemaine };
export const DND_TYPE = 'application/x-planning-logistique';
export type DragPayload = { kind: 'libre'; id: string; origine: 'employe' | 'dispos' } | { kind: 'move'; affectation: string; jour: string };

const CONFIRMATION: Record<string, { label: string; cls: string }> = {
  en_attente: { label: 'En attente', cls: 'bg-warning/20 text-foreground' },
  confirmee: { label: 'Confirmée', cls: 'bg-success/15 text-success' },
  refusee: { label: 'Refusée', cls: 'bg-destructive/15 text-destructive' },
};
const initiales = (p?: PersonneSemaine) => (p ? `${p.prenom?.[0] ?? ''}${p.nom?.[0] ?? ''}`.toUpperCase() : '?');
const ALERTE = { rouge: 'ring-2 ring-destructive', orange: 'ring-2 ring-warning' } as const;

export type CibleCopie = { etape: EtapeSemaine; jour: string };

export function EtapeCarte({ e, jour, equipe, dispos, droits, focus, cibles, onCompleter, onModifier, onRenommer, onDrop, onCopier, onSemaineDerniere, onConfirmation, onRole }: {
  e: EtapeSemaine; jour: string; equipe: MembreEquipe[]; dispos: DispoPlanning[]; droits: boolean; focus?: boolean; cibles: CibleCopie[];
  onCompleter: () => void; onModifier: () => void; onRenommer: () => void; onDrop: (d: DragPayload) => void;
  onCopier: (cibles: CibleCopie[]) => void; onSemaineDerniere: () => void;
  onConfirmation: (a: AffectationSemaine, statut: string) => void; onRole: (a: AffectationSemaine, role: 'chef_equipe' | 'equipier') => void;
}) {
  const [survol, setSurvol] = useState(false);
  const [choix, setChoix] = useState<Set<string>>(new Set());
  const besoin = e.nb_personnes ?? 0;
  const complet = besoin > 0 ? equipe.length >= besoin : equipe.length > 0;
  const besoins = besoinsEtape(e, equipe);
  const op = ETAPE_LABELS[e.type as EtapeType] ?? e.type;
  const cleCible = (c: CibleCopie) => `${c.etape.id}|${c.jour}`;
  const drop = (ev: DragEvent) => { ev.preventDefault(); setSurvol(false); const raw = ev.dataTransfer.getData(DND_TYPE); if (raw) onDrop(JSON.parse(raw) as DragPayload); };

  return <article id={`etape-${e.id}-${jour}`} aria-label={`${e.numero} ${op} ${jour}`}
    className={`overflow-hidden rounded-lg border bg-card ${complet ? 'border-border' : 'border-destructive'} ${survol ? 'ring-2 ring-primary' : ''} ${focus ? 'ring-2 ring-primary ring-offset-2' : ''}`}
    onDragOver={droits ? ev => { if (ev.dataTransfer.types.includes(DND_TYPE)) { ev.preventDefault(); setSurvol(true); } } : undefined}
    onDragLeave={() => setSurvol(false)} onDrop={droits ? drop : undefined}>
    <div className={`flex flex-wrap items-center gap-2 px-3 py-2 ${ETAPE_CLASSES[e.type as EtapeType] ?? 'bg-muted'}`}>
      <strong>{e.numero} · {op}</strong><span>{horaire(e) || 'horaire à confirmer'}</span>{e.lieu && <span className="truncate">· {e.lieu}</span>}
      <span className={`ml-auto rounded px-2 py-0.5 text-sm font-semibold ${complet ? 'bg-success text-success-foreground' : 'bg-destructive text-destructive-foreground'}`} aria-label={`${equipe.length} sur ${besoin || '—'} personnes`}>
        {!complet && <AlertTriangle className="mr-1 inline size-3" />}{equipe.length}/{besoin || '—'}
      </span>
    </div>
    <div className="space-y-2 p-3">
      <p className="text-sm font-medium">{e.nom}</p>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {(e.vehicule || e.nb_vehicules) ? <span className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5"><Truck className="size-3" />{e.vehicule ?? `${e.nb_vehicules} véhicule${(e.nb_vehicules ?? 0) > 1 ? 's' : ''}`}</span> : null}
        {besoins.map(b => <span key={b.label} className={`rounded px-1.5 py-0.5 font-medium ${b.couvert ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive'}`}>{b.label}</span>)}
        {e.responsable && <span className="text-muted-foreground">Resp. {e.responsable}</span>}
        {e.note && <span className="text-muted-foreground">· {e.note}</span>}
      </div>
      <ul className="flex flex-wrap gap-1.5">{equipe.map(({ a, p }) => {
        const s = p ? statutDispo(p, jour, dispos) : 'vide'; const al = p ? alerteDispo(s) : 'orange'; const conf = CONFIRMATION[a.confirmation ?? ''];
        const chip = <span className="flex items-center gap-1">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{initiales(p)}</span>
          {p && <PastilleDispo statut={s} />}<span>{p ? `${p.nom} ${p.prenom}` : 'À vérifier'}</span>
          {a.role === 'chef_equipe' && <span className="rounded bg-primary px-1 text-[10px] text-primary-foreground">Chef</span>}
          {conf && <span className={`rounded px-1 text-[10px] ${conf.cls}`}>{conf.label}</span>}
        </span>;
        return <li key={a.id} draggable={droits} onDragStart={ev => { ev.dataTransfer.setData(DND_TYPE, JSON.stringify({ kind: 'move', affectation: a.id, jour } satisfies DragPayload)); ev.dataTransfer.effectAllowed = 'move'; }}
          className={`rounded bg-primary/10 px-1.5 py-1 text-sm ${al ? ALERTE[al] : ''} ${droits ? 'cursor-grab' : ''}`}>
          {droits ? <DropdownMenu><DropdownMenuTrigger className="text-left" aria-label={`Options ${p ? `${p.nom} ${p.prenom}` : ''}`}>{chip}</DropdownMenuTrigger><DropdownMenuContent>
            <DropdownMenuLabel>Confirmation</DropdownMenuLabel>
            {Object.entries(CONFIRMATION).map(([k, v]) => <DropdownMenuItem key={k} onClick={() => onConfirmation(a, k)}>{v.label}</DropdownMenuItem>)}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onRole(a, a.role === 'chef_equipe' ? 'equipier' : 'chef_equipe')}>{a.role === 'chef_equipe' ? 'Retirer le rôle chef' : 'Marquer chef d’équipe'}</DropdownMenuItem>
          </DropdownMenuContent></DropdownMenu> : chip}
        </li>;
      })}{equipe.length === 0 && <li className="text-sm text-destructive">Personne affectée</li>}</ul>
      {droits && <div className="flex flex-wrap gap-1.5">
        <Button size="sm" onClick={onCompleter}><UserPlus className="mr-1 size-3" />Compléter</Button>
        <Popover onOpenChange={o => { if (!o) setChoix(new Set()); }}><PopoverTrigger asChild><Button size="sm" variant="outline" disabled={!equipe.length || !cibles.length}><Copy className="mr-1 size-3" />Copier l’équipe sur…</Button></PopoverTrigger>
          <PopoverContent className="w-80 space-y-2"><p className="text-sm font-medium">Copier {equipe.length} personne(s) sur :</p>
            <div className="max-h-60 space-y-1 overflow-auto">{cibles.map(c => <label key={cleCible(c)} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={choix.has(cleCible(c))} onChange={ev => setChoix(s => { const n = new Set(s); if (ev.target.checked) n.add(cleCible(c)); else n.delete(cleCible(c)); return n; })} />{new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${c.jour}T12:00:00`))} · {c.etape.numero} {ETAPE_LABELS[c.etape.type as EtapeType] ?? c.etape.type} {horaire(c.etape)}</label>)}</div>
            <Button size="sm" disabled={!choix.size} onClick={() => { onCopier(cibles.filter(c => choix.has(cleCible(c)))); setChoix(new Set()); }}>Copier</Button></PopoverContent></Popover>
        <DropdownMenu><DropdownMenuTrigger asChild><Button size="sm" variant="ghost" aria-label="Autres actions"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent>
          <DropdownMenuItem onClick={onSemaineDerniere}><History className="mr-2 size-4" />Reprendre l’équipe de la semaine dernière</DropdownMenuItem>
          <DropdownMenuItem onClick={onModifier}><Pencil className="mr-2 size-4" />Modifier / supprimer l’étape</DropdownMenuItem>
          <DropdownMenuItem onClick={onRenommer}>Corriger le nom du chantier</DropdownMenuItem>
        </DropdownMenuContent></DropdownMenu>
      </div>}
    </div>
  </article>;
}
