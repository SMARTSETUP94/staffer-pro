# Roadmap Setup Paris — Vue consolidée

**Dernière mise à jour : 26 mai 2026 — post-audit L3**

---

## Vue d'ensemble

| Bloc | Statut | Version | Détails |
|------|--------|---------|---------|
| Socle v0.27–v0.32 | Livré | v0.32.4 | Planning, RLS, cascade devis, validation imports |
| v0.33 Feuille de route | Livré | v0.33 | Vue tableur exportable |
| v0.35 Auto-staffing Fab | Livré | v0.35.14 | Algo backward planning, Gantt, Express, compétences 4 niveaux |
| v0.38 Demi-journée | Livré | v0.38.2 | span_demi_jours, grille AM/PM |
| v0.39 Vue 3 + Stabilité | Livré | v0.39.2b2 | Vue 3 éditable, greedy, E2E |
| v0.40 Refonte Manut | Livré | v0.40.0e | Absorption Bois/Peint/Tap, treetable marge |
| v0.41 Hotfix heures | Livré | v0.41.0a | Heures invisibles employé fix |
| v0.42 Contrats CDDU | Livré | v0.42.2 | Template v2.1, catalogue postes, import Excel |
| v0.43 Hub Chef Mobile S1 | Livré | v0.43.1 | 5 onglets, badges, scope app-side |
| v0.44 Docs/Atelier | Livré | v0.44.7 | Bucket photos, galerie mobile, Kanban atelier, audit |
| v0.45 Historique équipes | Livré | v0.45.1 | Table agrégée, widget, page /mon-equipe-type |
| v0.46 Création comptes | Livré | v0.46 | Invitations admin, self-signup OFF |
| v0.47 Routing + Hub | Livré | v0.47.3 | Post-login centralisé, 4 onglets métiers/postes |
| v0.34.x E2E role-smoke | Livré | v0.34.x | 4 specs anti-fuite RGPD |
| v0.48 Planning par pôle | Livré | v0.48 | Matrice métiers × jours, refonte nav 3 routes extraites |
| Bloc 8 Fiche Objet | Livré partiel | 8.4 DB | 8.1→8.4 DB OK. 8.4 UI, 8.5, 8.6 en attente |
| Sprint D Casting | Livré | v0.49 Sprint D | Typologie phases, alertes équipe 3 sources, planning macro Gantt, E2E |
| Bloc 9 Carte Mission | En cours | 9.6 bis | 9.1→9.6 bis livrés. 9.3→9.5 à finaliser selon Gabin |
| Lot L2 Capabilities | Livré | L2 | 59 capabilities seedées, helpers SQL, catalogue front |
| Batch 9.7 Mobile Wiring | Livré | v0.49 | AppRole 11 rôles, nav mobile câblée, cleanup routes orphelines |
| Bloc 10 Fiche Opportunité | Prêt | — | Analyse livrée, ~38-42h, 11 lots |

---

## Livrés récents (depuis mi-mai 2026)

### Sprint D Casting (v0.49) — Livré complet
- Batch 1 : Typologie phases + alertes équipe opt-in + widget capacité casting
- Batch 2 : Phase logistique dans affaire_equipe.phase + FAB_SOUS_ETAPES 3 sous-blocs + FAB_METIERS 6 métiers + opt-in UI
- Batch 3 : Planning chantier macro Gantt (7 phases + jalons + sous-blocs fab 7 métiers)
- Batch 4 : 4 specs E2E (casting-capacite / inbox-alertes / planning-macro / staffing-rename)

### Bloc 9 — Carte mission pose
- 9.1 ✅ Fondations DB (mission_events + 5 colonnes infos terrain + 3 SF + fallback notif)
- 9.2 ✅ Liste `/mobile/mes-missions` (filtres Cette semaine / Suivante / Passées)
- 9.3 ⏳ Carte détaillée `/mobile/mission/$id` (~5-6h)
- 9.4 ⏳ Heures auto + photos (~5-7h)
- 9.5 ⏳ Signaler problème + 7 specs E2E (~5-7h)
- 9.6 bis ✅ Navigation mobile + équipe chantiers + masquage role_terrain (validé par Gabin)

