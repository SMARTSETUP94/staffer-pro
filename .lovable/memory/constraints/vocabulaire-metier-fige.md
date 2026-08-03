---
name: vocabulaire-metier-fige
description: Vocabulaire métier 2026 figé en dur (Assigner / Auto-remplir / Plan de fab / Valider heures) — plus de flag vocab_metier_v1 ni de useVocab()
type: constraint
---
Le vocabulaire métier 2026 est DÉFINITIF et écrit en dur dans l'UI. Le flag
`vocab_metier_v1`, le hook `useVocab()` (`src/hooks/use-vocab.ts`) et les maps
`VOCAB_LABELS_LEGACY` / `VOCAB_LABELS_NEXT` ont été supprimés.

Libellés canoniques :
Assigner en lot · Assigner ponctuel · Assigner vite · Auto-remplir (complet /
plan complet / terminé / fabrication) · Plan de fab · Valider heures ·
Valider les heures de l'équipe.

Interdits en UI : « Staffer », « Auto-staffing », « Plan staffing »,
« Validation heures ». Exception assumée : « Express » reste tel quel.

Technique INCHANGÉ : routes (`/staffing/$planId`, `/staffer-mobile`,
`/validation-heures`), queryKeys, noms de RPC/serverFn, noms de composants TS.

Les libellés de rôles restent centralisés dans `src/lib/labels.ts` (`roleLabel`).
