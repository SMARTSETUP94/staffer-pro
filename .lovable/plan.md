# Planning nominatif — inventaire et migration réduite

**Aucune migration appliquée, aucun écran modifié, aucune publication.** La première proposition est retirée : aucune table parallèle de personnes ou d’affectations.

## Inventaire : couverture des points 1 à 6

| Point | Déjà présent, à réutiliser | Manquant |
|---|---|---|
| **1. Personnel** | **employes** : identité, email, téléphone/mobile, poste_principal, type_contrat/statut_contrat/sous_type_contrat, actif, métier. **metiers/employe_metiers**, **postes_catalogue**. **/employes** : fiches, recherche, liste/tableur ; import de postes avec aperçu. Permis salariés dans categories_permis, CACES dans employes_autorisations_vehicules. Dispos possède qualifications déclarées et lien employe_id. | Rapprochement manuel et présentation des externes non rattachés dans la même vue ; chef terrain permanent. Aucun import Base_employés dans ce lot. |
| **2. Besoins d’étape** | **affaire_etapes_logistiques** : nb_personnes, type, dates, horaires, responsable, lieu, notes et statut proposé/validé/fait/annulé. **/logistique**, formulaire EtapeDialog et lecture mobile. | Chefs requis, quantités par poste, permis/CACES requis ; compteur nominatif. Le texte equipe est déprécié, pas une source de noms. |
| **3. Affectations** | **assignations** : employé, affaire, date, AM/PM/JOURNEE, heures, horaires, métier, type_operation, phase, notes, auteur. **Confirmation déjà présente** non_requise/en_attente/confirmee/refusee, dates/motif ; est_chef_jour. Formulaires/bulk et source unique assignation-upsert.ts. | Lien à l’étape, externe Dispos non rattaché, validation logistique et provenance ; aucune seconde table d’affectations. |
| **4. Planning équipes** | **/planning** : grilles et vues CDI/Intérim/chantier/objet/pôle. **/qui-est-ou** : personne×jours et vue chantier ; **/logistique** : étapes. **absences** validées et **Dispos** jour/soirée/pas dispo/notes. | Relier ces vues aux mêmes assignations, afficher Dispos/horaires/confirmation, filtres qualifiés et totaux. Qui est où ignore aujourd’hui horaires/refus et salariés inactifs en historique. |
| **5. Import** | **/imports/planning** : lecture Excel, normalisation de dates, aperçu/bilan et écriture dans assignations. Le dédoublonnage actuel utilise déjà employé/date/chantier, mais reste applicatif ; les noms sont surtout rapprochés par prénom et les lignes forcées à JOURNEE/8 h. | Un format simple **Affectations**, noms complets, revue manuelle et enregistrement atomique historique. Le parseur actuel ne traite pas ces dix colonnes. Pas de lecture des anciens blocs, ni Base_employés, ni import hebdomadaire. |
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
- Ajouter **dispos_intervenant_id** pour un externe non rattaché ; employe_id devient facultatif **uniquement pour le mode terrain, y compris son historique sans étape**. Validation : exactement une identité, employé OU externe Dispos. Les lignes ordinaires gardent leur employé obligatoire.
- Ajouter **validation_logistique** proposé/validé, source manuel/historique_consolide/suggestion ; **réutiliser statut_confirmation et ses dates** pour confirmé/refusé. Une marque explicite historique distingue un passage importé d'une affectation future.
- Conserver est_chef_jour historique ; ajouter le rôle chef/équipier au même enregistrement logistique. Le déclencheur actuel remet les autres chefs du chantier/jour à faux : il doit garder son comportement ordinaire, sans empêcher plusieurs chefs par étape.
- Ajouter l’indicateur de fin d’horaire au lendemain si nécessaire ; heure manquante = inconnue. Chevauchements signalés seulement.
- Historique : dédoublonnage sous verrou **date × chantier × personne**, indépendamment d'une opération vide ou renseignée ; réutiliser une assignation compatible existante. Si plusieurs AM/PM couvrent déjà ce passage, conserver ces lignes sans ajouter une JOURNEE. Futur : plusieurs étapes/créneaux distincts restent possibles ; compteur par personne distincte.
- **Compatibilité obligatoire** : lecteurs/formulaires/déclencheurs actuels supposent employe_id renseigné. Les adapter ensemble pour afficher les externes et préserver les salariés ; ne jamais créer automatiquement une fiche employé pour contourner cette difficulté.

### C. Besoins sur les étapes existantes
Ajouter sur **affaire_etapes_logistiques** : nombre de chefs requis, besoins qualifiés par poste, permis/CACES requis, autre facultatif. Réutiliser nb_personnes comme **seul total de référence**, responsable, lieu et horaires. Aucune seconde table de besoins ni taxonomie métiers.

