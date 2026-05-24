---
name: bypass-objet-equipe-strict-temp
description: Flag SQL temporaire app.bypass_objet_equipe_strict pour trigger enforce_objet_equipe_strict pendant Sprints A→C
type: constraint
---

# Bypass trigger strict objet_equipe (TEMPORAIRE Sprints A → C)

## Contexte
Sprint A introduit le trigger `enforce_objet_equipe_strict()` sur `fabrication_objet_equipe` :
toute insertion doit avoir une ligne `affaire_equipe(affaire_id, employe_id, phase='fabrication')` correspondante.

Pendant la coexistence avec le code Lot 8.3b (qui insère directement dans assignations / staffing_plan_assignment sans cascader sur affaire_equipe), un flag de bypass session est en place :

```sql
SET LOCAL app.bypass_objet_equipe_strict = 'true';
-- INSERT ...
RESET app.bypass_objet_equipe_strict;
```

Le trigger lit ce flag via `current_setting('app.bypass_objet_equipe_strict', true)` et skip la vérification si `= 'true'`.

## Usage actuel
- Backfill 5 (objet_equipe niveau 3) utilise le flag (migration Sprint A).
- Wrapper SF `assignManualToObjet` (Lot 8.3b) DOIT être patché pour utiliser le flag tant qu'il ne cascade pas sur `affaire_equipe` d'abord.

## À retirer
**Fin Sprint C** : quand `assignManualToObjet` aura été refactoré pour cascader correctement (INSERT `affaire_equipe` puis INSERT `fabrication_objet_equipe`), retirer :
1. Toutes les occurrences de `SET LOCAL app.bypass_objet_equipe_strict` dans les SF / RPC.
2. Le bloc `IF v_bypass = 'true' THEN RETURN NEW; END IF;` dans `enforce_objet_equipe_strict()`.

Le trigger redevient autoritaire sans bypass possible.

## Pourquoi pas plus tôt
Si on supprime le flag avant que `assignManualToObjet` cascade : tous les ajouts manuels d'une personne sur un objet via fiche objet (Lot 8.3b livré) plantent avec "employe non présent dans affaire_equipe".
