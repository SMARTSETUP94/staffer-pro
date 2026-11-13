# Export PDF client : structure identique à l'éditeur (9516-R1)

## Diagnostic
- Tri des racines dans `src/lib/devis/pdf-client.ts` l.276 : `racines.sort(ordre)`. En base pour 9516 : ENTRANCE=10, suivi=20, pose=30, dépose=40, CORRIDOR=41, ATRIUM=42, INLINE=43, CATERING=44. Les chapitres tombent après ENTRANCE, d'où « 5 – 2 – CORRIDOR ».
- L'éditeur (`DevisEditeur.tsx` l.414) trie aussi les racines par `ordre`. Il présente donc probablement le même ordre. À vérifier à l'écran avant de coder.
- Le PDF a sa propre fonction `enfants` (l.69). Elle n'utilise pas `src/lib/devis/arbre.ts`.
- Options : `lignesTableau` saute toutes les options, même incluses (l.134). `optionsDevis` (l.155) les liste toutes, dans l'ordre global de création. Le sous-total, lui, compte les options incluses, d'où l'écart sur INLINE.
- Libellés fixes dans `titreCourt` (l.86-89) : « Études et suivi de projet », « Pose et mise en place », « Reprise ».

## Correctifs
A. Nouvelle fonction pure `construireArbreClient(lignes)` dans `arbre.ts`. Elle donne l'ordre, la hiérarchie, la numérotation, les sous-totaux et la liste des options. Le PDF, la vue client et l'éditeur l'utilisent tous les trois. Le PDF ne trie plus rien lui-même.
B. Ordre racine : zones par `ordre`, puis chapitres suivi → pose → dépose (par `ordre` à type égal). Numérotation 1, 2, 3… sans trou. Proposition pour le double numéro : retirer à l'affichage le préfixe saisi `^\d+\s*[–-]\s*`, et garder la numérotation automatique. C'est l'option la plus propre : le numéro reste juste même si on déplace une zone. Le libellé en base ne change pas.
C. Options incluses : ligne normale de la zone, numérotée à la suite (ex. 4.2), avec leur montant. Elles sortent du bloc Options. Sous-total de zone = somme des lignes affichées (test d'égalité).
D. Options non incluses : tri par ordre des zones puis ordre dans la zone, numérotées O1… La zone est affichée sans préfixe.
E. Chapitres : on affiche le libellé saisi. Le libellé par défaut ne sert que si le champ est vide.
F. Commentaires internes : toujours exclus (inchangé).

Aucun changement en base ni sur les montants. Seul l'affichage change.

## Tests
- 9516-R1, reconstitué en données d'essai locales : ordre attendu, ligne des 6 stèles dans INLINE, sous-total = somme des lignes, O1 à O4 dans l'ordre Entrance → Corridor → Inline.
- Un devis sans zone et un devis avec une seule zone : pas de régression.
- Pour ces 3 devis, total HT du PDF = total `calcul.ts`.
- Captures avant/après de la page 1 et du bloc Options.
