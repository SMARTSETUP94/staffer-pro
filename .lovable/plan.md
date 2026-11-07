# Planning nominatif — historique vivant et export

## Inventaire vérifié
- L’import consolidé et les affectations saisies dans Staffing utilisent déjà **la même table `assignations`**. Aucune table d’historique parallèle n’est nécessaire.
- Les champs existants couvrent date, chantier, personne employée ou externe, opération, étape, responsable via l’étape, validation logistique, confirmation/refus et provenance de l’import.
- La page **Planning équipes** propose les vues semaine par étape et par personne et l’import consolidé, mais aucun export de cet historique.
- L’import actuel évite les doublons date × chantier × employé, conserve la provenance et n’invente ni durée ni rémunération. Il ne rattache pas encore les lignes importées aux externes non liés à un employé.
- Les étapes peuvent être annulées par statut ; une affectation supprimée disparaît de la table. Le déplacement d’une étape ne déplace pas actuellement ses affectations : cette cohérence reste à terminer dans le lot 1.
- **État de la base au contrôle : 0 affectation, 0 ligne importée.** Les essais antérieurs ont été nettoyés ; aucun fichier réel n’a encore été enregistré.

## Résultat prévu
Un **historique vivant calculé à la lecture**, non recopié : les corrections sont visibles immédiatement, sans synchronisation ni tâche quotidienne. Le passage au jour suivant utilise l’heure de Paris.

### Règles d’inclusion
- **Import historique** : passages importés existants, avec leur provenance.
- **Staffing** : affectations validées dont la date est **strictement antérieure à aujourd’hui**, non refusées et encore présentes ; exclure les étapes annulées ou proposées. Une étape validée dont le jour est passé suffit pour le réalisé selon la règle de Gabin ; aucune confirmation personnelle n’est inventée.
- Les affectations ordinaires, hors terrain, restent incluses lorsqu’elles satisfont ces règles : ne pas limiter l’historique aux nouvelles saisies du Planning équipes.
- La validation repose sur `validation_logistique='valide'`, pas sur `statut_confirmation`. **Hypothèse à confirmer avec le plan :** les anciennes affectations ordinaires, dont ce champ vaut déjà « validé » par défaut, sont considérées validées ; il n’existe pas de preuve d’une transition historique de validation.
- Une suppression, un refus, une requalification en proposé ou une annulation retire le passage Staffing. Une correction de date, chantier, identité, opération ou responsable modifie son résultat.
- Une seule ligne par **date × chantier × identité** : fusionner AM/PM et plusieurs étapes du même jour. Réunir les opérations/responsables distincts dans un ordre stable plutôt qu’en perdre un arbitrairement.
- Un externe rattaché à un employé utilise la même identité canonique ; aucun rapprochement par le nom seul ni fusion automatique.
- Si import et Staffing attestent le même passage, ne compter qu’une fois ; Staffing fournit les informations actuelles, la provenance import reste disponible. Un passage importé est une preuve indépendante : annuler une saisie Staffing ne supprime pas silencieusement une ligne importée indépendante.

## Export Excel
Bouton **« Historique des affectations »** dans Planning équipes, réservé **admin et logistique**, y compris côté lecture des données d’export. Les chefs d’équipe gardent la lecture du planning, sans export.

Le fichier contient tout l’historique, pas seulement la semaine affichée :
1. **Affectations** — exactement `Date | Jour | Code chantier | Chantier | Opération | Responsable | Personne | Nom tel qu'écrit | Fichier(s) source | Format` ; dates `jj/mm/aaaa`, noms `NOM Prénom`, jours français. Les imports conservent leurs valeurs de provenance ; les saisies Staffing ont `Format = Staffing`, le nom courant dans « Nom tel qu’écrit », et aucune fausse référence de fichier. Aucune onzième colonne Source.
2. **Personnes** — nombre de passages dédoublonnés, première/dernière date, trois chantiers les plus fréquents avec leurs nombres ; égalités départagées par code puis identité.
3. **Chantiers** — code, nom, nombre de passages, première/dernière date et opérations distinctes.

