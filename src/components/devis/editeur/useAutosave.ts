import { useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { devisKey } from "./api";

/**
 * Enregistrement automatique par élément et par champ : la dernière valeur saisie est envoyée
 * après une courte pause ; le devis est relu une fois la saisie terminée (le serveur fait foi).
 */
export function useAutosave(devisId: string, delay = 500) {
  const qc = useQueryClient();
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(0);

  const scheduleRefresh = () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      if (pending.current === 0) void qc.invalidateQueries({ queryKey: devisKey(devisId) });
    }, 1200);
  };

  return (key: string, run: () => Promise<unknown>) => {
    const t = timers.current.get(key);
    if (t) clearTimeout(t);
    timers.current.set(key, setTimeout(async () => {
      timers.current.delete(key);
      pending.current++;
      try { await run(); } finally { pending.current--; scheduleRefresh(); }
    }, delay));
  };
}
