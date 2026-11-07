# Import hebdomadaire Excel/PDF — Planning équipes

## Ce qui sera ajouté
- Un bouton **Importer un planning Excel/PDF** dans **Logistique → Planning équipes**, réservé aux administrateurs et à la logistique ; les chefs d’équipe restent en lecture seule.
- Lecture des anciens tableaux hebdomadaires : dates, code chantier, opération, lieu, responsable, commentaires/horaires et toutes les personnes, y compris plusieurs lignes de noms.
- Un aperçu modifiable avant enregistrement : rattachement aux employés ou intervenants Dispos existants et aux chantiers existants, noms ambigus ou inconnus à traiter manuellement. Aucune création automatique de personne ou chantier.
- Les interventions distinctes d’une même journée restent séparées, notamment permanence et démontage du CANAP92 le vendredi.
- Réutilisation des étapes logistiques et des affectations actuelles : après validation, le planning apparaît dans les vues par étape et par personne et rejoint ensuite l’historique vivant. L’import historique consolidé reste indépendant.
- Aucun taux, forfait ou coût importé ; aucune publication.

## Modification de la base soumise à l’accord de Gabin
Une modification est nécessaire pour garantir un enregistrement complet et un réimport sans doublon, même en cas de clics simultanés :
- Ajouter une fonction d’import transactionnelle, réservée admin/logistique, qui valide les champs et les identités, réutilise les étapes compatibles et ajoute seulement les affectations manquantes.
- Sérialiser les imports d’un même chantier, sans créer de nouvelle table de personnes, d’affectations ou d’historique.
- Conserver dans les champs de provenance existants le fichier d’origine et une identité d’intervention indépendante du nom du fichier ; ne pas écraser les étapes ou affectations déjà corrigées dans Staffing.
- En cas de plusieurs étapes compatibles, imposer le choix manuel plutôt que fusionner arbitrairement.

**L’accord sur ce plan autorise la préparation et l’application de cette modification limitée. Aucune modification de la base ni affectation réelle avant cet accord.**

## Premier planning : 9 au 15 novembre 2026
- PDF joint : 14 interventions et 71 affectations nominatives, dimanche vide ; les cinq codes chantier 4120, 4123, 4127, 4130 et 4132 existent.
- Préserver les horaires inconnus du jeudi et les mentions « 1 porteur », sans inventer d’heure de fin.
- Contrôler visuellement les noms : le PDF contient notamment **FRANCAIS Kévin** dans la rotation du mardi (deux personnes), peu visible dans l’extraction initiale.
- Signaler les personnes présentes sur plusieurs interventions le même jour ; sans horaires de fin connus, ne pas supposer l’absence de chevauchement.
- Préparer la revue de ce fichier dans l’écran d’import ; les noms non rapprochés restent en attente d’une décision humaine avant leur enregistrement.

## Vérifications
- PDF réel : 14 interventions, 71 affectations, conservation des deux opérations du vendredi et des noms sur plusieurs lignes.
- Excel de même structure ; erreurs de lecture visibles, fichiers illisibles refusés sans écriture.
- Rapprochement avec/sans accents, externes Dispos non liés à un employé, aucune création automatique.
- Enregistrement sur données de test puis réimport identique et fichier renommé : zéro doublon ; erreur en milieu d’import : aucune écriture partielle.
- Contrôle des droits et affichage à 390 et 1366 px ; suppression des données de test.
- Compte rendu distinguant ce qui est vérifié et ce qui reste à valider avant import du planning réel.

## Détails techniques
- Extraction PDF/Excel dans un module dédié, chargé au dépôt du fichier ; lecture PDF via l’analyse de documents disponible, adaptée pour conserver les personnes (le lecteur de jalonnements actuel les ignore volontairement).
- Schéma de sortie validé côté serveur, revue côté écran ; appels authentifiés conservant les droits du demandeur.
- Une fonction de base dédiée réutilise `affaire_etapes_logistiques` et `assignations`, avec contrôle des droits existants et verrouillage transactionnel. Aucun client administrateur pour écrire les données métier.
- Tests purs des règles d’import et recette transactionnelle en base conservés dans le projet.