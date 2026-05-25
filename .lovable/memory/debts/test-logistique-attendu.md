---
name: Test Sprint C "rejette logistique" obsolète
description: 1 échec attendu post-Batch 2 Sprint D — test sprint-c-equipe-mutations.test.ts L44-48 assert que `logistique` est rejeté, devenu phase valide.
type: constraint
---

## Contexte

Fichier : `src/lib/__tests__/sprint-c-equipe-mutations.test.ts` lignes 44-48.

```ts
it("rejette une phase inconnue", () => {
  expect(() =>
    upsertAffaireEquipeSchema.parse({ ...base, phase: "logistique" as never }),
  ).toThrow();
});
```

Avant Batch 2 Sprint D, `logistique` n'existait pas → test cohérent.
Batch 2 a ajouté `logistique` aux 5 phases valides (`PHASE_ENUM` dans
`equipe-mutations-schemas.ts`) → ce test échoue **par construction**.

## Statut

- Échec **attendu** (pas une régression).
- Comptabilisé dans le bilan "10 échecs Vitest pré-existants" Batch 2.
- Couvert positivement par `sprint-d-batch2.test.ts` L23-30 ("PHASE_ENUM
  accepte les 5 phases dont logistique").

## Correctif prévu

Remplacer le payload `logistique` par une phase réellement inconnue, ex
`"phase_inexistante"`, dans Batch 3 ou mini-batch dette. Pas d'urgence,
0 impact runtime.
