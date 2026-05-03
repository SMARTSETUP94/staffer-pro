# Auto-staffing v0.35 — Guide utilisateur

> Module de planification déterministe pour les chantiers Fabrication 5XXX.
> Calcule automatiquement la chaîne BE → Numérique → Bois/Métal → Peinture/Tapisserie → Manutention en remontant depuis la date de livraison HARD (`date_fin_fab`).

## Pour qui ?

| Rôle | Accès |
|---|---|
| **Admin** | Plein accès (création, édition, publication, restauration, vue Charge atelier). |
| **Chef chantier** | Idem admin sauf suppression de plan. |
| **Employé** | Voit uniquement **ses** affectations dans `/planning` ou `/ma-semaine`. Aucun accès à `/charge-atelier` ni `/staffing/$planId`. |

## Parcours métier

### 1. Créer un plan depuis une affaire 5XXX

Onglet **Fabrication** d'une affaire 5XXX → bandeau **Auto-staffing v0.35** en haut.

1. Sélectionne `date_debut_fab` et `date_fin_fab` (date livraison HARD, pré-rempli depuis `affaire.date_montage`).
2. Coche les objets à inclure (les non-cochés ne consomment ni heures ni machine).
3. Clique **Calculer le planning** → redirection vers `/staffing/$planId`.

> **Raccourci Devis** : depuis l'onglet Devis d'une affaire 5XXX, le bouton ✨ **Mettre au planning** ouvre le wizard en dialog.

### 2. Ajuster le Gantt interactif

Sur `/staffing/$planId` :
- **Stats** : volume total h, durée chantier, pic effectif atelier, nb conflits CNC.
- **Drag chevrons +/- shift** (jours) sur chaque barre Gantt.
- **Sliders pers** (Bois/Peinture, 2-12 par pas de 2) sous le header de chaque objet.
- **Drill-down** : clic sur cellule CNC en conflit → liste des chantiers concernés avec lien direct.
- **Recalculer** : bouton 🔄 réapplique l'algo backward en préservant les overrides manuels.

### 3. Affecter les personnes

Section **Personnes** sous le Gantt :
- Suggestions classées par **Tier** (voir §Granularité 4 niveaux ci-dessous) : Tier 1 (CDI/CDD Principal) → Tier 2 (CDI/CDD Secondaire) → Tier 3 (Intérim) → Tier 4 (CDI/CDD Dépannage, dernier recours).
- Chaque candidat affiché avec score, contrat, dispo restante.
- Clic **Affecter 100%** → INSERT instantané.
- Slider présence (10-100%) pour split entre 2 chantiers le même jour. Conflits cumul > 100% en rouge.

### 4. Publier vers le Planning principal

Bouton **Publier le plan** (visible si `status=draft` + chef/admin).

À la publication :
1. Snapshot complet écrit dans `staffing_plan_snapshot` (immuable).
2. Plan précédent du même chantier → `archived`.
3. Lignes `assignations` créées avec `type_operation='auto_staffing'` et `staffing_plan_id`.
4. Notifications `staffing_publie` envoyées à chaque personne affectée.
5. Badge **AS** apparaît sur les créneaux dans `/planning`.

### 5. Versions & Restauration

Bouton **Historique** → drawer timeline des snapshots :
- `initial_calc` (premier calcul)
- `manual_edit` (modif chef)
- `publish` (publication)
- `restore` (rollback)

**Restaurer cette version** (admin only) → re-applique le `snapshot_data` et crée automatiquement un snapshot `restore` pour traçabilité.

### 6. Vue Charge atelier multi-chantiers

`/charge-atelier` (chef+admin only) :
- 4 semaines glissantes.
- Heatmap × 7 métiers.
- 1 couleur par chantier actif.
- Conflits CNC en rouge avec drill-down.
- Cellules pic global > 12 personnes cliquables (breakdown chantier × métier).

## Constantes algorithmiques

| Paramètre | Valeur | Source |
|---|---|---|
| Tier CDI bonus | +1.0 | `tier-ranking.ts` |
| Tier CDD bonus | +0.9 | `tier-ranking.ts` |
| Tier Intérim bonus | +0.3 | `tier-ranking.ts` |
| LAG Numérique → Bois | ⌈0.3 × span_Num⌉ jours | `algo.ts` |
| Pic atelier soft | 12 personnes | warning visuel |
| Heures/jour métier | 8h | `staffing_plan_step.h_par_jour` |

## Sécurité (audit v0.35.6)

- ✅ RLS chef+admin sur `staffing_plan_*` (write).
- ✅ Employé voit uniquement `staffing_plan_assignment` où il est affecté.
- ✅ `machine_reservation` : SELECT chef+admin only (pas de fuite cross-affaires).
- ✅ Snapshots immuables (pas d'UPDATE/DELETE policies).
- ✅ Routes `/charge-atelier` et `/staffing/$planId` protégées par guard client `isAdminOrChef`.
- ✅ Pas d'edge function publique liée à v0.35.
