/**
 * v0.24.0 — Typologie de chantiers (dérivée du numero d'affaire).
 *
 * Logique miroir de la fonction SQL `compute_affaire_typologie(num text)` :
 * - 4 chiffres / 1 -> non_operationnel
 * - 4 chiffres / 3 -> non_operationnel
 * - 4 chiffres / 4 -> montage_demontage
 * - 4 chiffres / 5 -> fabrication
 * - 4 chiffres / 9 -> prototype
 * - 5 chiffres / 2 -> stockage
 * - sinon -> null
 */
export type AffaireTypologie =
  | "non_operationnel"
  | "montage_demontage"
  | "fabrication"
  | "stockage"
  | "prototype";

export const AFFAIRE_TYPOLOGIES: AffaireTypologie[] = [
  "non_operationnel",
  "montage_demontage",
  "fabrication",
  "stockage",
  "prototype",
];

export const AFFAIRE_TYPOLOGIE_LABELS: Record<AffaireTypologie, string> = {
  non_operationnel: "Non opérationnel",
  montage_demontage: "Montage / Démontage",
  fabrication: "Fabrication",
  stockage: "Stockage",
  prototype: "Prototype",
};

export const AFFAIRE_TYPOLOGIE_SHORT_LABELS: Record<AffaireTypologie, string> = {
  non_operationnel: "Non op.",
  montage_demontage: "M/D",
  fabrication: "Fab.",
  stockage: "Stock.",
  prototype: "Proto.",
};

/**
 * Clés de design tokens dans src/styles.css (--typologie-{key}).
 */
export const AFFAIRE_TYPOLOGIE_COLORS: Record<AffaireTypologie, { bg: string; fg: string }> = {
  non_operationnel: { bg: "var(--typologie-non-op)", fg: "var(--typologie-non-op-foreground)" },
  montage_demontage: { bg: "var(--typologie-md)", fg: "var(--typologie-md-foreground)" },
  fabrication: { bg: "var(--typologie-fab)", fg: "var(--typologie-fab-foreground)" },
  stockage: { bg: "var(--typologie-stockage)", fg: "var(--typologie-stockage-foreground)" },
  prototype: { bg: "var(--typologie-proto)", fg: "var(--typologie-proto-foreground)" },
};

/**
 * Preset "Opérationnels" — voix Gabin.
 * Stockage NON inclus (logistique séparée, cochable indépendamment).
 */
export const OPERATIONNEL_TYPOLOGIES: AffaireTypologie[] = ["montage_demontage", "fabrication"];

/**
 * Mappe un numéro d'affaire vers une typologie.
 * Doit rester strictement aligné avec compute_affaire_typologie() en SQL.
 */
export function getAffaireTypologie(numero: string | null | undefined): AffaireTypologie | null {
  if (!numero) return null;
  const trimmed = numero.trim();
  if (trimmed.length === 0) return null;

  const first = trimmed[0];

  if (trimmed.length === 5 && first === "2") return "stockage";

  if (trimmed.length === 4) {
    switch (first) {
      case "1":
        return "non_operationnel";
      case "3":
        return "non_operationnel";
      case "4":
        return "montage_demontage";
      case "5":
        return "fabrication";
      case "9":
        return "prototype";
      default:
        return null;
    }
  }

  return null;
}
