# Planning équipes — dispos, lisibilité, export/réimport Excel

Aucune nouvelle table, aucun employé réactivé (Français Kévin, Ravi Dylan, Touré Amadou restent inactifs), rien publié. La seule modification de la base (ci-dessous) ne sera appliquée qu'après votre accord sur ce plan.

## 1. Dispos visibles dans le planning
- Vue « Par personne » : une pastille par case (J / S / J+S / Pas dispo / sans réponse), avec les couleurs de l'onglet Dispos.
- Une personne staffée un jour « Pas dispo » est signalée en rouge, une personne staffée sans réponse en orange.
- Un bandeau par jour « Dispo non staffés » liste le nom, le permis, le CACES et « chef d'équipe ». Toucher un nom ouvre l'affectation.
- « Ajouter une personne » trie la liste : dispo ce jour, puis sans réponse, puis pas dispo (grisés, en bas). Chaque nom porte ses badges permis/CACES/chef et la mention « déjà sur 4120 · Démontage » s'il est déjà affecté ce jour-là.
- Aperçu d'import : le même contrôle dispo s'affiche à côté de chaque nom rapproché.

## 2. Lisibilité
- Les libellés d'opération (Démontage, Rotation…) remplacent partout les codes bruts. L'heure de début est affichée, avec l'heure de fin quand elle est connue.
- Chaque case de la vue par personne affiche par exemple « 4120 · Démontage 7h ». Un badge marque le chef d'équipe.
- Le besoin face au staffé (3/5) est bien visible. Une étape sans personne s'affiche « 0/5 » en alerte.
- Mobile (390 px) : une carte par jour, comme dans l'onglet Dispos, au lieu du tableau large. L'ordinateur garde l'affichage actuel. L'en-tête de semaine devient un composant commun, partagé avec Dispos.

## 3. Export Excel au format de la logistique (feuille « Planning »)
- Une ligne de date en gras, en vraie date Excel (« dddd d mmmm yyyy »).
- L'en-tête de bloc « Code | Nom chantier | Responsable | Opération | Adresse | Commentaires » est en gras sur fond gris, suivi de la ligne de valeurs.
- Les noms sont répartis sur 6 colonnes au format « NOM Prénom », avec « (chef) » pour le chef d'équipe.
- Les commentaires sont complets : heure début–fin, note, véhicules, « 1 porteur », « horaire à confirmer ». L'heure n'écrase plus la note.
- Les étapes sans personne sont exportées avec « Besoin : 0/5 ».
- Une personne introuvable ne bloque plus l'export : elle est marquée « (à vérifier) ».
- Un onglet masqué « _staffing » garde les identifiants de l'étape, du chantier et de la personne, pour le réimport.
- Les chefs d'équipe peuvent aussi exporter. L'import reste réservé aux admins et à la logistique.
- Nom du fichier : « Planning S46 du 09-11 au 15-11-2026.xlsx ». Un seul clic sur « Exporter » suffit.

## 4. Réimport sans IA
- Si le fichier contient l'onglet « _staffing » ou la structure exacte de la feuille « Planning », la lecture se fait sans IA : rapide, sans crédits, toujours le même résultat. Le même aperçu de validation s'affiche ensuite.
- L'IA reste utilisée seulement pour les PDF et les anciens formats.

## Modification de la base (à valider)
La lecture du planning ne fournit pas encore l'heure de fin, la note, les véhicules, le besoin en chef ni les permis/CACES des intervenants. Je redéfinis donc explicitement la fonction de lecture de la semaine, à partir de sa définition actuelle et avec les mêmes droits (admin, logistique, chef d'équipe). Seuls des champs sont ajoutés :
- étapes : `heure_fin`, `horaire_libre`, `note`, `nb_vehicules`, `nb_chefs_equipe` ;
- intervenants (via les références) : `permis`, `caces`, `caces_autre`, `est_chef_equipe_terrain`, si ces champs n'y sont pas déjà. Je les vérifie à l'implémentation et n'ajoute que ce qui manque.

Aucune donnée n'est modifiée et aucune tâche planifiée n'est touchée. La migration complète vous sera montrée avant d'être appliquée.

## Détails techniques
- Helpers purs dans `src/lib/imports/` : `statutDispo(personne, jour)`, `alerteDispo`, `trierCandidats`, `libelleCase`, `lignesExportPlanning`, `lirePlanningExcel` (lecture déterministe), testés par Vitest.
- `planning-equipes-export.ts` : xlsx-js-style chargé à la demande (lazy), Blob préparé puis téléchargé dans le même clic, compatible mobile.
- `ImportPlanningHebdomadaire` : passe par le lecteur déterministe quand le format est reconnu, sinon par l'extraction actuelle. L'enregistrement réutilise la RPC d'import existante (idempotente).
- Composant d'en-tête de semaine commun, partagé par Dispos et Planning équipes.

## Vérifications prévues
- Vitest : statuts dispo, alertes rouge/orange, tri des candidats, aller-retour export → lecture = zéro différence.
- Playwright à 390 et 1366 px : cartes mobiles, pastilles et alertes, export en un clic, réimport du fichier exporté (0 ajout, 0 doublon).
- Le bilan final distinguera ce qui a été vérifié de ce qui ne l'a pas été.
