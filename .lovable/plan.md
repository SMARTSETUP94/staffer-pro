## Plan de travail — Bloc 10 TERMINÉ + Suite roadmap (28 mai 2026)

### ✅ Bloc 10 — Fiche opportunité (LIVRÉ, 28 mai 2026)

| Sous-lot | Statut | Référence |
|---|---|---|
| 10.1 Fondations DB | ✅ Livré | `mem://features/bloc-10-1-fondations-db` |
| 10.2 Inbox extension + Cleanup Risque #1 | ✅ Livré | `mem://features/bloc-10-2-inbox-extension` |
| 10.3 Fiche UI | ✅ Livré | `mem://features/bloc-10-3-fiche-ui` |
| 10.4 Listing refactor + import | ✅ Livré | `mem://features/bloc-10-4-listing-refactor` |
| 10.5 Tests + cleanup final | ✅ Livré | `mem://features/bloc-10-fiche-opportunite` |

**Total réel : ~17h30** (vs 38h estimé V1 complet). 196 opps legacy archivées. Dette `inbox-opp-action-create-table` RÉSOLUE.

---

### ✅ Lot L3b2 + L5-A + L4c — Refonte permissions & cleanup (LIVRÉ, 28 mai 2026)

| Sous-lot | Statut | Détail |
|---|---|---|
| L3b2-A | ✅ Livré | Paramètres + Admin → `requireCapability()` |
| L3b2-B | ✅ Livré | Devis + Imports (6 fichiers) |
| L3b2-C | ✅ Livré | Affaires + Staffing (5 fichiers) |
| Sidebar cleanup | ✅ Livré | Stubs retirés + test cohérence sidebar↔routes |
| L5-A safe | ✅ Livré | Suppression `chef_metier_scoped` code applicatif |
| L5-A-bis Phase 1 | ✅ Livré | DROP 14 policies + 2 helpers SQL DB |
| L4c | ✅ Livré | Cleanup stubs routes orphelines + commentaires |

**Total réel : ~3h55**. `chef_metier_scoped` totalement purgé (code + DB Phase 1). 35/35 tests verts.

---

## Roadmap à jour — voir `.lovable/memory/index.md` et `mem://roadmap/consolidee-2mai2026.md`

Prochains items prioritaires :
1. **Bloc 9** — Carte mission pose (9.3 carte détaillée, 9.4 heures auto, 9.5 signaler problème)
2. **Bloc 8** — Fiche objet suite (8.4 UI Journal/Photos, 8.5 liens croisés, 8.6 polish + E2E)
3. **Bloc 10 suite** — Visites, échantillons, moodboard (reportés)
4. **Lots L3→L5** — L3 restant (multi-select users + debug panel + call sites restants), L4, L5-B
