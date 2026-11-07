# Lot 1 — Planning nominatif logistique

## Accord demandé avant application
Cette proposition présente la migration et le lot 1. **Aucune modification de la base et aucune publication n’ont été effectuées.** L’accord sur ce plan autorise la finalisation et l’application de cette migration, puis la construction et la recette du lot 1. Gabin publie lui-même.

## Migration proposée
### 1. Une équipe terrain sans recopier les personnes
- Une fiche technique `logistique_personnes` référence l’employé Staffing, l’intervenant Dispos, ou les deux lorsqu’ils sont explicitement rattachés. Elle ne recopie ni nom, ni téléphone, ni permis/CACES.
- Le lien existant `dispos_intervenants.employe_id` devient unique : un employé ne peut pas être rattaché à plusieurs fiches Dispos. Aucun rapprochement par nom n’est appliqué automatiquement.
- Champs terrain : poste, statut, chef d’équipe, actif ; email externe uniquement si aucune fiche employé ne le porte. Les informations RH existantes ne sont pas modifiées.
- Un lecteur réservé aux trois rôles expose uniquement les coordonnées et qualifications utiles ; aucun taux, coût, forfait, document ou jeton Dispos.
- Reprise initiale des identifiants existants sans fusion ; les nouvelles fiches Dispos/employés rejoignent la même liste. Les rapprochements validés réaffectent les liens et l’historique sous verrou.

### 2. Besoins qualifiés par étape
- `logistique_etape_besoins` complète les étapes existantes : nombre de chefs, quantités par poste, permis/CACES requis, éventuel CACES autre.
- `nb_personnes`, heures de début/fin, responsable, lieu et commentaire restent dans l’étape existante : pas de seconde copie.
- Contrôles des quantités, postes et qualifications en base. Les horaires traversant minuit sont pris en charge.

### 3. Affectations nominatives et historique
- `logistique_affectations` : étape, personne, **date d’intervention** (une étape peut durer plusieurs jours), rôle chef/équipier, statut proposé/validé/confirmé/refusé, source manuelle/Excel/suggestion, horaires et heures prévues facultatifs, auteur et dates.
- Unicité étape × personne × jour. Une personne peut intervenir sur plusieurs étapes le même jour.
- Suppression logique et journal `logistique_affectations_historique` alimenté automatiquement ; conservation des passages, dates et chantier/lieu pour le futur lot 2.
- Les états confirmé et source suggestion sont prévus dans le modèle, sans parcours de confirmation ni moteur de suggestion au lot 1.

### 4. Import en masse et dédoublonnage
- `logistique_imports` conserve empreinte du fichier, période, auteur et bilan ; `logistique_import_etapes` retrouve une même étape entre fichiers qui se recouvrent.
- Enregistrement atomique et contrôle transversal **date × chantier × opération × personne**, y compris lors de deux imports simultanés. Un fichier réimporté ne recrée rien et n’écrase pas une correction manuelle.
- Noms/chantiers non reconnus restent dans l’aperçu jusqu’au rattachement manuel ; aucun chantier fictif ni fusion automatique.
- Les étapes importées passées deviennent « réalisées / fait » en date de Paris ; les futures restent planifiées.
- Seuls nom, téléphone, email, poste et statut sont retenus depuis Base_employés. Aucun taux ni forfait n’est lu, conservé dans le bilan ou envoyé à l’enregistrement.

### 5. Droits
- **Admin et logistique : lecture et écriture.**
- **Chef d’équipe (`chef_chantier`, rôle déjà utilisé par Dispos) : lecture seulement.**
- Aucun accès pour les autres rôles ni pour les visiteurs anonymes. Pas de nouveau rôle.
- Deux droits de menu : `planning_equipes.view` et `planning_equipes.edit` ; les contrôles en base imposent également les rôles autorisés.
- Les lecteurs sélectionnent des champs explicites ; pas d’élargissement des droits RH et pas de nouvel outil Claude/MCP.
- Toutes les nouvelles tables ont leurs autorisations et protections dans la même migration. Les fonctions et déclencheurs de validation/audit/import seront inclus dans le texte final avant son application.

## Écrans du lot 1
1. **Logistique → Planning équipes**, onglets « Par étape », « Par personne » et « Équipe terrain ».
2. Par étape : semaine navigable, blocs jour/chantier/opération, lieu/heure/responsable, personnes affectées, compteur orange incomplet et vert complet, recherche nominative avec dispos Journée/Soirée/Pas dispo/Sans réponse.
3. Par personne : personnes × jours, dispo claire et affectation pleine avec code chantier, total de **jours distincts affectés**, filtres poste/statut/permis/CACES/chef/dispo non affecté.
4. Équipe terrain : édition des informations logistiques et rapprochements explicites, sans toucher aux taux RH.
5. Import : plusieurs .xlsx, lecture des feuilles Planning et Base_employés, aperçu, corrections/rattachements puis confirmation ; progression et bilan cumulé pour environ 50 fichiers.
6. Lecture adaptée à 390 px ; saisie principalement à 1366 px. Les chefs d’équipe ne voient aucune commande d’écriture.

## Hypothèses retenues
- « Affectés / besoin » compte les personnes non refusées et non supprimées pour le jour affiché ; les pastilles distinguent proposé/validé/confirmé.
- Un chevauchement horaire produit une indication simple, jamais un blocage ; aucune alerte automatique du lot 2.
- Plusieurs blocs d’une même opération à des horaires différents restent distincts ; les doublons ou ambiguïtés d’import sont proposés à la revue humaine.
- Une similitude normalisée de nom suggère un rattachement, sans le valider ; accents, casse, espaces et ordre NOM Prénom sont tolérés.
- La feuille réelle d’Alberto n’a pas été fournie en .xlsx : un exemple conforme sera créé pour la recette ; la compatibilité avec ses 50 fichiers restera à confirmer après dépôt.

## Recette après application
- Étape test : affecter 4 puis 6 personnes pour un besoin de 6 ; relire après rechargement et retrouver les mêmes affectations dans la vue personne.
- Deux fichiers .xlsx chevauchants : une seule affectation par date/chantier/opération/personne, noms avec et sans accent ; aperçu des inconnus et revue manuelle.
- Vérifier absence de taux/coûts dans les données importées et les réponses des lecteurs.
- Tester admin/logistique en écriture, chef d’équipe en lecture et refus d’écriture directe ; autres rôles/anonyme refusés.
- Contrôler 390 et 1366 px et nettoyer toutes les données de recette.
- Compte rendu final **vérifié / non vérifié** ; aucune publication.

## État vérifié maintenant
- Les étapes existantes possèdent déjà nb_personnes, début/fin, horaires, responsable et lieu.
- Dispos possède déjà le lien employé, les qualifications et les droits lecture chef / écriture admin-logistique.
- Aucun lien employé multiple dans Dispos au contrôle actuel : l’index unique proposé ne rencontre pas de conflit connu.
- Le schéma actuel et les protections ont été lus ; la proposition SQL additive est enregistrée séparément, non appliquée.

## Non vérifié à ce stade
- Écrans, enregistrement nominatif, import, dédoublonnage réel, contrôles des nouveaux droits et rendu mobile : ils seront construits et testés après ton accord.
- Lots 2/3 non codés : pas de suggestions, lettres de mission, Mes missions ou coût jour/homme.
