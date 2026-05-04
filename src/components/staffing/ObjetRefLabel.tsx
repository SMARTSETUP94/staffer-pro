// v0.39.0e — Composant partagé : libellé d'objet uniforme entre vues staffing.
// v0.39.0f — Préfixe devis (`D-202604-2141 (1)-`) masquable globalement via
// localStorage `staffing-show-devis-prefix` (défaut: masqué). Hook + toggle
// exposés pour contrôle UI dans la barre du plan.
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  reference: string;
  nom?: string | null;
  /** Tronque le nom si trop long. Défaut true. */
  truncate?: boolean;
  className?: string;
  /** Taille du texte. Défaut "xs" pour vue dense. */
  size?: "xs" | "sm";
  /** Force l'affichage du préfixe devis quel que soit le toggle global. */
  forceShowDevisPrefix?: boolean;
}

const LS_KEY = "staffing-show-devis-prefix";
const EVT = "staffing-show-devis-prefix-change";

/** Parse un label combiné "REF — NOM" en {reference, nom}. Tolère absence de séparateur. */
export function parseObjetLabel(label: string): { reference: string; nom: string } {
  const idx = label.indexOf(" — ");
  if (idx === -1) return { reference: label, nom: "" };
  return {
    reference: label.slice(0, idx),
    nom: label.slice(idx + 3),
  };
}

/**
 * Détecte le préfixe devis dans une référence d'objet et le retire si demandé.
 * Patterns supportés (générés par RPC import_devis_atomique_v3) :
 *   - `D-202604-2141 (1)-1.1` → `1.1`
 *   - `D-202604-2113-1.1`     → `1.1`
 * Si aucun préfixe détecté → retourne la référence telle quelle.
 */
export function stripDevisPrefix(reference: string): string {
  // D-XXXXXX-XXXX [(n)]-suffix
  const m = reference.match(/^D-\d{6}-\d{4}(?:\s*\(\d+\))?-(.+)$/);
  return m ? m[1] : reference;
}

/** Lit la préférence globale (côté client uniquement). Défaut: false (masqué). */
export function getShowDevisPrefix(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(LS_KEY) === "1";
}

export function setShowDevisPrefix(value: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_KEY, value ? "1" : "0");
  window.dispatchEvent(new Event(EVT));
}

/** Hook réactif : renvoie la valeur courante + setter, et écoute les changements cross-composants. */
export function useShowDevisPrefix(): [boolean, (v: boolean) => void] {
  const [v, setV] = useState<boolean>(() => getShowDevisPrefix());
  useEffect(() => {
    const handler = () => setV(getShowDevisPrefix());
    window.addEventListener(EVT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);
  return [v, setShowDevisPrefix];
}

export function ObjetRefLabel({
  reference,
  nom,
  truncate = true,
  className,
  size = "xs",
  forceShowDevisPrefix,
}: Props) {
  const [showPrefix] = useShowDevisPrefix();
  const effectiveRef =
    forceShowDevisPrefix || showPrefix ? reference : stripDevisPrefix(reference);
  const refSize = size === "xs" ? "text-[11px]" : "text-xs";
  const nomSize = size === "xs" ? "text-[10px]" : "text-[11px]";
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 min-w-0", className)}
      title={nom ? `${reference} — ${nom}` : reference}
    >
      <span
        className={cn(
          "font-mono font-semibold text-foreground whitespace-nowrap",
          refSize,
        )}
      >
        {effectiveRef}
      </span>
      {nom && (
        <span
          className={cn(
            "text-muted-foreground min-w-0",
            nomSize,
            truncate && "truncate",
          )}
        >
          — {nom}
        </span>
      )}
    </span>
  );
}
