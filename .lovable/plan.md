## Contexte

Deux sujets liés :

**Bug critique de routing mobile**
Aujourd'hui `effIsMobile` (dans `src/lib/preview-context.tsx`) est uniquement vrai quand l'admin active le preview "chef_mobile" / "employe_mobile". Pour un vrai chef ou employé qui ouvre l'app sur smartphone, `effIsMobile = false` → il atterrit sur `/dashboard` ou `/ma-semaine` (version desktop) au lieu de `/mobile/chef` ou `/mobile/aujourdhui`.

**Audit qualité des pages mobiles existantes**
20 pages `mobile.*` (chef + employé) à passer en revue : ergonomie tactile, performance, gestes, navigation, états vides/erreurs, accessibilité, cohérence visuelle.

## Plan d'action

### 1. Fix routing mobile réel (priorité haute)

- Dans `preview-context.tsx`, étendre `effIsMobile` pour OR avec la détection viewport réel (`useIsMobile()` < 1024px) :
  - Si admin avec preview "chef_mobile/employe_mobile" → mobile
  - Sinon si viewport réel < 1024px → mobile
- Adapter `src/routes/index.tsx` : routing post-login déjà conditionné sur `effIsMobile`, donc ça suffira. Ajouter cas chef mobile : si `effIsMobile && effIsChef` → `/mobile/chef`, sinon `/mobile/aujourdhui`.
- Vérifier que `AppGuard` ne re-redirige pas vers `/dashboard` quand un employé navigue manuellement vers `/ma-semaine` sur mobile (rappel anti-fuite RGPD).

### 2. Audit mobile — méthode

Pour chaque page mobile (groupes ci-dessous), je passe en revue :

- **Ergonomie tactile** : taille des cibles tap (≥44px), espacement, scroll bloquant
- **Navigation** : bottom nav, retour, deep links, back-button
- **Performance** : lazy-load, requêtes en cascade, listes longues sans virtualisation
- **États** : loading, vide, erreur, hors ligne
- **Accessibilité** : contraste, labels ARIA, focus visible
- **Cohérence design** : tokens semantic, pas de couleurs hardcodées
- **Données** : RLS appliquée, pas de fuite cross-affaire / cross-employé

**Périmètre Employé (10 pages)** :
`mobile.aujourdhui`, `mobile.heures`, `mobile.mois`, `mobile.absences`, `mobile.contrats`, `mobile.propositions`, `mobile.swaps`, `mobile.profil` + bottom nav.

**Périmètre Chef (10 pages)** :
`mobile.chef.dashboard`, `mobile.chef.planning`, `mobile.chef.equipe`, `mobile.chef.atelier`, `mobile.chef.fabrication`, `mobile.chef.staffer`, `mobile.chef.a-valider`, `mobile.chef.contrats`, `mobile.chef.moi`, `mobile.chef.affaires.$affaireId`.

### 3. Livrables

- **Code** : patch `preview-context.tsx` + `index.tsx` (fix routing).
- **Rapport** : un document `/mnt/documents/audit-mobile-2026-05-12.md` listant, par page :
  - ✅ ce qui est OK
  - ⚠️ findings classés P0/P1/P2 avec localisation fichier:ligne
  - 💡 recommandations concrètes
- **Tickets de suivi** : synthèse des P0 à corriger en priorité, présentée en fin de réponse pour que tu valides ce qu'on enchaîne (correctifs en v0.46.x).

### 4. Hors scope

- Refonte UI/UX globale (juste audit + recommandations, pas d'implémentation des changements visuels)
- Tests E2E mobile (déjà tracés v0.34.x roadmap)
- Le fix routing sera vérifié via `browser--navigate_to_sandbox` en viewport mobile après build.

## Détails techniques

- Dépendance : `useIsMobile()` est SSR-safe (renvoie `false` puis re-render après mount). En SSR/prerender, on rendra brièvement le composant Loader puis le bon redirect côté client. Acceptable car `/` est un IndexRedirect, pas une page indexable SEO.
- Garder le comportement preview admin : `previewRole === "chef_mobile"` force mobile même sur grand écran (utile pour QA depuis desktop).
- Pas de changement DB ni RLS.

Confirme et j'enchaîne : (a) fix routing puis (b) audit complet avec rapport.