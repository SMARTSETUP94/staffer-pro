# Planning nominatif — inventaire et migration réduite

**Aucune migration appliquée, aucun écran modifié, aucune publication.** La première proposition est retirée : aucune table `logistique_personnes` ou `logistique_affectations` ne sera créée.

## Inventaire vérifié : couverture des points 1 à 6

| Point demandé | Déjà présent et à réutiliser | Ce qui manque réellement |
|---|---|---|
| **1. Équipe terrain unique** | `employes` : prénom/nom, email, téléphone/mobile, poste_principal, type_contrat, statut_contrat, sous_type_contrat, actif, métier principal. `metiers` et `employe_metiers` : métiers et compétences secondaires. `postes_catalogue` : postes contractuels. `/employes` : liste/tableur et fiche ; import Excel de postes avec aperçu des différences. `dispos_intervenants.employe_id` relie déjà Dispos à un employé. Permis salariés dans categories_permis ; autorisations/CACES dans employes_autorisations_vehicules ; permis/CACES déclarés externes dans Dispos. | Présenter employés + externes non rattachés dans **la même vue dérivée**, sans table/liste parallèle ; rapprochement manuel ; filtre chef terrain permanent. Adapter Base_employés pour compléter seulement les fiches existantes. |
| **2. Besoin par étape** | `affaire_etapes_logistiques` possède nb_personnes, type d’opération, date_debut/date_fin, heure_debut/heure_fin, responsable, lieu, notes/commentaires. `/logistique`, onglet Logistique du chantier, EtapeDialog et vues jour/mobile existent. | Besoin de chefs, quantités par poste, permis/CACES requis ; lien nominatif permettant le compteur affectés/besoin. |
| **3. Affectations nominatives** | **`assignations` est la source à conserver** : employe_id, affaire_id, date, demi_journee AM/PM/JOURNEE, heures, heure_debut/fin, type_operation, phase, notes, auteur/dates. Confirmation existe déjà : non_requise/en_attente/confirmee/refusee, dates de confirmation/refus, motif. est_chef_jour existe. Helpers communs d’écriture, formulaires et affectations en masse existent. | Lien précis avec l’étape logistique ; traitement des externes Dispos non rattachés ; validation logistique distincte de la confirmation personnelle ; provenance/import. |
| **4. Planning équipes** | `/planning` : grilles personne × jours AM/PM, vues CDI/Intérim/par chantier/par objet/par pôle, sélecteur semaine et filtres. **`/qui-est-ou` : personnes × jours et vue inversée par chantier**, occupation et anomalies. `/logistique` : étapes dans la semaine. `absences` : indisponibilités salariés validées par date/créneau. Dispos : disponibilités déclarées jour/soirée/pas dispo et notes. | Relier ces vues existantes au même jeu d’affectations : pastilles sur les étapes logistiques, filtres poste/statut/permis/CACES/chef/dispo non affecté, superposition Dispos et totaux hebdomadaires terrain. Commandes d’écriture uniquement admin/logistique dans ce mode. |
| **5. Imports historiques et futurs** | `/imports/planning` et `src/lib/imports/planning-*` : lecture Excel au clic, dates/métiers normalisés, aperçu/bilan, affectations écrites dans assignations. `/employes` dispose d’un import de postes par nom/prénom avec diff. | Le parseur actuel ne lit **pas** les blocs de la feuille Planning d’Alberto, ni Base_employés. L’onglet personne×dates est analysé mais ses cases ne sont pas enregistrées comme affectations. Import actuel : un fichier, rapprochement surtout par prénom et dédoublonnage employé/date/chantier **sans opération**, non atomique. À étendre pour multi-fichiers, noms complets/ordre inversé, revue des ambiguïtés, opérations et historique clôturé. |
| **6. Modèle lots suivants** | assignations fournit déjà personne/chantier/date ; affaires et étapes fournissent le lieu. `affaire_equipe_historique` contient nb_jours_distincts, premier/dernier jour, chef, métier, contrat et refus. `affaire_equipe` : équipe par chantier/phase et role_terrain ; `fabrication_objet_equipe` : équipe d’un objet. | L’historique actuel est **un agrégat recalculé par chef**, pas un journal des passages par opération ; il ne couvre pas correctement une personne sans chef ni un externe non rattaché. Le lien étape/affectation suffira à produire plus tard passages/dernière date/lieu sans nouvel agrégat ni moteur de suggestions. |

