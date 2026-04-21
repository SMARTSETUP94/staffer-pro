# Audit Lot 8 — Module Heures

Périmètre : saisie mobile/desktop (`mes-heures`), validation chef (`validation-heures`), historique (`heures_saisies_historique`), export XLSX, cycle rejet/acquittement.

---

## 🔴 Critiques (à corriger en priorité)

### Finding #1 — Pré-remplissage automatique en boucle infinie potentielle
**Fichier** : `src/hooks/use-mes-heures.ts` L196-225
**Symptôme** : le `useEffect` d'autofill dépend de `rows` (recalculé à chaque render). Sans garde, si l'INSERT échoue silencieusement (RLS, contrainte) ou si la mise à jour `setSaisies` n'arrive pas avant le prochain render, l'effet se rejoue et renvoie les mêmes inserts → **explosion de doublons** sur `heures_saisies` pour le même `(employe_id, date, assignation_id)`.
**Impact** : duplication de saisies, totaux faussés, validation chef bruitée.
**Remédiation** :
1. Ajouter une contrainte `UNIQUE(employe_id, assignation_id)` (ou `(employe_id, date, demi_journee)`) sur `heures_saisies` + `ON CONFLICT DO NOTHING` côté insert.
2. Ajouter un `useRef<Set<string>>` pour mémoriser les `assignation_id` déjà tentés dans la session.
3. Logger les erreurs (`console.warn`) au lieu de les avaler.

### Finding #2 — Validation/rejet bulk sans vérification de statut courant
**Fichier** : `src/routes/_app.validation-heures.tsx` L137-174
**Symptôme** : `validateBulk` envoie `update({ statut: "valide" }).in("id", ids)` sans filtre `eq("statut", "soumis")`. Si l'UI est désynchronisée (autre chef vient de valider/rejeter en parallèle), on peut **re-valider une saisie déjà rejetée** ou **écraser un rejet** sans repasser par le motif.
**Impact** : perte du motif de rejet, état incohérent côté employé, audit trail trompeur.
**Remédiation** : ajouter `.eq("statut", "soumis")` sur les UPDATE bulk (validate + reject), et après l'opération comparer `data.length` vs `ids.length` pour avertir si certaines lignes ont été ignorées.

### Finding #3 — Export XLSX limité à 5000 lignes sans pagination
**Fichier** : `src/routes/_app.validation-heures.tsx` L189
**Symptôme** : `.limit(5000)` en dur. Sur une période large (filtre "all" + plusieurs mois), l'export est **silencieusement tronqué**. Aucun avertissement.
**Impact** : exports comptables/paie incomplets sans que l'utilisateur s'en aperçoive.
**Remédiation** : récupérer en pagination (range 0–999, 1000–1999…) jusqu'à `data.length < pageSize`, ou afficher un toast d'avertissement explicite si `data.length === 5000`.

---

## 🟠 Élevés

### Finding #4 — `setSaisies` mute `existing` directement (anti-pattern React)
**Fichier** : `src/hooks/use-mes-heures.ts` L169-173
**Symptôme** : `existing.saisie = s;` dans la boucle de fusion = mutation directe d'un objet stocké dans `byKey`. Comme `byKey` n'est pas issu d'un `setState`, ça reste invisible, **mais** si demain on partage l'objet entre `rows` et un autre `useMemo`, on aura des renders manqués.
**Remédiation** : `byKey.set(k, { ...existing, saisie: s });`

### Finding #5 — Filtre employé/affaire dans validation-heures non scopé par chef
**Fichier** : `src/routes/_app.validation-heures.tsx` L82-89
**Symptôme** : tous les chefs voient **tous les employés et toutes les affaires** dans les filtres, même ceux dont ils ne sont pas chef de chantier. Si vous ajoutez un jour la notion de "mon périmètre" (chef_chantier_id sur affaires), il faudra le scoper.
**Impact** : actuel = aucun (RLS chef = full), mais à anticiper si vous restreignez les chefs à leurs affaires.
**Remédiation** : à documenter pour le moment ; ajouter `.eq("chef_chantier_id", currentEmployeId)` sur les affaires si ce mode arrive.

### Finding #6 — Acquittement rejet ne déclenche pas reload des assignations
**Fichier** : `src/hooks/use-mes-heures.ts` L280-288
**Symptôme** : `acknowledgeRejet` met à jour `setSaisies` localement, mais le statut passe à `brouillon`. Le `rejectedNotAcked` se vide bien, mais si la BDD a appliqué un trigger qui modifie d'autres champs (ex: `motif_rejet_lu_le`), seul le retour de la RPC est appliqué → OK aujourd'hui car la RPC retourne toute la ligne, **mais aucun rafraîchissement des notifications** liées.
**Remédiation** : appeler `useNotifications().refresh()` après acquittement pour faire disparaître la notif "heures rejetées" associée.

### Finding #7 — Pas d'index sur `heures_saisies(employe_id, date)` ni `(statut, date)`
**Symptôme** : les 2 requêtes principales filtrent sur `(employe_id, date BETWEEN)` (mes-heures) et `(statut, date BETWEEN)` (validation-heures). Sans index composite, scan séquentiel dès qu'on dépasse quelques milliers de lignes.
**Remédiation** : migration
```sql
CREATE INDEX IF NOT EXISTS idx_hs_employe_date ON public.heures_saisies (employe_id, date);
CREATE INDEX IF NOT EXISTS idx_hs_statut_date ON public.heures_saisies (statut, date);
```

