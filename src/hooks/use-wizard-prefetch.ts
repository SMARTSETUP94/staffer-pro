// v0.35.10 #8 — Pré-fetch des données du wizard staffing au hover du bouton
// "Mettre au planning". Réduit la latence d'apparition du wizard (~600ms → ~50ms).
// Cache en mémoire avec TTL 60s pour éviter spam si l'utilisateur survole plusieurs fois.
import { useCallback, useRef } from "react";
import {
  listFabObjetsForWizard,
  getActivePlansForAffaire,
} from "@/server/staffing-plan-create.functions";

const TTL_MS = 60_000;
const cache = new Map<string, { ts: number; promise: Promise<unknown> }>();

export function useWizardPrefetch(affaireId: string) {
  const lastTriggered = useRef<number>(0);

  const prefetch = useCallback(() => {
    const now = Date.now();
    if (now - lastTriggered.current < 200) return; // debounce
    lastTriggered.current = now;

    const cached = cache.get(affaireId);
    if (cached && now - cached.ts < TTL_MS) return;

    const p = Promise.all([
      listFabObjetsForWizard({ data: { affaire_id: affaireId } }),
      getActivePlansForAffaire({ data: { affaire_id: affaireId } }),
    ]).catch(() => {
      // En cas d'erreur, invalide le cache pour retry à l'ouverture réelle
      cache.delete(affaireId);
    });
    cache.set(affaireId, { ts: now, promise: p });
  }, [affaireId]);

  return { prefetch };
}
