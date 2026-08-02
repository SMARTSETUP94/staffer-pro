---
name: Tests rouges pré-existants — RÉSOLUS (lot D/E, 2 juin 2026)
description: Historique des 21 tests rouges pré-existants (7 fichiers) et de leur correction. Aucune régression des lots A/B ; tous verts depuis le lot D/E.
type: constraint
---
# Dette — tests rouges pré-existants : SOLDÉE

## Compte réel : 21 tests / 7 fichiers (la fiche ne traçait que 9)

| Fichier | Tests | Cause réelle | Correction |
|---|---|---|---|
| `dashboard-layout.test.ts` | 4 | catalogue passé à 26 widgets (chef 19, perso 5) | attentes alignées 26/19/5 |
| `dashboard-personnaliser.test.ts` | 4 | même cause (25 vs 26) | attentes alignées 26 |
| `affaire-typologie.test.ts` | 1 | couleurs figées en hex, plus en `var(--typologie-*)` | regex accepte hex **ou** token |
| `typologie-future.test.ts` | 6 | **LOT 0** : fabrication → préfixe `6` (5XXX épuisés) | attentes 6 / `6XXX` ; `5042 + fabrication` = mismatch signalé (non bloquant) |
| `matrix-integrity.test.ts` | 2 | catalogue caps passé de 59 à 79 clés ; clés en namespace pointé (`opportunites.read.all`) et non préfixe de groupe | total 79 + règle « clé pointée valide » |
| `objet-fiche-permissions.test.ts` | 1 | Lot 3 P2 : `atelier_metier` peut commenter | rôle sorti de la liste lecture seule + test dédié « commentaire uniquement » |
| `use-capability-scope.test.ts` | 3 | env `node` sans DOM | pragma `@vitest-environment happy-dom` (jsdom n'est pas installé) |

## Imputabilité
Aucun de ces 21 tests n'est une régression des lots A ou B. Le seul groupe imputable à un lot récent est `typologie-future` (LOT 0, préfixe 6XXX) — attentes mises à jour, pas de code produit modifié.

## Vérification
```bash
bunx vitest run   # 122 fichiers / 1739 tests verts
```