### État réel de la base au contrôle
- **372 fiches employés**, **13 intervenants Dispos**, **aucun encore rattaché** à un employé.
- **255 étapes logistiques**, **15 absences**.
- `assignations` et `affaire_equipe` contiennent actuellement **0 ligne** : les tables et écrans existent, mais je ne peux pas affirmer qu’un historique nominatif est déjà rempli.
- 9 métiers en base, dont Impression UV ; 8 postes contractuels actifs. Les libellés Machiniste/Menuisier/Peintre/CN du fichier ne correspondent pas tous aux postes contractuels : ils seront proposés en correspondance avec **poste_principal + métier**, pas ajoutés dans un second catalogue.
- Les statuts RH ne correspondent pas parfaitement aux trois libellés Excel. Des incohérences existent entre type_contrat, statut_contrat et sous_type_contrat : **aucun remplacement automatique ni défaut CDI** lors de cet import.

## Migration réduite proposée

### A. Personnel : réutiliser les fiches
1. **Aucune table de personnes et aucun doublon poste/statut/coordonnées.** Réutiliser les champs employés existants et le lien Dispos existant.
2. Ajouter seulement une case métier **`employes.est_chef_equipe_terrain`** (et la même propriété sur Dispos pour un externe non rattaché). Ce n’est pas un rôle d’accès : ne jamais donner le rôle chef_chantier en cochant cette case.
3. Rendre unique le lien Dispos → employé lorsqu’il est renseigné. Un rapprochement manuel conserve les réponses Dispos, le jeton et les affectations existantes ; aucun rapprochement automatique par similitude.
4. Pour un externe non rattaché, les champs poste/statut/email absents de Dispos peuvent être ajoutés **sur sa fiche Dispos existante**, jamais dans une autre liste ; lorsqu’il est rattaché, ces informations viennent exclusivement de la fiche employé. Ils ne recopient aucun champ RH d’une personne déjà salariée.
5. Une lecture dérivée assemble employés et externes non rattachés, en n’exposant que les champs terrain. Autorisations salariés et déclarations Dispos restent distinguées ; aucun document/numéro de permis ni coût n’est retourné.

### B. Affectations : étendre `assignations`, ne pas les doubler
1. Ajouter **`etape_logistique_id`**, référence vers l’étape existante. Conserver date, demi-journée, heures, horaires, opération, notes et auteur existants.
2. Ajouter **`dispos_intervenant_id`** pour un externe qui n’a pas de fiche employé ; rendre employe_id facultatif **uniquement pour cette branche logistique**. Une validation en base impose exactement une identité : employé OU intervenant Dispos non rattaché. Les affectations ordinaires gardent obligatoirement leur employé.
3. Ajouter seulement **`validation_logistique`** (proposé/validé), la source (manuel/Excel/suggestion) et une référence d’import. Réutiliser statut_confirmation pour confirmé/refusé et ses horodatages : pas de deuxième confirmation.
4. Conserver est_chef_jour pour le planning historique. Pour les étapes, utiliser un rôle chef/équipier attaché à la même assignation : le déclencheur actuel impose **un seul chef par chantier/jour**, incompatible avec plusieurs chefs demandés ou plusieurs opérations ; il doit garder son comportement hors mode logistique.
5. Dédoublonner sous verrou date × chantier × opération × identité, avec réutilisation/rattachement d’une assignation existante compatible, sans recréer une ligne déjà couverte. Deux créneaux réellement distincts restent possibles après revue ; les AM/PM d’une même intervention comptent comme **une personne**, pas deux.
6. Les horaires traversant minuit auront un indicateur de fin au lendemain ; chevauchement seulement signalé. Une heure manquante reste inconnue, jamais présentée comme un horaire confirmé.

**Point de vigilance explicitement inclus :** rendre l’identité employé facultative exige d’adapter ensemble les lecteurs, formulaires, confirmations et déclencheurs qui supposent aujourd’hui un employé. Une fiche Dispos ne doit jamais être transformée automatiquement en employé. Les externes doivent également apparaître dans les vues existantes, sans perdre les salariés actuels.

### C. Besoins : compléter les étapes existantes
Ajouter directement sur `affaire_etapes_logistiques` : nombre de chefs requis, besoins par poste (liste qualifiée), permis requis, CACES requis et précision autre facultative. Réutiliser nb_personnes, responsable, lieu, début/fin et horaires. **Aucune table parallèle de besoins.**