### Lot L2 — Seed matrice rôles × capabilities (définitif)
- Enum `chef_pose` ajouté à `app_role`
- 59 capabilities seedées en DB avec `scope` (all/team/metier/own/none)
- Helpers SQL `user_has_cap(_cap text)` et `user_cap_scope(_cap text)`
- Catalogue front typé `src/lib/capabilities/catalog.ts` + integrity tests Vitest
- Page `/admin/permissions` étendue à 12 colonnes (11 rôles + legacy)
- Backfill `chef_metier_scoped` → `atelier_chef`

### Batch 9.7 — Mobile Wiring & Role Synchronization
- P1 ✅ : AppRole étendu (11 rôles : +commercial, bureau_etude, atelier_chef, atelier_metier, logistique, poseur, chef_pose), helpers isXxx dans auth-context
- P2 ✅ : Employé nav → onglet "Équipe" `/mobile/equipe-chantiers`
- P3 ✅ : Chef nav → onglet "Missions" `/mobile/mes-missions`
- P4 ✅ : Nettoyage 3 routes orphelines supprimées (`/mobile/mois`, `/mobile/chef/fabrication`, `/mobile/chef/staffer`)

---

## En cours / Prochaines étapes (priorisé)

### Immédiat
1. **Lot L3** — Refonte permissions : audit terminé 26/05, prêt à démarrer (~30-40h).
   - L3.0 `/parametres/utilisateurs` multi-select 11 rôles + caps debug panel (~4h)
   - L3.1 double-filtre fab `casting.edit_phase_fabrication` (~1h)
   - L3.2-L3.5 refacto `isAdmin/isChef` → `user_has_cap()` 200+ call sites (~25-35h)
2. **Finaliser Bloc 9** — 9.3, 9.4, 9.5 selon retours test Gabin (~17-20h).
3. **Bloc 10** — Fiche opportunité (~38-42h, 11 lots). Prêt à démarrer, à prioriser post-L3 ou parallèle selon dispo Gabin.

### Court terme
4. **Lot L4** — Seed data capabilities + MobileBottomNav adaptative unique (1 seule nav, pas 2) + fabrication atelier mobile + fiche affaire mobile enrichie
5. **Lot L5** — Nettoyage legacy isAdmin/isChef + tests E2E permissions
6. **Bloc 8 suite** — 8.4 UI (journal/photos), 8.5 (liens croisés), 8.6 (polish + E2E)

### Moyen terme — Backlog
7. **v0.40 Phase 2** — Horaires précis SILAE (heure_debut/fin/pauses + nuit/sup/35h auto) — SUSPENDU
8. **v0.41 Claude API** — Auto-staffing intelligent 5XXX (utilise affaire_equipe_historique comme feature store)
9. **Centre Analyse Heures** — Onglet consolidé heures + 8 filtres + exports
10. **Logistique avancée** — Autorisations véhicules #56 + sous-traitants + historique + stats
11. **Sprint dette résiduelle v0.36** — Page admin véhicules + audit findings

---

## Dettes actives

| Dette | Fichier | Statut | Cible |
|-------|---------|--------|-------|
| Scope UI admin permissions | `l2-scope-ui-admin-permissions` | En attente | L3 |
| Users multi-select 11 rôles | `parametres-utilisateurs-multi-select` | En attente | L3.0 |
| Mobile fabrication atelier | `mobile-fabrication-a-livrer-en-L4` | En attente | L4 |
| Fiche affaire mobile enrichie | `mobile-fiche-affaire-a-enrichir-en-L4` | En attente | L4 |
| Tests E2E 8.3b scénario 11 | `e2e-specs-83b-scenario-11-revision` | En attente | 8.6 |
| Rename loadActiveStepsForObjet | `load-active-steps-for-objet-rename` | En attente | 8.6 |
| Dialog vs Sheet AddPersonne | `equipe-add-personne-dialog-vs-sheet` | En attente | 8.6 |
| RLS bypass BE objet.edit | `rls-bypass-bureau-etude-objet-edit` | En attente | — |

### Dettes résolues (depuis dernière mise à jour)
- AppRole TS incomplet (`types-app-role-incomplet`) — résolu v0.49 Batch 9.7 P1
- Routes mobile orphelines (`routes-mobile-orphelines`) — résolu v0.49 Batch 9.7 P4

---

## Historique complet des versions

Voir `.lovable/memory/index.md` pour la mémoire détaillée (règles métier, contraintes techniques, contexte par feature).

*Ce document est la vue consolidée. Pour le détail technique d'une livraison, consulter la mémoire associée.*
