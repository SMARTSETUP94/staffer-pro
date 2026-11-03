import { createContext, useContext, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { kEur, type IndicateurAffaire, type PipelineIndicateurs } from "@/lib/pipeline-indicateurs";

/** Les suppléments 6XXX suivent le filtre chargé d'affaires et la recherche du pipeline. */
export function usePipelineIndicateurs(affaireIds: string[], filtres: { chargeAffairesId?: string | null; q?: string } = {}, enabled = true) {
  const ids = useMemo(() => [...affaireIds].sort(), [affaireIds]);
  const ca = filtres.chargeAffairesId ?? null, q = filtres.q?.trim() || null;
  return useQuery({
    queryKey: ["pipeline-indicateurs", ids.join(","), ca, q],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("pipeline_indicateurs", { _affaire_ids: ids.slice(0, 2000), _charge_affaires_id: ca as string, _q: q as string });
      if (error) throw error;
      return data as unknown as PipelineIndicateurs;
    },
  });
}

/** Montants par opportunité pour les colonnes et les vignettes. */
export const IndicateursCtx = createContext<Map<string, IndicateurAffaire>>(new Map());
export const useIndicateurAffaire = (id: string) => useContext(IndicateursCtx).get(id);

const CASE = "flex min-w-0 flex-1 flex-col justify-center px-2 py-1.5 text-left sm:flex-none sm:px-4 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const TITRE = "truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const VAL = "truncate text-lg font-semibold leading-tight tabular-nums text-foreground sm:text-xl";
const SOUS = "truncate text-[11px] leading-tight tabular-nums text-muted-foreground";
const pct = (v: number | undefined) => `${Math.round(Number(v ?? 0) * 100)} %`;
/** « 831 h » ; au-delà de 1 000 h : « 6,7 k h ». */
export const heuresCourt = (h: number) => (h >= 1000 ? `${(h / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k h` : `${Math.round(h).toLocaleString("fr-FR")} h`);
const kSansUnite = (v: number) => kEur(v).replace(" k€", "");

function Case({ titre, valeur, sous, children, actif }: { titre: string; valeur: string; sous?: string; children: React.ReactNode; actif?: boolean }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cn(CASE, actif && "bg-primary/10")} aria-label={`${titre} : ${valeur}, voir le détail`}>
          <span className={TITRE}>{titre}</span>
          <span className={VAL}>{valeur}</span>
          {sous ? <span className={SOUS}>{sous}</span> : <span className="h-[13px]" aria-hidden />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-sm">{children}</PopoverContent>
    </Popover>
  );
}
const Ligne = ({ l, v }: { l: string; v: string }) => <div className="flex justify-between gap-3 py-0.5"><span>{l}</span><span className="font-medium tabular-nums">{v}</span></div>;

export function PipelineIndicateursBandeau({ data, relanceActive, onRelance }: {
  data: PipelineIndicateurs | undefined; relanceActive: boolean; onRelance: () => void;
}) {
  if (!data) return null;
  const t = data.totaux;
  const p = data.probabilites;
  const max = Math.max(1, ...data.heures_metier.map((m) => Number(m.heures)));
  return (
    <div className="flex w-full divide-x divide-border overflow-hidden rounded-xl bg-muted/50 sm:w-fit" aria-label="Indicateurs du pipeline">
      <Case titre="Pipeline" valeur={kEur(t.chiffre + t.estime)} sous={`${kSansUnite(t.chiffre)} chiffrés`}>
        <p className="mb-1 font-semibold">CA pipeline {kEur(t.chiffre + t.estime)}</p>
        <Ligne l="Chiffrés (derniers devis)" v={kEur(t.chiffre)} />
        <Ligne l="Estimés (sans devis)" v={kEur(t.estime)} />
        {t.supplements_nb > 0 && <Ligne l={`dont suppléments chantiers (${t.supplements_nb})`} v={kEur(t.supplements)} />}
        <p className="mt-2 text-xs text-muted-foreground">{t.nb} opportunité{t.nb > 1 ? "s" : ""}, filtres actifs compris.</p>
      </Case>
      <Case titre="Pondéré" valeur={kEur(t.pondere)}>
        <p className="mb-1 font-semibold">CA pondéré {kEur(t.pondere)}</p>
        <p className="mb-2 text-xs text-muted-foreground">Chiffré + estimé × probabilité du statut (modifiable dans Paramètres › Devis).</p>
        <Ligne l="À faire" v={pct(p.a_faire)} /><Ligne l="Envoyé" v={pct(p.envoye)} /><Ligne l="À l'étude" v={pct(p.a_l_etude)} /><Ligne l="Presque gagné" v={pct(p.presque_gagne)} />
      </Case>
      <Case titre="Heures" valeur={heuresCourt(Number(t.heures))} sous={`BE ${Math.round(Number(t.jours_be)).toLocaleString("fr-FR")} j`}>
        <p className="mb-2 font-semibold">{Math.round(t.heures).toLocaleString("fr-FR")} h potentielles · BE {t.jours_be.toLocaleString("fr-FR")} j</p>
        {data.heures_metier.length === 0 && <p className="text-muted-foreground">Aucune heure chiffrée.</p>}
        <ul className="max-h-72 space-y-1.5 overflow-y-auto">
          {data.heures_metier.map((m) => (
            <li key={m.metier_id} className="text-xs">
              <div className="flex justify-between"><span>{m.libelle}</span><span className="tabular-nums font-medium">{Number(m.heures).toLocaleString("fr-FR")} h</span></div>
              <div className="h-2 rounded bg-muted"><div className="h-2 rounded bg-primary" style={{ width: `${(Number(m.heures) / max) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      </Case>
      <Case titre="À relancer" valeur={String(t.relance_nb)} actif={relanceActive}>
        <p className="mb-1 font-semibold">{t.relance_nb} à relancer · {kEur(t.relance_montant)}</p>
        <p className="mb-3 text-xs text-muted-foreground">Envoyé il y a plus de 7 jours, sans action plus récente.</p>
        <button type="button" onClick={onRelance} className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
          {relanceActive ? "Retirer le filtre « À relancer »" : "Afficher seulement ces opportunités"}
        </button>
      </Case>
    </div>
  );
}
