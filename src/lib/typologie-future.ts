/**
 * v0.29.2 — Typologie future (déclarée sur opportunité 9XXX en amont de la signature).
 *
 * Permet de pré-remplir intelligemment le code 5XXX/4XXX/etc. au moment de signer
 * une opportunité, sans modifier le typage existant des affaires (qui reste dérivé
 * du numero via getAffaireTypologie).
 *
 * Lien typologie → préfixe :
 * - prototype          → PAS signable (reste 9XXX, dialog signe désactivé)
 * - non_operationnel   → 1XXX ou 3XXX (par défaut 1XXX)
 * - montage_demontage  → 4XXX
 * - fabrication        → 5XXX (default si typologie_future non renseignée)
 * - stockage           → 2XXXX (5 chiffres)
 */
import type { AffaireTypologie } from "@/lib/affaire-typologie";

export type TypologieFuture = AffaireTypologie;

/** Préfixe numérique attendu (1er chiffre) pour la typologie cible. */
export function prefixForTypologie(typo: TypologieFuture | null | undefined): number {
  switch (typo) {
    case "non_operationnel":
      return 1; // ou 3, mais on suggère 1XXX par défaut
    case "montage_demontage":
      return 4;
    case "fabrication":
      return 5;
    case "stockage":
      return 2;
    case "prototype":
      return 9;
    default:
      return 5; // default fabrication
  }
}

/** Longueur attendue du code (4 chiffres sauf stockage qui fait 5). */
export function codeLengthForTypologie(typo: TypologieFuture | null | undefined): number {
  return typo === "stockage" ? 5 : 4;
}

/** Regex de validation du code selon la typologie cible. */
export function codeRegexForTypologie(typo: TypologieFuture | null | undefined): RegExp {
  const prefix = prefixForTypologie(typo);
  const len = codeLengthForTypologie(typo);
  return new RegExp(`^${prefix}\\d{${len - 1}}$`);
}

/** Format placeholder UI (ex "5XXX" ou "2XXXX"). */
export function placeholderForTypologie(typo: TypologieFuture | null | undefined): string {
  const prefix = prefixForTypologie(typo);
  const len = codeLengthForTypologie(typo);
  return `${prefix}${"X".repeat(len - 1)}`;
}

/** Vérifie qu'un code matche le format attendu pour une typologie cible. */
export function isValidCodeForTypologie(
  code: string,
  typo: TypologieFuture | null | undefined,
): boolean {
  return codeRegexForTypologie(typo).test(code.trim());
}

/** Le prototype n'est pas signable (reste opportunité 9XXX). */
export function isSignableTypologie(typo: TypologieFuture | null | undefined): boolean {
  return typo !== "prototype";
}

/**
 * Détecte si le code saisi a un préfixe différent de la typologie déclarée.
 * Utilisé pour avertir le CA mais sans bloquer (toast warning, pas error).
 */
export function codePrefixMismatch(
  code: string,
  typo: TypologieFuture | null | undefined,
): boolean {
  const trimmed = code.trim();
  if (!trimmed || !typo) return false;
  const expected = prefixForTypologie(typo);
  return Number(trimmed[0]) !== expected;
}
