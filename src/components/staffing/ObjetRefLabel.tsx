// v0.39.0e — Composant partagé : libellé d'objet uniforme entre vues staffing.
// Format unique : `<ref mono semibold>` + " — " + `<nom texte muted>`.
// Utilisé par ChargeMetierSection (vue 1) et StaffingPersonnesSection (vue 2).
import { cn } from "@/lib/utils";

interface Props {
  reference: string;
  nom?: string | null;
  /** Tronque le nom si trop long. Défaut true. */
  truncate?: boolean;
  className?: string;
  /** Taille du texte. Défaut "xs" pour vue dense. */
  size?: "xs" | "sm";
}

/** Parse un label combiné "REF — NOM" en {reference, nom}. Tolère absence de séparateur. */
export function parseObjetLabel(label: string): { reference: string; nom: string } {
  const idx = label.indexOf(" — ");
  if (idx === -1) return { reference: label, nom: "" };
  return {
    reference: label.slice(0, idx),
    nom: label.slice(idx + 3),
  };
}

export function ObjetRefLabel({
  reference,
  nom,
  truncate = true,
  className,
  size = "xs",
}: Props) {
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
        {reference}
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
