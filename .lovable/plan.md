# Planning nominatif — inventaire et migration réduite

**Rien appliqué ni publié.** Proposition précédente retirée : aucune table parallèle.

## Inventaire : couverture des points 1 à 6
1. **Personnel** : employes (identité, coordonnées, poste_principal, contrats/statuts, actif/métier), metiers/employe_metiers, postes_catalogue ; fiches/liste/tableur/recherche **/employes**. Permis salariés : categories_permis, CACES : employes_autorisations_vehicules. Dispos : déclarations et lien employe_id. **Manque** : rapprochement manuel, externes dans la même vue, chef terrain permanent ; aucun import Base_employés.
2. **Besoins** : affaire_etapes_logistiques possède nb_personnes, opération, dates/horaires, responsable/lieu, notes et statut. **/logistique**, EtapeDialog et lecture mobile existent. **Manque** : besoins qualifiés et compteur nominatif ; le texte equipe déprécié n’est pas une source de noms.
3. **Affectations** : **assignations** possède employé/chantier/date, AM/PM/JOURNEE, heures/horaires/métier/opération/phase/auteur, est_chef_jour et confirmations non_requise/en_attente/confirmee/refusee avec dates/motif. Formulaires/bulk et assignation-upsert.ts existent. **Manque** : lien étape, externe non rattaché, validation logistique/provenance ; aucune seconde table.
4. **Écrans** : **/planning** grilles et vues chantier/objet/pôle ; **/qui-est-ou** personne×jours et vue chantier ; **/logistique** étapes ; absences validées et Dispos jour/soirée/notes. **Manque** : les relier, filtres qualifiés et totaux. Qui est où ne lit pas horaires/refus et exclut les inactifs en historique.
5. **Import** : **/imports/planning** possède lecture/normalisation/aperçu/bilan et écrit dans assignations ; format actuel surtout par prénom, journées de 8 h et dédoublonnage applicatif employé/date/chantier. **Manque** : les dix colonnes du consolidé, noms complets, revue manuelle et transaction ; pas de blocs Excel ni d’import hebdomadaire.
6. **Historique** : assignations fournit personne/chantier/date, affaires/étapes le lieu ; affaire_equipe_historique agrège jours/dates/chef/refus, mais est recalculé par responsable, pas exhaustif ni preuve de présence. affaire_equipe/fabrication_objet_equipe sont des appartenances, pas des créneaux. **Manque** : distinguer les passages historiques et relier les opérations futures, sans nouvel agrégat.

## État réel vérifié
**372 employés, 13 intervenants Dispos (0 rattaché), 255 étapes, 15 absences ; assignations et affaire_equipe : 0 ligne.** Le socle existe, mais ces tables ne contiennent pas encore d’historique nominatif.

9 métiers et 8 postes contractuels actifs ; statuts RH incohérents par endroits : revue manuelle, aucun défaut CDI.

## Migration réduite proposée

### A. Fiches existantes uniquement
- **Aucune table de personnes, aucun nouveau champ salarié poste/statut/téléphone.** Réutiliser employes et le lien Dispos employe_id ; rendre ce lien unique lorsqu’il est renseigné, après contrôle.
- Ajouter seulement **est_chef_equipe_terrain** aux employés et aux externes Dispos non rattachés. C’est une qualification terrain, **pas un rôle d’accès**.
- Pour les externes sans fiche employé, ajouter les informations absentes poste/statut/email **sur leur fiche Dispos existante**. Une fois rattachés, ces informations viennent exclusivement de l’employé : pas de copie RH concurrente.
- Vue dérivée unique après rattachement ; conserver réponses/jeton et affectations.
- Permis autorisés salariés et déclarations Dispos restent distingués. Aucun document, numéro, jeton, taux ou forfait exposé.

### B. Compléter assignations, pas les doubler
- Ajouter **etape_logistique_id**, FK vers l’étape ; conserver date, demi-journée, heures, horaires, métier/opération et auteur existants.
- Ajouter **dispos_intervenant_id** pour un externe non rattaché ; employe_id devient facultatif **uniquement pour le mode terrain, y compris son historique sans étape**. Validation : exactement une identité, employé OU externe Dispos. Les lignes ordinaires gardent leur employé obligatoire.
- Ajouter **validation_logistique** proposé/validé, source manuel/historique_consolide/suggestion ; **réutiliser statut_confirmation et ses dates** pour confirmé/refusé. Une marque explicite historique distingue un passage importé d'une affectation future.
- Conserver est_chef_jour historique ; ajouter le rôle chef/équipier au même enregistrement logistique. Le déclencheur actuel remet les autres chefs du chantier/jour à faux : il doit garder son comportement ordinaire, sans empêcher plusieurs chefs par étape.
- Ajouter l’indicateur de fin d’horaire au lendemain si nécessaire ; heure manquante = inconnue. Chevauchements signalés seulement.
- Historique : dédoublonnage sous verrou **date × chantier × personne**, indépendamment d'une opération vide ou renseignée ; réutiliser une assignation compatible existante. Si plusieurs AM/PM couvrent déjà ce passage, conserver ces lignes sans ajouter une JOURNEE. Futur : plusieurs étapes/créneaux distincts restent possibles ; compteur par personne distincte.
- Adapter les lecteurs/formulaires/déclencheurs qui supposent un employé ; afficher les externes sans créer de fiche employé.

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

### E. Protections et écrans réutilisés
- Admin/logistique écrivent, chef_chantier lit ; autres rôles/anonyme refusés dans le mode terrain. Lectures à champs explicites, sans accès RH complet. Droits ordinaires et accès personnels actuels préservés ; protéger les lignes terrain aussi depuis les anciens écrans/appels directs.
- Adapter explicitement les déclencheurs : chantier clôturé (exception historique autorisée seulement), confirmation, chef du jour, notifications, agrégats/externes/heures inconnues. Dates futures dans le consolidé signalées et exclues : saisie dans Staffing.
- Déplacement/annulation d’étape cohérent avec ses assignations ; publication/restauration atelier ne supprime pas les lignes terrain. Fonctions/protections lisibles dans la migration finale.
- **/logistique** : mode Planning équipes, étape/formulaire/mobile existants. **/qui-est-ou** : mode terrain, mêmes assignations + Dispos ; pas de seconde grille. **/employes + Dispos** : fiches/rapprochement, pas de troisième annuaire. **/imports/planning** : format Affectations unique ; modes atelier et droits actuels préservés. Onglets chantier masqués inchangés.

## Vérifié / non vérifié
**Vérifié :** schéma/protections relus en base, écrans/parseurs relus ; **63 tests existants passent**.

**Non vérifié :** nouveau lot non construit, fichier consolidé pas encore fourni, externes dans les anciennes vues, dédoublonnage concurrent, nouveaux droits et rendu. Après accord : recette 4/6→6/6 avec relecture, vue personne, import exemple aux dix colonnes rejoué sans doublons, opération vide, noms accentués/inversés, reprises des non-rapprochés, absence de volumes horaires inventés/notifications, refus d’écriture, 390/1366 px et nettoyage.

**Lots 2/3 non codés :** aucune suggestion, alerte automatique, lettre de mission, nouveau Mes missions ou coût jour/homme ; modèle compatible seulement.

## Accord attendu
Accord requis avant application et lot 1 ; **Gabin publie**.
