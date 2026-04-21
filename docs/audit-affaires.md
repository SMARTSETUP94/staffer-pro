# Audit Lot 6 — Module Affaires

**Date** : 2026-04-21
**Périmètre** : `/affaires` (liste + détail), 4 onglets (Synthèse, Devis, Staffing, Journal), commentaires + mentions + attachments, vue de consommation `v_devis_consommation`.

## Composants & routes audités

| Fichier | Rôle | LOC |
|---|---|---|
| `src/routes/_app.affaires.index.tsx` | Liste, filtres, CRUD inline (statut), création/édition | 401 |
| `src/routes/_app.affaires.$affaireId.tsx` | Layout détail, breadcrumbs, clôture/réouverture | 223 |
| `src/routes/_app.affaires.$affaireId.index.tsx` | Synthèse heures (Staffé / Réalisé / Validé / Marge) | 323 |
| `src/routes/_app.affaires.$affaireId.devis.tsx` | CRUD devis + postes | 429 |
| `src/routes/_app.affaires.$affaireId.staffing.tsx` | Vue assignations groupées par employé | 177 |
| `src/routes/_app.affaires.$affaireId.journal.tsx` | Commentaires temps réel + mentions + PJ | 424 |

## Tableau récapitulatif des findings

| # | Sévérité | Module | Constat | Reco |
|---|---|---|---|---|
| 1 | 🟢 OK | RLS storage | Bucket `affaire-attachments` (privé) → 4 policies SELECT/INSERT/UPDATE/DELETE restreintes à `is_chef_or_admin()`. Cohérent avec `affaire_commentaires`. | RAS |
| 2 | 🟢 OK | Trigger | `check_affaire_open_for_assignation` bloque les modifs structurelles d'assignations sur affaire `termine`/`annule` mais autorise modifs cosmétiques (notes, heures). | RAS |
| 3 | 🟢 OK | Trigger | `notify_mention` envoie une notif `mention` à chaque user dans `mentions[]`, exclut l'auteur. Signature `create_notification` correcte. | RAS |
| 4 | 🟢 OK | Vue | `v_devis_consommation` expose 14 colonnes utilisées correctement par la synthèse (prevues/staff/réalisées/validées + pcts + marge). | RAS |
| 5 | 🟢 OK | RLS | `affaires_admin_chef_modify` (ALL) + `affaires_select_chef_admin` (SELECT) → l'employé ne voit pas `/affaires`. Cohérent avec ce qui est attendu. | RAS |
| 6 | 🟡 UX | Liste affaires | Tri par `date_debut DESC nullsFirst:false` → les affaires sans date de début passent en bas. OK mais pas de tri sur `numero` ou `created_at`. | Optionnel : ajouter un tri secondaire `created_at DESC` |
| 7 | 🟡 UX | Liste | Pas de pagination — 91 affaires aujourd'hui, ça passe. À 500+ → lag. | Pagination ou virtualisation à >200 affaires |
| 8 | 🟡 UX | Journal | `confirm()` natif pour suppression de commentaire → incohérent avec le reste de l'app qui utilise `AlertDialog`. | Remplacer par `AlertDialog` shadcn |
| 9 | 🟡 UX | Journal | Composer `Joindre`/`Publier` côte à côte mais l'icône `Paperclip` dans `<Button>` est en `size="sm"` sans `variant="outline"` → contraste faible. | Mineur, RAS si voulu |
| 10 | 🟡 Robustesse | Journal | `extractMentions` matche sur `prénom` (premier mot) ou local-part email → collisions possibles (2 "Jean" → seul le premier matché). | Améliorer en stockant les `id` mentionnés directement à `insertMention` |
| 11 | 🟡 Sécurité | Journal | RLS `affaire_commentaires_select_chef_admin` → un employé ne peut pas voir les commentaires "le concernant" même mentionné. La notif arrive mais le lien `/affaires/$id` est bloqué par `affaires_select_chef_admin`. | **Choix produit** : si on veut que les employés mentionnés voient le commentaire, il faut élargir RLS sur `affaire_commentaires` + `affaires` (nouveau scope "mes affaires via assignations") |
| 12 | 🟡 Cohérence | Devis | Suppression d'un devis détache les assignations (`devis_id = NULL`) → préserve historique mais "casse" `v_devis_consommation` car les assignations détachées ne remontent plus dans la conso. | OK si voulu, sinon ajouter un avertissement clair dans le dialog de suppression |
| 13 | 🟢 OK | Realtime | Channel `comments:${affaireId}` filtre `affaire_id=eq.{id}` → propre, pas de fuite cross-affaire. Cleanup via `removeChannel` dans return useEffect. | RAS |
| 14 | 🔴 Bug mineur | Layout | `_app.affaires.$affaireId.tsx` lance 2x la requête au mount : une fois dans `reload()` (non appelé) ET une fois dans `useEffect`. Mais `reload` est défini hors useEffect → confus. Pas de bug fonctionnel mais code à nettoyer. | Refacto : extraire la query en helper et appeler dans useEffect + après `handleStatut` |
| 15 | 🟡 A11y | Listes | Boutons trash icônes (PJ, comments) sans `aria-label` parfois → quelques-uns sont OK (`aria-label="Supprimer"`), d'autres non (Pencil dans table devis). | Ajouter `aria-label` sur tous les boutons icônes |

## Cohérence base ↔ UI

### CRUD affaires
- ✅ Create / Update via supabase direct, RLS `is_chef_or_admin()` enforce write.
- ✅ Changement de statut inline (dropdown) + clôture/réouverture via dialog.
- ✅ Réouverture réservée admin (`isAdmin`), clôture chef+admin.

### Devis & postes
- ✅ Suppression devis → détache assignations avant DELETE (évite FK violation).
- ✅ Postes liés à `metier_id` validé via `useMetiers()` (référentiel public).
- ✅ Form partial avec `Partial<Devis>` → fallback `signe`/`null` cohérent.

### Synthèse marge (`v_devis_consommation`)
- ✅ 3 niveaux distincts (Staffé / Réalisé = soumis+validés / Validé) avec pct + tone.
- ✅ Marge officielle = `prevues - validees` (et non staffé). Métrique business correcte.
- ✅ Empty state propre quand `enriched.length === 0`.

### Journal
- ✅ Realtime Postgres changes → refetch instant sur INSERT/UPDATE/DELETE.
- ✅ Upload Storage avec sanitization du filename (`replace(/[^\w.-]/g, "_")`).
- ✅ SignedURL 60s pour download → pas d'exposition publique.
- ✅ Suppression supprime les fichiers du bucket avant DELETE row.

## Recommandation finale

**Module production-ready.** Aucune faille critique. Les 3 points qui méritent un arbitrage produit :

1. **Finding #11** — décider si les employés mentionnés peuvent accéder au commentaire/affaire (élargir RLS).
2. **Finding #10** — fiabiliser le tracking des mentions (stocker IDs au moment de l'insertion plutôt que reparser à la soumission).
3. **Finding #14** — nettoyer le double-load dans `_app.affaires.$affaireId.tsx` (cosmétique).

Les autres points sont des améliorations UX/A11y mineures.
