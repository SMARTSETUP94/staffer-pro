import type { StatutDispo } from '@/lib/imports/planning-equipes';

const CLASSES: Record<StatutDispo, string> = { J: 'bg-su-bleu text-su-carte', S: 'bg-su-profond text-su-carte', 'J+S': 'bg-su-profond text-su-carte', pas: 'bg-su-texte text-su-carte', vide: 'bg-su-vide text-su-second' };
const TEXTES: Record<StatutDispo, string> = { J: 'J', S: 'S', 'J+S': 'J+S', pas: 'Pas dispo', vide: 'Sans réponse' };

/** Pastille de disponibilité aux couleurs de l'onglet Dispos. */
export function PastilleDispo({ statut }: { statut: StatutDispo }) {
  return <span className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold ${CLASSES[statut]}`} title={TEXTES[statut]}>{TEXTES[statut]}</span>;
}

export function BadgesQualifs({ p }: { p: { chef?: boolean | null; permis?: string[] | null; caces?: string[] | null; caces_autre?: string | null } }) {
  const caces = [...(p.caces ?? []), ...(p.caces_autre ? [p.caces_autre] : [])];
  return <>{p.chef && <span className="rounded bg-primary/15 px-1.5 text-[11px] font-semibold text-primary">Chef</span>}{(p.permis ?? []).map(x => <span key={x} className="rounded bg-muted px-1.5 text-[11px] text-muted-foreground">{x}</span>)}{caces.map(x => <span key={x} className="rounded bg-muted px-1.5 text-[11px] text-muted-foreground">{x}</span>)}</>;
}