### D. Import consolidé : aucune nouvelle table
- **Un fichier**, onglet **Affectations**, dix colonnes exactes : **Date (jj/mm/aaaa) | Jour | Code chantier | Chantier | Opération | Responsable | Personne | Nom tel qu'écrit | Fichier(s) source | Format**. Environ 2 130 lignes / 125 personnes / 95 codes, juin 2025–novembre 2026.
- Réutiliser l'écran d'import et sa structure aperçu → validation → enregistrement ; ajouter ce parseur simple, sans lire les feuilles Planning/Base_employés. Les semaines futures sont saisies dans Staffing.
- Date, code et Personne servent aux rattachements ; nom normalisé tolérant accents/casse/espaces/ordre. Candidats ambigus/inconnus présentés à la validation manuelle ; aucun employé, externe ou chantier créé par l'import. Vérifier la cohérence Date/Jour ; opération vide acceptée, sans invention.
- Enregistrer dans **assignations**, rattaché au chantier et au jour, **etape_logistique_id reste nul**. Pas d'étapes passées recréées, pas de table logistique_import_etapes ni planning_imports. Le lieu reste celui du chantier : le fichier ne fournit pas de lieu historique fiable.
- Conserver une provenance limitée dans la même assignation : empreinte du fichier consolidé, nom d'origine, fichier(s) source, format et responsable tel qu'indiqué ; ne pas déduire un chef terrain ou un rôle d'accès de ce texte. Aucun nouveau champ RH importé.
- Import sous verrou/transaction : clé date/chantier/identité, comparaison à l'existant et contrôle des répétitions. Réimport identique **ou fichier enrichi** ne recrée aucun passage et n'écrase pas les corrections humaines. Les inconnus peuvent être laissés en attente puis repris depuis le même fichier.
- Le fichier ne donne **ni horaires ni durée** : historique au jour, heures=0 comme valeur technique et marque « durée inconnue », jamais 8 h inventées. Les lecteurs et agrégats excluent ces lignes des volumes horaires/occupations et les montrent comme passages historiques, pas comme réservations futures ou heures travaillées.
- Confirmation personnelle non inventée, aucun envoi de notification. Aperçu/bilan : période, lignes nouvelles/déjà présentes, personnes/chantiers rapprochés et non rapprochés ; aucune donnée de rémunération.

### E. Droits, déclencheurs et intégrité
- Mode terrain : **admin/logistique écrivent, chef_chantier lit** ; autres rôles/anonyme refusés. Droits de menu dédiés, contrôles en base et lectures terrain à champs explicites, sans ouvrir tous les champs RH à la logistique.
- Préserver les droits actuels du planning ordinaire. Borner les policies qui permettent aux chefs d’écrire pour protéger les lignes logistiques **aussi depuis les anciens écrans/appels directs**. Conserver les accès personnels déjà existants sans nouvel écran Mes missions ni exposition collective.
- Adapter explicitement : contrôle chantier clôturé (exception historique autorisée seulement), confirmation, chef du jour, notifications et agrégats (heures inconnues, passages historiques, externes). Dates futures d'un fichier « historique » signalées dans l'aperçu et exclues de l'enregistrement : saisie dans Staffing. Ne pas modifier le comportement ordinaire.
- Déplacement/annulation d’étape : traitement cohérent des assignations liées, pas de personnes laissées sur l’ancienne date. Publication/restauration d’un plan atelier ne doit pas supprimer les engagements logistiques.
- Migration finale : fonctions explicites, validations et protections ; aucune réécriture dynamique.

## Écrans réutilisés
- **/logistique** : mode Planning équipes par étape, formulaire et lecture mobile existants.
- **/qui-est-ou** : mode terrain par personne, même source assignations, Dispos/qualifications ; menu Logistique vers ce mode, pas de deuxième grille indépendante.
- **/employes + gestion Dispos** : fiches et recherche existantes, rapprochement ; aucun troisième annuaire.
- **/imports/planning** : format « Historique consolidé — Affectations », fichier unique et revue manuelle ; modes atelier existants et leurs droits préservés, aucun import Excel hebdomadaire terrain.
- Onglets chantier masqués et droits fabrication préservés.

## Vérifié / non vérifié
**Vérifié :** schéma/protections relus en base, écrans/parseurs relus ; **63 tests existants passent**.

**Non vérifié :** nouveau lot non construit, fichier consolidé pas encore fourni, externes dans les anciennes vues, dédoublonnage concurrent, nouveaux droits et rendu. Après accord : recette 4/6→6/6 avec relecture, vue personne, import exemple aux dix colonnes rejoué sans doublons, opération vide, noms accentués/inversés, reprises des non-rapprochés, absence de volumes horaires inventés/notifications, refus d’écriture, 390/1366 px et nettoyage.

**Lots 2/3 non codés :** aucune suggestion, alerte automatique, lettre de mission, nouveau Mes missions ou coût jour/homme ; modèle compatible seulement.

## Accord attendu
Accord requis avant application et lot 1 ; **Gabin publie**.
