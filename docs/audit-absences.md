# Audit Lot 9 — Module Absences

Périmètre : saisie employé/chef (`/_app/absences`), pré-remplissage depuis planning (`?employe=&date=`), validation chef (toggle `valide`), conflits avec planning (`PlanningGrid` + `findAbsence`), dashboard absences semaine, export Excel.

---

## 🔴 Critiques (à corriger en priorité)

### Finding #1 — Aucune détection de chevauchement à l'INSERT/UPDATE
**Fichier** : `src/routes/_app.absences.tsx` L177-188 + DB (pas de contrainte EXCLUDE)
**Symptôme** : on peut créer **N absences strictement chevauchantes** pour le même employé (par exemple : conges 10–15 + arret_maladie 12–14 + RTT 13). La fonction `findAbsence` retourne **la première trouvée** (`for...return`) → l'UI planning n'affiche qu'un seul motif, mais le chef ne sait pas qu'il y en a plusieurs en BDD.
**Impact** : double comptage côté paie, motif affiché incohérent, suppression de l'absence "visible" laisse l'employé absent malgré tout (les autres restent).
**Remédiation** :
1. Côté UI : à la sauvegarde, requêter les absences chevauchantes existantes pour cet employé et avertir / refuser.
2. Côté DB (recommandé) : contrainte d'exclusion sur range temporel + slot
   ```sql
   ALTER TABLE public.absences
     ADD CONSTRAINT excl_abs_overlap EXCLUDE USING gist (
       employe_id WITH =,
       daterange(date_debut, date_fin, '[]') WITH &&,
       (COALESCE(demi_journee::text, 'JOURNEE')) WITH =
     );
   ```
   (nécessite l'extension `btree_gist` — `CREATE EXTENSION IF NOT EXISTS btree_gist;`)

### Finding #2 — Aucun contrôle des assignations existantes lors de la création d'une absence
**Fichier** : `src/routes/_app.absences.tsx` `handleSave` L167-197
**Symptôme** : si un employé est déjà assigné sur la période, on crée l'absence sans alerter ni proposer de désaffecter. Le planning affichera un conflit (`absence_overlap`) **après coup**, mais aucune action automatique. Pire : si l'absence est mise `valide=true` directement, les `findAbsence` côté drag-drop refusent de **nouvelles** assignations mais **gardent** les anciennes intactes.
**Impact** : employé compté comme staffé alors qu'absent, double-paie potentielle, exports faussés.
**Remédiation** :
1. Avant `handleSave`, fetcher `assignations` chevauchant `(employe_id, date_debut..date_fin)` et afficher un récap "X assignations en conflit" avec bouton "Supprimer toutes".
2. Optionnel : trigger DB qui passe les assignations conflictuelles en `statut_confirmation='refusee'` avec motif auto = "Absence validée".

### Finding #3 — `valide=true` par défaut quand un chef crée
**Fichier** : `src/routes/_app.absences.tsx` L156, L184
**Symptôme** : `openNew` initialise `valide: true`. Pour un chef ça paraît OK, mais s'il oublie de décocher pour une "demande employé qu'il faut encore checker" (justificatif manquant…), le workflow de validation est court-circuité. Et l'UI ne distingue pas qui crée (chef vs admin vs employé via raccourci planning).
**Impact** : pas de trace "demande" → "validation", l'historique est aplati.
**Remédiation** : par défaut `valide=false` à la création. Le chef coche explicitement après vérif. Bouton "Créer + valider" séparé pour les cas évidents (raccourci planning).

---

## 🟠 Élevés

### Finding #4 — RLS : un employé peut s'auto-créer une absence mais pas la voir après
**Fichier** : RLS `absences_select_self_or_chef` + `_app.absences.tsx`
**Symptôme** : la policy SELECT est OK pour l'employé (`employe_id IN (employes.profile_id = auth.uid())`), **mais aucune route mobile/employé ne lui permet de voir/déclarer ses absences**. Seule `/_app/absences` existe, et elle est cachée dans la sidebar (réservée admin/chef via `AppSidebar.tsx` L36).
**Impact** : un employé ne peut PAS demander une absence, contredisant la RLS qui le permet (`absences_insert_self_or_chef`).
**Remédiation** : ajouter une page `/mobile/absences` (lecture + création de demande `valide=false`) accessible aux employés.

### Finding #5 — `/absences?employe=&date=` ne préremplit **pas la demi-journée**
**Fichier** : `_app.absences.tsx` L114-136
**Symptôme** : le raccourci depuis le planning passe `?employe=...&date=...` mais perd l'info `slot=AM|PM|JOURNEE`. Le dialog s'ouvre avec `demi_journee: null` ("toute la période") ce qui correspond à JOURNEE — alors que l'utilisateur cliquait peut-être sur une cellule AM uniquement.
**Impact** : friction UX, bloque accidentellement la PM si le chef oublie de re-sélectionner.
**Remédiation** : ajouter `?slot=` dans le validateSearch + AppPlanningGrid → propager au prefill.

### Finding #6 — `toggleValide` ne gère pas la transition `true→false`
**Fichier** : `_app.absences.tsx` `toggleValide` L211-221
**Symptôme** : passer une absence de validée à non-validée est autorisé silencieusement. Or si des assignations ont été refusées sur la base de cette absence, ou si la paie a déjà été lancée, c'est dangereux.
**Impact** : audit trail manquant, pas de motif "pourquoi annulée".
**Remédiation** : confirmer + demander un motif si on dévalide (et tracer qui/quand dans une table `absences_historique` ou via colonnes `devalide_par/le`).

### Finding #7 — Refresh complet (`load()`) après chaque action
**Fichier** : `_app.absences.tsx` L196, L208, L220
**Symptôme** : à chaque save/delete/toggle, on refait les 2 requêtes (absences + employes). L'optimistic update est absent. Sur 100+ absences, la latence est visible.
**Remédiation** : update local du state + revalidation différée (ou TanStack Query).

### Finding #8 — `absences` chargées sans bornes temporelles dans `/absences`
**Fichier** : `_app.absences.tsx` L93-96
**Symptôme** : `select("...").order("date_debut", { ascending: false })` — **toute l'historique** est chargée. Sur 2-3 ans d'historique × 30 employés × 5 absences/an = 450 lignes, supportable. Sur 10 ans, devient lourd.
**Remédiation** : pagination ou limite par défaut "12 derniers mois", avec bouton "voir tout".

---

## 🟡 Moyens

### Finding #9 — `demi_journee=null` ambigu : "toute la période" ou "non renseigné" ?
**Fichier** : `absence-helpers.ts` L33 — `if (a.demi_journee == null) return a;`
**Symptôme** : `null` est traité comme "toute la période = JOURNEE". Mais en BDD rien n'empêche `null` de signifier "donnée manquante" sur un import futur. La sémantique est portée uniquement par le code.
**Remédiation** : soit `NOT NULL DEFAULT 'JOURNEE'`, soit renommer l'option UI pour qu'il n'y ait que `AM | PM | JOURNEE` (le `null` côté BDD devient impossible).

### Finding #10 — `absences_dates_coherentes` OK mais pas de borne supérieure raisonnable
**Symptôme** : on peut créer une absence du 2024 au 2099. Aucun garde-fou contre une faute de frappe.
**Remédiation** : `CHECK (date_fin <= date_debut + interval '2 years')` ou validation côté UI uniquement.

### Finding #11 — Notification `absence_demandee` envoyée à **TOUS** les chefs/admins
**Fichier** : trigger `notify_absence_change` (DB)
**Symptôme** : sur 5 chefs, chaque demande génère 5 notifs. Pas de routing par périmètre (chef du chantier concerné, manager direct…).
**Impact** : bruit dans les notifs, baisse d'attention.
**Remédiation** : router au manager/chef rattaché à l'employé (champ à ajouter sur `employes` ou via `affaire.chef_chantier_id` si l'employé a une assignation cette semaine-là).