### D. Import : une seule nouvelle table technique
- **`planning_imports` uniquement** : empreinte de fichier, période, auteur, bilan et état de traitement/reprise pour l’import d’environ 50 fichiers. Ce n’est ni une liste de personnes, ni une table d’affectations.
- Le parseur et l’aperçu existants sont étendus ; enregistrement atomique dans les **étapes et assignations existantes**. Réimport identique/chevauchant : pas de doublons, pas d’écrasement des corrections humaines.
- Base_employés propose seulement des mises à jour/rattachements à des fiches déjà présentes, avec ancien/nouveau : poste, statut, téléphone et email. Nom non reconnu → à rapprocher/ignoré, **jamais créé**. Un nom sert à la recherche, pas à une fusion.
- Les blocs Planning inconnus attendent un chantier et une personne existants. Pas de création de chantier par cet import.
- Passé : étape statut fait en date de Paris ; confirmation personnelle non inventée. Futur : planifié. Aucun import historique ne doit envoyer de notifications ou de propositions de mission.
- Les taux/forfaits sont exclus à la lecture, des demandes d’enregistrement et des bilans.

### E. Protections et compatibilité
- Mode Planning équipes : admin/logistique écrivent, chef_chantier lit ; autres rôles et anonymes refusés. Deux droits dédiés de menu/commandes.
- **Les droits actuels des chefs sur le planning ordinaire restent inchangés** ; les lignes logistiques sont protégées aussi contre une modification depuis les anciens écrans ou les appels directs. Les policies existantes qui permettent aujourd’hui aux chefs d’écrire doivent être bornées pour cette branche.
- Les salariés qui disposent déjà de leurs affectations ordinaires gardent cet accès ; aucune nouvelle exposition du planning collectif logistique ni nouvelle fonction Mes missions au lot 1.
- La logistique ne reçoit pas l’accès à tous les champs RH : lectures/propositions de mise à jour limitées explicitement aux champs terrain autorisés.
- Déclencheurs actuels à adapter explicitement : contrôle chantier clôturé (exception historique sous import autorisé seulement), initialisation confirmation (n’écrase pas l’état importé), unicité du chef et notifications (silencieuses pour historiques/propositions du lot 1). Préserver le fonctionnement ordinaire.
- La migration finale contiendra les définitions lisibles des fonctions adaptées, validations, autorisations et protections ; aucun remplacement dynamique des fonctions.

## Réutilisation des écrans
- **/logistique** reçoit le mode « Planning équipes » par étape, en réutilisant les étapes, formulaire et vues mobiles.
- **/qui-est-ou** reçoit le mode terrain par personne, même source assignations, plus Dispos/qualifications ; le menu Logistique ouvre ce mode. Pas de deuxième grille indépendante.
- **/employes** et la gestion Dispos existante restent les lieux des fiches ; partage de leur liste/recherche et ajout du rapprochement, sans troisième annuaire.
- **/imports/planning** reçoit le format « Planning logistique / Base_employés », multi-fichiers et revue manuelle ; les modes d’import atelier existants restent disponibles avec leurs droits actuels.
- Pas de réouverture des onglets chantier volontairement masqués et pas de modification générale des droits du planning fabrication.

## Vérifié / non vérifié
**Vérifié :** colonnes, contraintes, droits et déclencheurs relus dans la base ; écrans et parseurs relus dans le code ; **63 tests existants passent** (Qui est où, import planning, import employés, source unique d’affectations).

**Non vérifié :** comportement du nouveau lot (non construit), import réel des fichiers d’Alberto, externes dans les anciennes vues, dédoublonnage concurrent, nouveaux droits, 4/6→6/6 et affichage 390/1366 px. Après accord : recette sur fichiers chevauchants et noms accentués, contrôle des refus d’écriture, relecture après enregistrement, puis nettoyage des données de test.

**Lots 2/3 :** aucune suggestion, alerte automatique, lettre de mission, nouveau Mes missions ou coût jour/homme. Le modèle est seulement prêt à exploiter personne/étape/chantier/date/lieu et besoins qualifiés.

## Accord attendu
Valider cette migration réduite autorise sa rédaction finale, son application et l’implémentation du seul lot 1 selon ce périmètre. **Aucune publication : Gabin publie.**
