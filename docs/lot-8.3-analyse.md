# Lot 8.3 — Zone Équipe & 5 étapes Kanban sur la Fiche Objet

**Statut** : Note d'analyse (à valider avant code)
**Pré-requis** : Lot 8.1 (vue heures + caps + flag `fiche_objet_v1`) + Lot 8.2 (page + identité + heures) livrés.
**Cap clé** : `objet.team.manage` (admin, chef_chantier, atelier_chef ; refusée à commercial, bureau_etude, atelier_metier, employe, poseur, rh).

---

## 1. Architecture composants

```
src/routes/_app.affaires.$affaireId.objets.$objetId.tsx
  └─ FicheObjetPage
       ├─ ObjetIdentiteSection           (8.2 — livré)
       ├─ ObjetHeuresTable               (8.2 — livré)
       ├─ ObjetEquipeSection             (8.3 — nouveau, conteneur zone Équipe)
       │    ├─ EquipeHeaderActions       (boutons « Auto-remplir », état plan)
       │    └─ ObjetEquipeMetierRow[]    (1 ligne par métier requis)
       │         ├─ MetierBadge + KPI (pers requis / pers staffées / heures)
       │         ├─ PersonneChip[]       (employés assignés, retrait)
       │         └─ AddPersonneTrigger   (bouton « + Personne », ouvre Sheet)
       └─ ObjetEtapesGrid                (8.3 — nouveau, 5 cartes Kanban)
            └─ EtapeCard[5]              (BE / Numérique / Bois / Métal / Peint)
                 └─ ouvre <EtapeDialog>  (réutilisation directe, sans wrap)

src/components/objets/equipe/
  ├─ ObjetEquipeSection.tsx
  ├─ ObjetEquipeMetierRow.tsx
  ├─ AssignerPersonneSheet.tsx          (Sheet droite, filtres + liste suggestions)
  └─ index.ts

src/components/objets/etapes/
  ├─ ObjetEtapesGrid.tsx
  ├─ EtapeCard.tsx
  └─ index.ts
```

**Réutilisations strictes** :
- `PersonneSuggestionCard` (déjà existant) consommée telle quelle dans `AssignerPersonneSheet` — props inchangées : `{ suggestion, alreadyAssigned, cumul, onAssign(pct) }`. Le scope `{ objetId, metierId, window }` est résolu **côté serveur** (nouvelle SF `getSuggestionsForObjetMetier`) ; le composant reçoit déjà un `Suggestion[]` prêt.
- `EtapeDialog` (composant fabrication) ouvert en **standalone** depuis `EtapeCard` : props `{ objet, etape, open, onOpenChange, onSaved }` strictement identiques. Aucun wrapper, aucun fork.

---

## 2. Server functions

Fichier : `src/server/objet-equipe.functions.ts`

| SF | Méthode | Cap requise | Retour |
|----|---------|-------------|--------|
| `getObjetEquipe({ objetId })` | GET | `objet.view` | `{ metiers: [{ metier_id, label, pers_requis, heures_devis, heures_staffees, assignations: [{ employe_id, nom, prenom, presence_pct, plan_step_id, tier }] }], plan_status, window: { start, end } \| null }` |
| `getSuggestionsForObjetMetier({ objetId, metierId })` | GET | `objet.team.manage` | `Suggestion[]` (même type que `PersonneSuggestionCard`), classé tier puis score, sur la **fenêtre dérivée du plan staffing actif** de l'objet |
| `assignPersonneToObjet({ objetId, metierId, employeId, presencePct })` | POST | `objet.team.manage` | `{ ok, assignation_ids: string[] }` — crée 1 assignation par jour de la fenêtre + lien `assignation_objets` |
| `removePersonneFromObjet({ objetId, employeId, metierId })` | POST | `objet.team.manage` | `{ removed: number }` — soft remove sur la fenêtre objet uniquement |
| `autoStaffObjet({ objetId })` | POST | `objet.team.manage` | `{ filled, skipped, details: AutoStaffStepResult[] }` — boucle sur les steps du plan publié liés à l'objet, appelle la logique de `autoStaffStep` étape par étape |