---

## 🟡 Moyens

### Finding #8 — `Textarea` importé puis `void` (dead import)
`MesHeuresGrid.tsx` L8 + L367 : `import { Textarea }` puis `void Textarea`. À retirer si non utilisé, ou utiliser pour le commentaire long (ce qui serait mieux UX en mobile).

### Finding #9 — Variant desktop affiche motif rejet, variant mobile non
`MesHeuresGrid.tsx` L352 : la condition `variant === "desktop"` cache le motif de rejet sur mobile. Or l'employé saisit principalement sur mobile. Le banner global (L75-112) affiche bien les motifs, mais une fois acquittés ils disparaissent du banner et **ne sont plus visibles sur la ligne mobile**.
**Remédiation** : afficher le motif sur les deux variants (le retirer du `variant === "desktop"` check).

### Finding #10 — `handleExport` exporte `data as any` sans typage
`_app.validation-heures.tsx` L194 : cast `as any` masque un éventuel mismatch entre la query select et le type `ExportRow`. Définir un type partagé.

### Finding #11 — Historique non visible côté UI
La table `heures_saisies_historique` est bien remplie par trigger (`log_heures_saisies_transition`), avec RLS de lecture pour l'employé concerné. **Mais aucun composant ne l'affiche**. Pour les chefs, c'est une perte d'audit trail visible.
**Remédiation** : ajouter un drawer "Historique" sur chaque ligne de validation-heures (qui, quand, quel statut, quel motif).

### Finding #12 — Pas de filtrage par date dans l'historique des saisies (côté DB)
La table `heures_saisies_historique` n'a pas d'index sur `heure_saisie_id`. Si la table grossit (1 ligne par transition × milliers de saisies), `JOIN` sur `id` deviendra lent.
**Remédiation** :
```sql
CREATE INDEX IF NOT EXISTS idx_hsh_heure_saisie ON public.heures_saisies_historique (heure_saisie_id, created_at DESC);
```

---

## 🟢 Bas / cosmétique

### Finding #13 — Variable inutile `TZ_OFFSET_DAYS`
`use-mes-heures.ts` L66 + L341 : constante à 0 jamais utilisée, suivie d'un `void`. À supprimer.

### Finding #14 — Bouton "Soumettre la semaine" affiche le nombre de brouillons
Bouton désactivé si `draftCount === 0` mais le label montre `({draftCount})` même quand 0. UX : afficher "Tout est soumis" quand 0.

### Finding #15 — Toast "X saisie(s) validée(s)" ne distingue pas les ignorées
Lié au Finding #2 : si on ajoute le filtre `eq("statut", "soumis")`, retourner le `count` réel et l'afficher.

### Finding #16 — `heures_reelles` peut être négatif côté DB
Pas de CHECK sur `heures_reelles >= 0`. UI met `min="0"` mais un POST direct passerait.
**Remédiation** : `ALTER TABLE heures_saisies ADD CONSTRAINT chk_heures_positives CHECK (heures_reelles IS NULL OR heures_reelles >= 0);`

---

## Récap par priorité

| # | Sévérité | Sujet | Fichier / Migration |
|---|----------|-------|---------------------|
| 1 | 🔴 Critique | Risque doublons autofill | `use-mes-heures.ts` + DB unique constraint |
| 2 | 🔴 Critique | Bulk validate/reject sans guard statut | `_app.validation-heures.tsx` |
| 3 | 🔴 Critique | Export tronqué à 5000 lignes | `_app.validation-heures.tsx` |
| 4 | 🟠 Élevé | Mutation directe `existing.saisie` | `use-mes-heures.ts` |
| 5 | 🟠 Élevé | Scope chef futur | doc / future feature |
| 6 | 🟠 Élevé | Notif rejet non rafraîchie | `use-mes-heures.ts` |
| 7 | 🟠 Élevé | Index DB manquants | migration |
| 8 | 🟡 Moyen | Dead import `Textarea` | `MesHeuresGrid.tsx` |
| 9 | 🟡 Moyen | Motif rejet caché sur mobile | `MesHeuresGrid.tsx` |
| 10 | 🟡 Moyen | Cast `as any` export | `_app.validation-heures.tsx` |
| 11 | 🟡 Moyen | Historique non exposé | nouveau composant |
| 12 | 🟡 Moyen | Index `heures_saisies_historique` | migration |
| 13 | 🟢 Bas | Constante inutile | `use-mes-heures.ts` |
| 14 | 🟢 Bas | Label bouton soumettre | `MesHeuresGrid.tsx` |
| 15 | 🟢 Bas | Toast count réel | `_app.validation-heures.tsx` |
| 16 | 🟢 Bas | CHECK heures >= 0 | migration |

---

## Recommandation d'ordre d'attaque

1. **#2** (race condition validation chef, 5 min) → impact direct sur cycle de vie.
2. **#1 + #16** ensemble (migration unique constraint + CHECK + ON CONFLICT côté hook).
3. **#3** (pagination export) → critique pour la paie.
4. **#7 + #12** (index DB) → un seul migration.
5. **#9** (motif rejet mobile) → UX rapide.
6. **#11** (panneau historique) → plus gros chantier, à planifier séparément.
