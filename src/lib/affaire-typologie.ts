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
  non_operationnel: "Non opérationnel (1XXX/3XXX)",
  montage_demontage: "Montage / Démontage (4XXX)",
  fabrication: "Fabrication (5XXX)",
  stockage: "Stockage (2XXXX)",
  prototype: "Prototype (9XXX)",
};

export const AFFAIRE_TYPOLOGIE_SHORT_LABELS: Record<AffaireTypologie, string> = {
  non_operationnel: "Non op.",
  montage_demontage: "M/D",
  fabrication: "Fab.",
  stockage: "Stock.",
  prototype: "Proto.",
};

/**
 * Couleurs alignées sur la légende unifiée du planning
 * (voir src/lib/planning-typologie-colors.ts) :
 *  - 1/3 → gris (slate)
 *  - 2   → bleu (sky)
 *  - 4/5 → vert (emerald)  ← M/D et Fabrication partagent le même vert
 *  - 9   → orange
 */
export const AFFAIRE_TYPOLOGIE_COLORS: Record<AffaireTypologie, { bg: string; fg: string }> = {
  non_operationnel: { bg: "#E2E8F0", fg: "#334155" }, // slate-200 / slate-700
  montage_demontage: { bg: "#A7F3D0", fg: "#065F46" }, // emerald-200 / emerald-800
  fabrication: { bg: "#A7F3D0", fg: "#065F46" }, // emerald-200 / emerald-800
  stockage: { bg: "#BAE6FD", fg: "#075985" }, // sky-200 / sky-800
  prototype: { bg: "#FED7AA", fg: "#9A3412" }, // orange-200 / orange-800
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