**Décision `autoStaffObjet` vs `autoStaffStep`** : on **garde `autoStaffStep` tel quel** (utilisé ailleurs dans le Gantt) et on crée une **nouvelle SF `autoStaffObjet`** qui en est un orchestrateur. Elle :
1. Liste les `staffing_plan_step` rattachés à l'objet (via `staffing_plan_step.objet_id` ou jointure `staffing_plan_step_objets` selon le schéma actuel).
2. Pour chaque step, factorise la logique interne (extraction dans `src/lib/staffing/auto-staff-core.server.ts` partagée avec `autoStaffStep`), évite N appels HTTP/RPC.
3. Renvoie un agrégat `{ filled, skipped, by_metier: Record<metierId, { filled, skipped }> }` pour permettre un toast résumé : « 7 slots remplis, 2 ignorés (aucun candidat) ».

> Si la mutualisation `auto-staff-core` est trop coûteuse pour le Lot 8.3, fallback acceptable : `autoStaffObjet` appelle `autoStaffStep` en boucle séquentielle (Promise.all bridé à 3). À trancher à l'implémentation selon coût refacto.

---

## 3. Granularité d'affichage — Zone Équipe

**Choix recommandé : 1 ligne par métier**, personnes groupées dessous (chips horizontales).

```
┌─────────────────────────────────────────────────────────────────┐
│ Équipe                              [Auto-remplir les manques]  │
│ Plan staffing : publié · fenêtre 12–23 mai · 5 métiers requis   │
├─────────────────────────────────────────────────────────────────┤
│ ● Bois            2/3 pers · 18/24 h staffées        ⚠ 1 manque │
│   [Jean D. 100%] [Marc L. 50%]  ⊕ + Personne                    │
├─────────────────────────────────────────────────────────────────┤
│ ● Métallerie      1/1 pers · 8/8 h staffées          ✓           │
│   [Pierre M. 100%]  ⊕ + Personne                                │
├─────────────────────────────────────────────────────────────────┤
│ ● Peinture        0/2 pers · 0/16 h staffées         ⚠ 2 manques│
│   (aucun assigné)  ⊕ + Personne                                 │
└─────────────────────────────────────────────────────────────────┘
```

- Tri métiers : ordre canonique `staffing-metier-config.ts` (BE → Num → Bois → Métal → Peint → Tap → Manut → Machiniste).
- KPI ligne : `pers_assignées / pers_requises` + `heures_staffées / heures_devis`.
- Badge état : ✓ (complet), ⚠ (manque), ⓘ (sur-staffé > devis).
- Chip personne : avatar initiales + nom + `presence_pct`. Clic → popover avec « Retirer », « Voir dans Gantt ».
- Bouton `+ Personne` : visible **uniquement** si user a `objet.team.manage` ET il reste des slots manquants (sinon icône → secondary discret pour ajouter quand même).

---

## 4. Spec interaction « + Personne »

