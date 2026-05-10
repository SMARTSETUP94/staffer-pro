# ADR-003 — TipTap comme éditeur de templates contrats CDDU

- **Statut** : Accepted
- **Date** : 10 mai 2026
- **Version** : v0.42.0
- **Auteurs** : équipe Staffer Pro

## Contexte

Le module Contrats CDDU (v0.42) doit permettre à l'admin RH de modifier le
template du contrat (~15 sections, placeholders dynamiques `{{poste}}`,
`{{date_debut}}`, etc.), prévisualiser le rendu, et générer le PDF via
l'edge function `contrat-pdf`.

Critères :
- Éditeur WYSIWYG, mais sortie en JSON structuré (pas du HTML libre) pour
  pouvoir valider les placeholders et l'absence de markup non supporté.
- Léger (mobile-friendly), ESM, intégrable React/TanStack sans bridge.
- Headless (on contrôle 100% du rendu visuel via les composants Tailwind).
- Extensible : on a besoin de marques personnalisées pour les placeholders.

## Décision

**TipTap v2 (basé sur ProseMirror)** retenu pour éditer + sérialiser les
templates en JSON. Le rendu final (preview + PDF) part de la même
représentation JSON traversée par un visitor qui :
1. Substitue chaque `{{placeholder}}` par sa valeur.
2. Mappe les nodes TipTap → React/HTML/Puppeteer (selon le contexte).

Alternatives écartées :
- **Lexical** (Meta) : trop récent en 2026 pour notre équipe, écosystème
  d'extensions moins fourni que TipTap.
- **Slate.js** : API stable mais migration manuelle de toutes les extensions.
- **Quill** : sortie en Delta, format propriétaire moins lisible que JSON.
- **Textarea + Markdown** : insuffisant pour les tableaux + le styling des
  CGE (2 pages dédiées avec listes et titres).

## Conséquences

### Positives
- 1 source de vérité (JSON) → preview, PDF, validation E2E partagent la
  même représentation (cf. `TemplateTestDialog` qui détecte les
  `{{...}}` non interpolés sur 5 fixtures).
- Migration de placeholders triviale (refacto `{{poste}}` →
  `employes.poste_principal` en v0.42.2).
- Pas d'XSS possible : l'utilisateur n'écrit jamais de HTML.

### Négatives
- Bundle ~70 kB (acceptable car éditeur admin-only, chargé en lazy import).
- Pas de support natif pour les tableaux complexes → on a écrit notre propre
  extension `cge-list` pour les CGE.
- Couplage à ProseMirror : changer d'éditeur impliquera une migration de tous
  les templates stockés en JSON.

## Roadmap

- v0.42.0 — Setup TipTap + extensions placeholders + visitor JSON→React
- v0.42.1 — Template v2.1 (fixes layout H1, CGE 2 pages) + placeholder `{{poste}}`
- v0.42.2 — `TemplateTestDialog` 5 fixtures + détection `{{...}}` non interpolés
- Backlog — éditeur visuel des placeholders (drag depuis catalogue)

## Références

- v0.42.0 — `src/lib/contrats-templates.ts`, `src/lib/contrats-pdf.tsx`
- v0.42.1 — `postes_catalogue` + `/parametres/postes`
- v0.42.2 — `TemplateTestDialog` + 5 fixtures