### Finding #12 — Filtre "À valider" cumule futur **et** passé
**Fichier** : `_app.absences.tsx` L142
**Symptôme** : `filter === "pending"` retourne tout `!valide`, y compris les absences passées. Une demande oubliée de l'an dernier reste en "À valider" indéfiniment.
**Remédiation** : auto-archivage (cron) ou flag visuel "ancienne demande non traitée" + section dédiée.

### Finding #13 — Pas de filtre par employé/type dans la liste
**Symptôme** : Sur 200+ absences, impossible de chercher "toutes les arrêts maladie de Dupont". Seuls 3 filtres temporels existent (`future`, `pending`, `all`).
**Remédiation** : ajouter input recherche employé + select type.

### Finding #14 — `Textarea` motif sans compteur visible
**Fichier** : `_app.absences.tsx` L425-430
**Symptôme** : `maxLength={500}` mais aucun compteur affiché. L'utilisateur ne sait pas qu'il approche de la limite.
**Remédiation** : afficher `{motif.length}/500` sous le textarea.

---

## 🟢 Bas / cosmétique

### Finding #15 — Cast `as any` dans dashboard
**Fichier** : `_app.dashboard.tsx` L253
**Symptôme** : `(absRes.data ?? []).map((a: any) => ...)`. Définir un type local `DashboardAbsenceRow`.

