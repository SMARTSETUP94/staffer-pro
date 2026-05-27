---
name: Audit requireCapability sur toutes les routes
description: Suite à la suppression de la whitelist EMPLOYE_DESKTOP_ALLOWED (L4c, 27 mai 2026), auditer que chaque route sensible déclare son requireCapability() dans beforeLoad
type: debt
---

## Contexte

L4c (27 mai 2026) a supprimé la whitelist `EMPLOYE_DESKTOP_ALLOWED` dans `src/routes/_app.tsx`. L'accès aux routes repose désormais ENTIÈREMENT sur la matrice de caps via `requireCapability()` (voir `src/lib/capability-guard.ts`) dans le `beforeLoad` de chaque route protégée.

## À faire (lot court séparé, ~1h)

1. Lister toutes les routes sous `src/routes/_app.*.tsx` qui exposent des données métier sensibles (devis, affaires, planning, opportunités, RH, admin, fabrication atelier, logistique, etc.).
2. Pour chacune, vérifier qu'elle déclare bien `beforeLoad: () => requireCapability("section.X")` (ou la cap appropriée).
3. Lister les manques dans une PR fix, ajouter les `requireCapability()` manquants avec la bonne cap.
4. Smoke test : se logger en `employe` desktop et tenter d'accéder en URL directe à `/devis`, `/affaires`, `/planning`, `/opportunites`, `/employes`, `/rh/contrats`, `/parametres/utilisateurs`, `/admin/permissions` → chaque tentative doit déclencher le redirect vers `/` + toast "Accès refusé".

## Risque si non fait

Un employé desktop qui devine une URL pourrait accéder à des données métier (devis, taux horaires, opportunités commerciales) auxquelles il n'aurait pas accès via la sidebar. La matrice de caps existe mais sans `requireCapability()` côté route, rien ne la fait respecter en URL directe.
