/**
 * useVocab — Hook React qui retourne le libellé métier résolu en fonction
 * du flag `vocab_metier_v1` (Lot 7.1 bis).
 *
 * - Flag OFF (défaut) → renvoie les libellés LEGACY (compatibilité prod)
 * - Flag ON  → renvoie les nouveaux libellés métier
 *
 * Cleanup deadline : 2 semaines après enabled_globally=true. Voir
 * src/lib/labels.ts → VOCAB_LABELS_LEGACY pour la suppression.
 */
import { useMemo } from "react";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import {
  VOCAB_LABELS_LEGACY,
  VOCAB_LABELS_NEXT,
  type VocabKey,
} from "@/lib/labels";

export function useVocab(): Record<VocabKey, string> {
  const enabled = useFeatureFlag("vocab_metier_v1");
  return useMemo(
    () => (enabled ? VOCAB_LABELS_NEXT : VOCAB_LABELS_LEGACY),
    [enabled],
  );
}