Aucun taux, forfait, coût, salaire, téléphone, email ou jeton dans les données lues ni dans le classeur. Les dates et chiffres sont de véritables cellules Excel ; neutraliser les textes susceptibles d’être interprétés comme formules.

## Compteurs préparés pour le lot 2
À partir du même historique dédoublonné, sans table ni cache recopié :
- personne × chantier : nombre de passages, première et dernière date ;
- personne × lieu : nombre de passages et dernière date ;
- personne × opération : nombre de passages et dernière date ; un passage avec plusieurs opérations compte une fois dans chacune.

Les lieux absents restent inconnus. Le fichier ne fournit aucun lieu historique : un lieu issu de la fiche chantier est indiqué comme référence actuelle, pas comme une adresse historique certifiée. Aucun moteur de suggestions ni alerte du lot 2 n’est codé.

## Migration réduite à approuver — non appliquée
**Aucune nouvelle table, aucun duplicata, aucun remplissage automatique de lignes historiques.**

1. Créer une vue SQL **non matérialisée**, interne, `planning_terrain_historique`, calculée depuis `assignations`, les personnes et les chantiers/étapes existants. Elle porte les règles ci-dessus et expose uniquement les champs utiles.
2. Ajouter un lecteur paginé déterministe `planning_terrain_historique_lire`, avec contrôle explicite admin/logistique/chef d’équipe, et un lecteur d’export réservé admin/logistique. Les compteurs et l’export lisent cette même vue. Aucun accès direct anonyme ni export chef d’équipe.
3. Ajouter la requête de compteurs `planning_terrain_historique_compteurs`, protégée par les mêmes droits ; ne pas ouvrir les agrégats aux autres rôles ou aux appels MCP.
4. Aucun déclencheur de copie : les corrections, suppressions et annulations sont prises en compte par la requête elle-même. La cohérence déplacement étape → dates des affectations sera réglée dans le lot 1, sans changer le sens d’une date historique importée.

### Détails techniques
- Vue interne sans GRANT direct aux rôles applicatifs ; lecteurs `SECURITY DEFINER` à droits métier vérifiés, `search_path` fixé, champs explicitement sélectionnés, `EXECUTE` accordé uniquement à `authenticated` après retrait des droits publics.
- Tri stable date/chantier/identité et pagination par curseur ; toutes les pages de l’export correspondent à un même instant de lecture, afin de ne pas mélanger une correction entre deux pages.
- Réutiliser `xlsx-js-style`, chargé seulement au clic. Helpers purs partagés pour cellules et synthèses, tests près des tests d’import existants.
- Aucun changement aux RPC métier sensibles par remplacement automatique de leur texte ; toute modification ultérieure devra partir de leur définition actuelle relue.

## Vérifié / non vérifié
**Vérifié :** schéma actuel, droits et fonctions d’import relus dans la base ; inventaire des écrans et migrations ; aucune affectation restante ; export et historique vivant absents aujourd’hui.

**Après accord, à vérifier :** validé hier inclus, aujourd’hui/futur exclus ; proposé/refusé/annulé/supprimé exclus ; correction répercutée ; AM/PM et chevauchement import/Staffing comptés une fois ; externe rattaché sans doublon ; noms accentués ; trois onglets et dix colonnes exactes ; chiffres des synthèses ; absence de rémunération et de formules injectées ; refus anonyme/autres rôles/export chef ; lecture mobile 390 px et ordinateur 1366 px ; nettoyage des essais.

**Cet ajout et la migration attendent l’accord de Gabin. Rien appliqué pour cet ajout, rien publié.** Les éléments du lot 1 déjà signalés incomplets restent distincts et ne sont pas annoncés livrés.