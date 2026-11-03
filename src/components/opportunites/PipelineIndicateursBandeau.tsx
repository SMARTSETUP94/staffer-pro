import { createContext, useContext, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { kEur, type IndicateurAffaire, type PipelineIndicateurs } from "@/lib/pipeline-indicateurs";

export function usePipelineIndicateurs(affaireIds: string[], enabled = true) {
  const ids = useMemo(() => [...affaireIds].sort(), [affaireIds]);
  return useQuery({
    queryKey: ["pipeline-indicateurs", ids.join(",")],
    enabled: enabled && ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("pipeline_indicateurs", { _affaire_ids: ids.slice(0, 2000) });
      if (error) throw error;
      return data as unknown as PipelineIndicateurs;
    },
  });
}

/** Montants par opportunité pour les colonnes et les vignettes. */
export const IndicateursCtx = createContext<Map<string, IndicateurAffaire>>(new Map());
export const useIndicateurAffaire = (id: string) => useContext(IndicateursCtx).get(id);

const TUILE = "flex min-h-[84px] flex-col justify-between rounded-xl border border-border bg-card p-3 text-left";
const TITRE = "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";
const VAL = "text-2xl font-bold tabular-nums text-foreground";

export function PipelineIndicateursBandeau({ data, relanceActive, onRelance }: {
  data: PipelineIndicateurs | undefined; relanceActive: boolean; onRelance: () => void;
}) {
  if (!data) return null;
  const t = data.totaux;
  const max = Math.max(1, ...data.heures_metier.map((m) => Number(m.heures)));
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4" aria-label="Indicateurs du pipeline">
      <div className={TUILE}>
        <span className={TITRE}>CA pipeline</span>
        <span className={VAL}>{kEur(t.chiffre + t.estime)}</span>
        <span className="text-xs font-medium text-foreground tabular-nums">{kEur(t.chiffre)} chiffrés · {kEur(t.estime)} estimés</span>
      </div>
      <div className={TUILE} title={`Probabilités : à faire ${Math.round(data.probabilites.a_faire * 100)} %, envoyé ${Math.round(data.probabilites.envoye * 100)} %, à l'étude ${Math.round(data.probabilites.a_l_etude * 100)} %, presque gagné ${Math.round(data.probabilites.presque_gagne * 100)} %`}>
        <span className={TITRE}>CA pondéré</span>
        <span className={VAL}>{kEur(t.pondere)}</span>
        <span className="text-xs text-muted-foreground">chiffré + estimé × probabilité</span>
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className={cn(TUILE, "hover:border-primary")}>
            <span className={TITRE}>Heures potentielles</span>
            <span className={VAL}>{Math.round(t.heures).toLocaleString("fr-FR")} h</span>
            <span className="text-xs text-muted-foreground tabular-nums">BE {t.jours_be.toLocaleString("fr-FR")} j · détail par métier</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80">
          <p className="mb-2 text-sm font-semibold">Heures des derniers devis par métier</p>
          {data.heures_metier.length === 0 && <p className="text-sm text-muted-foreground">Aucune heure chiffrée.</p>}
          <ul className="space-y-1.5">
            {data.heures_metier.map((m) => (
              <li key={m.metier_id} className="text-xs">
                <div className="flex justify-between"><span>{m.libelle}</span><span className="tabular-nums font-medium">{Number(m.heures).toLocaleString("fr-FR")} h</span></div>
                <div className="h-2 rounded bg-muted"><div className="h-2 rounded bg-primary" style={{ width: `${(Number(m.heures) / max) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
      <button type="button" onClick={onRelance} aria-pressed={relanceActive}
        className={cn(TUILE, "hover:border-primary", relanceActive && "border-primary ring-2 ring-primary/30")}>
        <span className={TITRE}>À relancer</span>
        <span className={VAL}>{t.relance_nb}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{kEur(t.relance_montant)} · envoyé il y a plus de 7 j{relanceActive ? " · filtre actif" : ""}</span>
      </button>
    </div>
  );
}
