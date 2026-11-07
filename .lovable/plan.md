# Planning nominatif — inventaire et migration réduite

**Aucune migration appliquée, aucun écran modifié, aucune publication.** La première proposition est retirée : aucune table parallèle de personnes ou d’affectations.

## Inventaire : couverture des points 1 à 6

| Point | Déjà présent, à réutiliser | Manquant |
|---|---|---|
| **1. Personnel** | **employes** : identité, email, téléphone/mobile, poste_principal, type_contrat/statut_contrat/sous_type_contrat, actif, métier. **metiers/employe_metiers**, **postes_catalogue**. **/employes** : fiches, recherche, liste/tableur ; import de postes avec aperçu. Permis salariés dans categories_permis, CACES dans employes_autorisations_vehicules. Dispos possède qualifications déclarées et lien employe_id. | Rapprochement manuel et présentation des externes non rattachés dans la même vue ; chef terrain permanent ; Base_employés en mise à jour seule. |
| **2. Besoins d’étape** | **affaire_etapes_logistiques** : nb_personnes, type, dates, horaires, responsable, lieu, notes et statut proposé/validé/fait/annulé. **/logistique**, formulaire EtapeDialog et lecture mobile. | Chefs requis, quantités par poste, permis/CACES requis ; compteur nominatif. Le texte equipe est déprécié, pas une source de noms. |
| **3. Affectations** | **assignations** : employé, affaire, date, AM/PM/JOURNEE, heures, horaires, métier, type_operation, phase, notes, auteur. **Confirmation déjà présente** non_requise/en_attente/confirmee/refusee, dates/motif ; est_chef_jour. Formulaires/bulk et source unique assignation-upsert.ts. | Lien à l’étape, externe Dispos non rattaché, validation logistique et provenance ; aucune seconde table d’affectations. |
| **4. Planning équipes** | **/planning** : grilles et vues CDI/Intérim/chantier/objet/pôle. **/qui-est-ou** : personne×jours et vue chantier ; **/logistique** : étapes. **absences** validées et **Dispos** jour/soirée/pas dispo/notes. | Relier ces vues aux mêmes assignations, afficher Dispos/horaires/confirmation, filtres qualifiés et totaux. Qui est où ignore aujourd’hui horaires/refus et salariés inactifs en historique. |
| **5. Import** | **/imports/planning**, planning-xlsx/plan/apply : lecture, dates/métiers normalisés, aperçu/bilan, assignations. **employes-excel.ts** : import postes par nom/prénom avec diff. | Format blocs Planning et Base_employés, multi-fichiers, noms complets/inversés, transaction et dédoublonnage par opération. Actuellement : prénom, JOURNEE/8 h, dédoublonnage employé/date/chantier sans opération ; cases personne×dates analysées mais non enregistrées. |
| **6. Historique futur** | assignations : personne/chantier/date ; affaires/étapes : lieu. **affaire_equipe_historique** : jours, premières/dernières dates, chef/refus. **affaire_equipe/fabrication_objet_equipe** : appartenance chantier/objet, pas créneaux. | Lien opération/étape. L’historique actuel est recalculé par chef, pas un journal immuable ni une preuve de présence ; il n’est pas exhaustif sans responsable. Pas de nouvel agrégat au lot 1. |

## État réel vérifié
**372 employés, 13 intervenants Dispos (0 rattaché), 255 étapes, 15 absences ; assignations et affaire_equipe : 0 ligne.** Le socle existe, mais ces tables ne contiennent pas encore d’historique nominatif.

9 métiers et 8 postes contractuels actifs. Correspondances Excel proposées vers **poste_principal/métiers existants**. Les statuts RH présentent des incohérences : validation ancien/nouveau, **aucun défaut CDI automatique**.

## Migration réduite proposée

### A. Fiches existantes uniquement
- **Aucune table de personnes, aucun nouveau champ salarié poste/statut/téléphone.** Réutiliser employes et le lien Dispos employe_id ; rendre ce lien unique lorsqu’il est renseigné, après contrôle.
- Ajouter seulement **est_chef_equipe_terrain** aux employés et aux externes Dispos non rattachés. C’est une qualification terrain, **pas un rôle d’accès**.
- Pour les externes sans fiche employé, ajouter les informations absentes poste/statut/email **sur leur fiche Dispos existante**. Une fois rattachés, ces informations viennent exclusivement de l’employé : pas de copie RH concurrente.
- Une lecture dérivée réunit employés et externes non rattachés ; après rattachement, une seule ligne. Rapprochement explicite conservant réponses/jeton et affectations, sans création d’employé.
- Permis autorisés salariés et déclarations Dispos restent distingués. Aucun document, numéro, jeton, taux ou forfait exposé.