1. Click `+ Personne` (métier X) → ouvre `AssignerPersonneSheet` (Sheet droite, large).
2. Sheet appelle `getSuggestionsForObjetMetier({ objetId, metierId })` (loader Suspense + skeletons).
3. Header Sheet : « Assigner sur Bois — fenêtre 12–23 mai (10 j ouvrés) ».
4. Filtres : `[Tier 1-4 toggles] [Masquer indisponibles] [Recherche nom]`.
5. Liste de `PersonneSuggestionCard` (réutilisée). `alreadyAssigned` = présent dans l'objet sur ce métier ; `cumul` = somme presence_pct du jour central de la fenêtre.
6. Slider 100% par défaut, surchargeable. Click « Assigner » → `assignPersonneToObjet`.
7. Toast succès + invalidation `['objet-equipe', objetId]` + le Sheet **reste ouvert** (permet d'enchaîner plusieurs ajouts). Fermeture manuelle.

**Matrice cap `objet.team.manage`** (rappel arbitrage Bloc 8.1) :

| Rôle | `+ Personne` | Auto-remplir | Retirer | EtapeDialog (assignment) |
|------|:-:|:-:|:-:|:-:|
| admin | ✅ | ✅ | ✅ | ✅ |
| chef_chantier | ✅ | ✅ | ✅ | ✅ |
| atelier_chef | ✅ | ✅ | ✅ | ✅ |
| rh | ❌ | ❌ | ❌ | ❌ |
| commercial | ❌ | ❌ | ❌ | ❌ |
| bureau_etude | ❌ | ❌ | ❌ | ✅ (étape BE uniquement, via cap `objet.etape.assign.be` héritée existante) |
| atelier_metier | ❌ | ❌ | ❌ | ✅ (étape de son métier — règle EtapeDialog actuelle conservée) |
| employe | ❌ | ❌ | ❌ | ❌ |
| poseur | ❌ | ❌ | ❌ | ❌ |

Sans `objet.team.manage` → boutons masqués (pas seulement disabled). La SF refuse aussi côté serveur.

---

## 5. Spec interaction « Auto-remplir les manques »

- Visible si `objet.team.manage` ET `plan_status === 'published'`.
- Click → `confirm()` léger (AlertDialog) : « Remplir 4 slots manquants avec les meilleurs candidats disponibles ? ».
- Appel `autoStaffObjet({ objetId })`.
- Toast résultat : `« 4 remplis, 0 ignoré »` ou détail si skip (`« 3 remplis, 1 ignoré : aucun Tier1-2 dispo pour Peinture »`).
- Invalidation `['objet-equipe', objetId]` + `['objet-heures', objetId]`.

---

## 6. Comportement quand **0 plan staffing actif**

Cas : objet d'une affaire pas encore planifiée (`plan_status === 'no_plan'` ou `'draft'` sans publication).

**Zone Équipe** :
- Bandeau info en haut : `« Aucun plan de fabrication publié pour cette affaire. L'équipe sera dérivée du devis. »` + lien `« Créer un plan »` (vers `/affaires/$id/fab/staffing` si user a `staffing.plan.create`).
- Lignes métiers générées à partir des **heures devis** de l'objet (`v_objet_heures_consolidees` → métiers avec heures > 0).
- Colonne « pers staffées » → 0/—.
- Boutons `+ Personne` et `Auto-remplir` **disabled** avec tooltip : « Publiez d'abord un plan de fabrication pour assigner des personnes ».
- Raison : sans fenêtre dates, on ne peut pas créer d'assignations cohérentes. On évite la friction d'inventer une fenêtre par défaut (source de bugs futurs).

**Zone Étapes Kanban** : **disponible quand même** (les étapes BE/Num/Bois/Métal/Peint vivent indépendamment du plan staffing, gérées par `fabrication_etapes`). Pas de blocage.

---

## 7. Zone Étapes Kanban (5 cartes)

5 cartes côte à côte (responsive : grille `lg:grid-cols-5 md:grid-cols-3 grid-cols-1`).

```
┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐
│ BE        │ │ Numérique │ │ Bois      │ │ Métal     │ │ Peinture  │
│ ● En cours│ │ ○ À faire │ │ ✓ Terminé │ │ — N/A     │ │ ● En cours│
│ Marc L.   │ │ —         │ │ Jean D.   │ │ —         │ │ Sophie P. │
│ 12 mai    │ │           │ │ 18 mai    │ │           │ │           │
└───────────┘ └───────────┘ └───────────┘ └───────────┘ └───────────┘
```

Click carte → `EtapeDialog` standalone (réutilisé tel quel). Données depuis `fabrication_etapes` (already exposed via `useFabrication` hook). Pas de nouvelle SF.

---

## 8. Cache & invalidation TanStack Query

| QueryKey | Source | Invalidé par |
|----------|--------|--------------|
| `['objet-fiche', objetId]` | 8.2 — `getObjetFiche` | `updateObjetIdentite` |
| `['objet-heures', objetId]` | 8.2 — `getObjetHeures` | autoStaff*, assign/remove |
| `['objet-equipe', objetId]` | 8.3 — `getObjetEquipe` | assignPersonneToObjet, removePersonneFromObjet, autoStaffObjet |
| `['objet-suggestions', objetId, metierId]` | 8.3 — `getSuggestionsForObjetMetier` | assignPersonneToObjet (même metier) |
| `['fabrication-etapes', objetId]` | existant | EtapeDialog `onSaved` |

`staleTime: 30s` sur équipe et suggestions (cohérent avec le reste de la fiche).

---

## 9. Spec E2E

Fichier : `e2e/capabilities/fiche-objet-equipe.spec.ts`

**Préreq** : objet réel d'une affaire 5XXX avec plan staffing publié, 5 employés couvrant Bois/Métal/Peint.

| # | Rôle | Scénario | Attendu |
|---|------|----------|---------|
| 1 | admin | Ouvre fiche → clique `+ Personne` Bois → assigne 100% | Toast OK, chip apparaît, KPI met à jour |
| 2 | admin | Clique `Auto-remplir` | Toast `« N remplis »`, équipe complète |
| 3 | chef_chantier | Même que #1 sur affaire dont il est chef | Identique #1 |
| 4 | chef_chantier | Même mais affaire dont il n'est PAS chef | Boutons masqués + accès SF interdit (401) |
| 5 | atelier_chef | Idem #1 | OK |
| 6 | atelier_chef | `Retirer` une personne | Chip disparaît, KPI MAJ |
| 7 | commercial | Ouvre fiche | Zone Équipe visible **lecture seule**, aucun bouton `+`/`Auto-remplir`/`Retirer` |
| 8 | bureau_etude | Ouvre fiche | Idem #7 ; mais carte étape **BE** cliquable (EtapeDialog ouvert) |
| 9 | atelier_metier (Bois) | Ouvre fiche | Idem #7 ; carte étape **Bois** cliquable, autres lecture seule |
| 10 | employe | Ouvre fiche | Toute la zone Équipe lecture seule, cartes Kanban lecture seule |
| 11 | admin | Objet sans plan publié | Bandeau « aucun plan », boutons disabled + tooltip, étapes Kanban OK |
| 12 | admin | Tentative `assignPersonneToObjet` avec employé déjà saturé (cumul > 100%) | Avertissement avant assign, assignation autorisée mais flag conflit en base |

Helper réutilisable : `e2e/helpers/fiche-objet.ts` exposant `openFicheObjet(page, affaireNumero, objetReference)` et `expectEquipeReadOnly(page)`.

---

## 10. Risques & arbitrages ouverts

| # | Sujet | Reco |
|---|-------|------|
| R1 | Fenêtre d'assignation quand plusieurs steps couvrent l'objet | Utiliser min(start_date) → max(end_date) de tous les steps du métier liés à l'objet |
| R2 | `assignPersonneToObjet` crée 1 row/jour ouvré → volumétrie | OK pour 10-15 j ouvrés × 10 pers ; au-delà, batch insert RPC dédié (post-8.3) |
| R3 | `autoStaffObjet` long si beaucoup de métiers | Loader Sheet + toast progress ; timeout serveur acceptable car ≤ 8 métiers |
| R4 | Refacto `auto-staff-core` partagée vs duplication | Préférence : extraction propre dans `src/lib/staffing/auto-staff-core.server.ts`. Si charge > 4h, fallback boucle |
| R5 | Conflits si plan republié pendant qu'on assigne | Refetch silencieux + warning si `plan_published_at` changé entre ouverture Sheet et assign |

---

## 11. Estimation

- Server functions + helpers : **6-8h**
- ObjetEquipeSection + sous-composants : **5-7h**
- AssignerPersonneSheet : **3-4h**
- ObjetEtapesGrid + EtapeCard : **2-3h** (réutilisation EtapeDialog)
- E2E 12 scénarios + helpers : **4-5h**
- Polish, états vides, accessibility : **2h**

**Total : 22-29h** (1 sprint).

---

## 12. Points à arbitrer avant code

1. **`autoStaffObjet` : extraction `auto-staff-core` (propre) ou boucle `autoStaffStep` (rapide) ?** Reco : extraction.
2. **Cas « 0 plan publié » : bandeau + disabled, OK ? Ou autoriser assignation libre avec fenêtre par défaut (semaine en cours) ?** Reco : disabled (cohérence données).
3. **`+ Personne` visible en lecture seule pour les rôles sans cap ?** Reco : **masqué** (zéro friction, zéro fausse promesse).
4. **`presence_pct` par défaut sur slider** : 100% ou dernière valeur utilisée dans la session ? Reco : 100%.
5. **Retrait d'une personne assignée par plan staffing (origine non-manuelle)** : autoriser ? Avec confirmation ? Reco : autoriser avec AlertDialog « Cette personne provient du plan publié. La retirer ici ne re-staffera pas automatiquement. ».