### Finding #16 — `PlanningGrid.tsx` refuse drop si `abs.valide`, mais affiche aussi les non validées comme bloquantes (L460-481)
**Symptôme** : la cellule est rendue "absente" même si `valide=false` (juste avec un badge "⚠ Non validée"). Pourtant `findAbsence` (L297) ne refuse le drop que si `valide=true`. Discordance UI : la cellule semble bloquée mais l'API laisserait passer si on contournait.
**Remédiation** : soit afficher la cellule comme normale tant que pas validée (et l'employé reste droppable), soit refuser le drop dans tous les cas et clarifier "demande en attente — valider d'abord".

### Finding #17 — Aucun export CSV/XLSX dédié des absences
**Symptôme** : la paie peut vouloir extraire "toutes les absences validées du mois" pour le bulletin. Pas d'endpoint dédié, il faut passer par l'export planning hebdo.
**Remédiation** : bouton "Exporter (XLSX)" sur `/absences` avec filtre période.

### Finding #18 — Pas de contrainte sur `motif` quand `type='autre'`
**Symptôme** : un type "autre" sans motif rend l'audit illisible. Pas de validation.
**Remédiation** : `CHECK (type <> 'autre' OR motif IS NOT NULL)` ou validation UI.

---

## Récap par priorité

| # | Sévérité | Sujet | Fichier / Migration |
|---|----------|-------|---------------------|
| 1 | 🔴 Critique | Pas de détection chevauchement | DB + `_app.absences.tsx` |
| 2 | 🔴 Critique | Pas de contrôle assignations en conflit | `_app.absences.tsx` |
| 3 | 🔴 Critique | `valide=true` par défaut | `_app.absences.tsx` |
| 4 | 🟠 Élevé | Pas de page /mobile/absences | nouveau composant |
| 5 | 🟠 Élevé | Slot perdu dans le prefill | `_app.absences.tsx` + `PlanningGrid` |
| 6 | 🟠 Élevé | toggleValide sans confirmation | `_app.absences.tsx` |
| 7 | 🟠 Élevé | load() complet à chaque action | `_app.absences.tsx` |
| 8 | 🟠 Élevé | Pas de borne temporelle au load | `_app.absences.tsx` |
| 9 | 🟡 Moyen | demi_journee null ambigu | DB + helpers |
| 10 | 🟡 Moyen | Pas de borne max date_fin | migration |
| 11 | 🟡 Moyen | Notif à tous les chefs | trigger DB |
| 12 | 🟡 Moyen | Filtre pending = passé inclus | `_app.absences.tsx` |
| 13 | 🟡 Moyen | Pas de filtre employé/type | `_app.absences.tsx` |
| 14 | 🟡 Moyen | Compteur motif manquant | `_app.absences.tsx` |
| 15 | 🟢 Bas | `as any` dashboard | `_app.dashboard.tsx` |
| 16 | 🟢 Bas | UI bloque même si valide=false | `PlanningGrid.tsx` |
| 17 | 🟢 Bas | Pas d'export XLSX absences | nouveau lib |
| 18 | 🟢 Bas | CHECK motif si type='autre' | migration |

---

## Recommandation d'ordre d'attaque

1. **#1 + #2** ensemble (la chevauche = source des incohérences les plus toxiques pour la paie). Migration `EXCLUDE` + UI alerte assignations conflictuelles.
2. **#3** (UX simple) → 5 min, change le default à `false`.
3. **#5** (perte slot) → cohérence avec planning, 10 min.
4. **#4** (page mobile absences) → habilite vraiment les employés.
5. **#11** (notif routing) → réduit le bruit.
6. Le reste en cleanup quand on touche au module.