### B. Compléter assignations, pas les doubler
- Ajouter **etape_logistique_id**, FK vers l’étape ; conserver date, demi-journée, heures, horaires, métier/opération et auteur existants.
- Ajouter **dispos_intervenant_id** pour un externe non rattaché ; employe_id devient facultatif **uniquement dans cette branche logistique**. Validation : exactement une identité, employé OU externe Dispos. Les lignes ordinaires gardent leur employé obligatoire.
- Ajouter **validation_logistique** proposé/validé, source manuel/Excel/suggestion, référence d’import ; **réutiliser statut_confirmation et ses dates** pour confirmé/refusé.
- Conserver est_chef_jour historique ; ajouter le rôle chef/équipier au même enregistrement logistique. Le déclencheur actuel remet les autres chefs du chantier/jour à faux : il doit garder son comportement ordinaire, sans empêcher plusieurs chefs par étape.
- Ajouter l’indicateur de fin d’horaire au lendemain si nécessaire ; heure manquante = inconnue. Chevauchements signalés seulement.
- Dédoublonnage sous verrou date/chantier/opération/identité, avec rattachement des lignes existantes compatibles sans nouvelle copie. AM+PM d’une intervention comptent comme une personne ; deux opérations/créneaux distincts restent possibles après revue.
- **Compatibilité obligatoire** : lecteurs/formulaires/déclencheurs actuels supposent employe_id renseigné. Les adapter ensemble pour afficher les externes et préserver les salariés ; ne jamais créer automatiquement une fiche employé pour contourner cette difficulté.

### C. Besoins sur les étapes existantes
Ajouter sur **affaire_etapes_logistiques** : nombre de chefs requis, besoins qualifiés par poste, permis/CACES requis, autre facultatif. Réutiliser nb_personnes comme **seul total de référence**, responsable, lieu et horaires. Aucune seconde table de besoins ni taxonomie métiers.

### D. Une seule table technique nouvelle : planning_imports
- Empreinte fichier, période, auteur, bilan, état de traitement/reprise pour environ 50 fichiers. Ni personnes ni affectations dupliquées.
- Étendre le parseur/aperçu existants pour les blocs Planning et Base_employés. Enregistrement atomique dans **étapes et assignations existantes**, réimport sans doublons ni écrasement des corrections humaines.
- **Base_employés : mises à jour/rattachements seulement**, ancien/nouveau pour poste/statut/téléphone/email ; noms inconnus à rapprocher ou ignorer, jamais créés. Pas de création de chantier non plus.
- Passé : étape fait en date de Paris, confirmation personnelle non inventée ; futur : planifié. Aucun historique transformé en heures réelles et aucune notification envoyée par cet import.
- Aucun taux/forfait dans les colonnes retenues, demandes d’enregistrement ou bilans.

### E. Droits, déclencheurs et intégrité
- Mode terrain : **admin/logistique écrivent, chef_chantier lit** ; autres rôles/anonyme refusés. Droits de menu dédiés, contrôles en base et lectures terrain à champs explicites, sans ouvrir tous les champs RH à la logistique.
- Préserver les droits actuels du planning ordinaire. Borner les policies qui permettent aux chefs d’écrire pour protéger les lignes logistiques **aussi depuis les anciens écrans/appels directs**. Conserver les accès personnels déjà existants sans nouvel écran Mes missions ni exposition collective.
- Adapter explicitement : contrôle chantier clôturé (exception historique autorisée seulement), initialisation/validation de confirmation, chef du jour, notifications et agrégats. Ne pas modifier le comportement ordinaire.
- Déplacement/annulation d’étape : traitement cohérent des assignations liées, pas de personnes laissées sur l’ancienne date. Publication/restauration d’un plan atelier ne doit pas supprimer les engagements logistiques.
- Migration finale : fonctions explicites, validations et protections ; aucune réécriture dynamique.

## Écrans réutilisés
- **/logistique** : mode Planning équipes par étape, formulaire et lecture mobile existants.
- **/qui-est-ou** : mode terrain par personne, même source assignations, Dispos/qualifications ; menu Logistique vers ce mode, pas de deuxième grille indépendante.
- **/employes + gestion Dispos** : fiches et recherche existantes, rapprochement ; aucun troisième annuaire.
- **/imports/planning** : format logistique/Base_employés et multi-fichiers ; modes atelier et droits actuels préservés.
- Pas de réouverture des onglets chantier volontairement masqués, pas d’extension générale des droits fabrication.

## Vérifié / non vérifié
**Vérifié :** colonnes, contraintes, policies et déclencheurs relus dans la base ; code des écrans/parseurs relu ; **63 tests existants passent** (Qui est où, imports planning/employés, source unique d’affectations).

**Non vérifié :** nouveau lot non construit, format réel des fichiers d’Alberto, externes dans les anciennes vues, dédoublonnage concurrent, nouveaux droits et rendu. Après accord : recette 4/6→6/6 avec relecture, cohérence vue personne, deux fichiers chevauchants, noms accentués/inversés, refus d’écriture, 390/1366 px, nettoyage des données de test.

**Lots 2/3 non codés :** aucune suggestion, alerte automatique, lettre de mission, nouveau Mes missions ou coût jour/homme ; modèle compatible seulement.

## Accord attendu
Validation de cette migration réduite, puis rédaction finale/application et implémentation du seul lot 1. **Aucune publication : Gabin publie.**
