# Lot 8.2c — Note d'analyse (avant code)

Scope : 4 corrections sur la fiche objet + lien /fabrication. Estimé 6-8h.
Test mobile (Corr. 5) reporté.

---

## Correction 1 — Retrait bloc heures du `ObjetIdentiteSection` ✅ VALIDÉ

**Décision** : suppression nette du sous-bloc "Heures prévues (devis) — par
métier" dans `ObjetIdentiteForm` (mode read + edit). La table dédiée
`ObjetHeuresTable` (Prévu / Planifié / Réel / Écart) devient **source
unique** des heures sur la fiche.

**Implémentation** :
- `ObjetIdentiteForm.tsx` : retirer la grille `heures_prevues_*` (lignes ~120-180 estimé).
- `ObjetIdentiteValues` type : conserver les champs `heures_prevues_*` dans le type
  (utilisés ailleurs : import devis, recap, staffing) — on ne supprime QUE l'affichage.
- `objet-fiche-permissions.ts` : retirer les 7 clés `heures_prevues_*` de la
  matrice editable (plus exposées via la fiche → plus de chemin d'édition direct).
  Cohérent avec le principe "heures = sortie du devis, pas saisie manuelle fiche".
- `updateObjetIdentite` SF : whitelist mise à jour, rejet silencieux si tentative.

**Risque** : aucun, les heures restent éditables via réimport devis + cell-edit planning.

---

## Correction 2 — Algo écart corrigé ✅ VALIDÉ avec précision

**Logique tranchée** (à coder dans `objet-heures-helpers.ts`, fonction pure
`computeEcart(prevu, reel)` + `ecartVariant(prevu, reel)` pour le tone) :

```
prevu = 0, reel = 0          → { display: '—',                tone: 'muted' }
prevu = 0, reel > 0          → { display: '+{reel}h non prévues', tone: 'amber' }
prevu > 0, reel = 0          → { display: 'Non démarré',      tone: 'muted' }
prevu > 0, reel > 0          → pct = (reel - prevu) / prevu * 100
                                |pct| ≤ 5      → tone: 'success' (vert)
                                -25 < pct < -5 → tone: 'info'    (vert clair, sous-conso)
                                pct ≤ -25      → tone: 'warning' (ambre, sous-conso forte = peut-être pas fini)
                                5 < pct ≤ 15   → tone: 'warning' (ambre)
                                pct > 15       → tone: 'destructive' (rouge)
                                display: '{+/-}{pct}%' (1 décimale si |pct| < 10)
```

**Précision** : ajout d'un seuil `-25%` (sous-conso forte = ambre, pas vert clair),
sinon un objet à 1h sur 8h prévues passe en vert ce qui masque "pas commencé
sérieusement". Si tu préfères garder vert clair jusqu'à -100% non-zero,
je retire le seuil — dis-moi.

**Tests** : ajout `objet-heures-helpers.test.ts` (8 cas : matrice 4×3 + bordures
5% / 15% / 25%).

---

## Correction 3 — 5 champs (dimensions + matériaux + finition_detail)

### DB

Migration :
```sql
ALTER TABLE fabrication_objets
  ADD COLUMN largeur_mm       integer,
  ADD COLUMN longueur_mm      integer,
  ADD COLUMN hauteur_mm       integer,
  ADD COLUMN materiaux        text,
  ADD COLUMN finition_detail  text;

-- check : valeurs > 0 si renseignées
ALTER TABLE fabrication_objets
  ADD CONSTRAINT fab_obj_dims_positives CHECK (
    (largeur_mm  IS NULL OR largeur_mm  > 0) AND
    (longueur_mm IS NULL OR longueur_mm > 0) AND
    (hauteur_mm  IS NULL OR hauteur_mm  > 0)
  );

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_fab_obj_materiaux_trgm
  ON fabrication_objets USING gin (materiaux gin_trgm_ops);
CREATE INDEX idx_fab_obj_finition_trgm
  ON fabrication_objets USING gin (finition_detail gin_trgm_ops);
```

**Index GIN trigram : OK validé.** `pg_trgm` est déjà dispo sur Supabase (utilisé
ailleurs pour recherche fuzzy employés). Coût : ~quelques ko par index sur 1000
objets, négligeable. Bénéfice : `WHERE materiaux ILIKE '%chêne%'` instantané quand
le sprint analytique arrivera.

**Pas de migration parser** : Progbat ne remplit pas ces champs en V1, NULL par défaut.

### UI

Dans `ObjetIdentiteForm` (read + edit), après les champs existants
(références/nom/qté/finition type/responsable), avant `commentaire` :

1. **Bloc "Dimensions"** : 3 inputs `type="number"` inline, label inline `L × l × h`,
   suffixe `mm`. Affichage read-only formaté avec `Intl.NumberFormat('fr-FR')`
   → `1 200 × 600 × 750 mm`. Si tous NULL → ligne masquée en read mode.
2. **Champ "Matériaux"** : `<Textarea rows={2}>`, placeholder donné.
3. **Champ "Finition détaillée"** : `<Input>` text simple, posé juste sous
   `type_finition` (le select enum existant reste, ce champ le précise).

### Matrice de permissions

Ajout dans `objet-fiche-permissions.ts` :

```ts
const FIELD_ROLES: Record<ObjetEditableField, Role[]> = {
  // ... existants
  largeur_mm:      ['admin', 'chef_chantier', 'bureau_etude'],
  longueur_mm:     ['admin', 'chef_chantier', 'bureau_etude'],
  hauteur_mm:      ['admin', 'chef_chantier', 'bureau_etude'],
  materiaux:       ['admin', 'chef_chantier', 'bureau_etude'],
  finition_detail: ['admin', 'chef_chantier', 'bureau_etude', 'chef_atelier'],
};
```

Conforme matrice fournie (commercial exclu partout).

`updateObjetIdentite` SF : aucune modif structurelle, le whitelist passe par
`getEditableFields(roles)` qui lit FIELD_ROLES → propagation auto.

### Tests E2E à ajouter

- `fiche-objet.bureau-etude.spec.ts` : édite L/l/h + materiaux + finition_detail → save OK.
- `fiche-objet.atelier-chef.spec.ts` : `finition_detail` éditable, L/l/h/materiaux read-only.
- `fiche-objet.commercial.spec.ts` : tous les 5 champs read-only.

---

## Correction 4 — Bouton "Fiche" sur /fabrication

**Décision** : Option A (chip texte + icône) — découvrable d'un coup d'œil.

**Wording** : `Fiche` (4 lettres, courts, neutre). Pas `Voir fiche` ni `Ouvrir`
pour rester compact dans une cellule de table.

**Composant** :
```tsx
<Button asChild variant="outline" size="sm" className="h-7 px-2 gap-1">
  <Link to="/affaires/$affaireId/objets/$objetId" params={...} data-testid="objet-fiche-link">
    <ExternalLink className="h-3 w-3" />
    <span className="text-xs">Fiche</span>
  </Link>
</Button>
```

**Placement** :
- **Desktop table** (`/fabrication`) : nouvelle colonne dédiée à droite (après
  Actions existantes), header vide ou "Détail". Largeur ~80px.
- **Mobile card** (`ObjetCardMobile`) : bouton full-width en bas de card,
  variant outline, déjà visible dans la zone tactile.

Pas de changement de cap (`objet.view` reste la garde), juste un rendu plus
gros.

---

## Notes hors-scope (mémoire)

À ajouter à `mem://features/fiche-objet.md` en fin de Lot 8.2c :
- Bascule Total/Unitaire non testée (qté > 1) — à valider Lot 8.3 ou 8.4.
- Logistique : pipeline staffing ne couvre pas Logistique → soit on exclut la
  ligne de `ObjetHeuresTable`, soit on documente. **Recommandation** :
  garder la ligne avec `planifié = —` (tone muted) + tooltip "Logistique gérée
  hors planning fabrication" → clarté sans bug perçu. À trancher au moment de
  l'implémentation.

---

## Plan d'exécution (ordre)

1. Migration DB (5 colonnes + check + index trigram) — `supabase--migration`
2. `objet-fiche-permissions.ts` : retire heures_prevues_*, ajoute 5 nouveaux champs
3. `ObjetIdentiteForm` : retire bloc heures, ajoute Dimensions + Matériaux + Finition détaillée
4. `objet-heures-helpers.ts` : `computeEcart` + `ecartVariant` + tests
5. `ObjetHeuresTable` : branche le helper, retire les `-100%`
6. `/fabrication` route + `ObjetCardMobile` : bouton "Fiche" Option A
7. Spec E2E : `fiche-objet.bureau-etude` + `.atelier-chef` + `.commercial`
   (3 nouveaux champs)
8. MAJ mémoire `fiche-objet.md` + note hors-scope (Total/Unit, Logistique)

---

## Questions ouvertes (1 seule)

1. **Seuil -25% sous-conso forte** (Correction 2) : tu valides l'ajout d'un
   palier ambre, ou tu préfères garder vert clair monotone pour toute
   sous-consommation ? (Mon vote : garder le palier -25% — un objet à 1h/8h
   n'est PAS sous-budget, il n'est juste pas fini.)

Reste : index trigram OK, wording "Fiche" OK, déplacement heures OK, matrice
conforme. Si tu valides la Q1 → je peux démarrer code immédiatement.
