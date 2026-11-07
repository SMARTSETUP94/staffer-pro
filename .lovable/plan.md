# Planning nominatif — terrain, atelier et finition de l’import

## Inventaire vérifié
- Les affectations existantes portent déjà le mode terrain, le lien à une étape logistique et l’origine importée. Les affectations ordinaires sont déjà incluses dans l’historique vivant, mais leur Format est actuellement « Staffing », sans distinction atelier/terrain.
- Les compteurs lisent actuellement tout cet historique, y compris l’atelier : leur filtre terrain reste à ajouter.
- Les intervenants Dispos sans employé lié sont déjà disponibles dans les références et dans les affectations terrain. En revanche, la revue et l’enregistrement de l’import historique n’acceptent encore que les employés.
- Déplacer une étape conserve sa durée, mais ne déplace pas ses affectations. Les lignes importées ne sont pas liées à une étape.
- Aucun besoin de nouvelle table de personnes ou d’affectations.

## Modification de la base proposée — accord requis avant application
1. **Historique unique, toujours vivant** : adapter la vue existante pour identifier les passages terrain (imports, lien logistique ou mode terrain) et atelier. Conserver une seule ligne date × chantier × personne et les corrections automatiques.
2. **Format de l’export** : « Staffing terrain » ou « Staffing atelier » pour les affectations Staffing ; format d’origine conservé pour les imports. En cas de présence d’un import et d’une saisie Staffing le même jour/chantier/personne, garder la provenance importée sans compter deux passages. Deux indicateurs internes permettent de représenter un passage qui comporte à la fois terrain et atelier.
3. **Compteurs** : terrain uniquement par défaut pour personne × chantier, × lieu et × opération ; ajouter une option explicite pour inclure l’atelier. Ne pas inclure les lieux ou opérations propres à l’atelier dans les compteurs terrain d’un passage mixte.
4. **Déplacement d’étape** : déplacement transactionnel des dates des affectations liées non importées, du même décalage que le début de l’étape. Si une réduction de période laisse une affectation hors période, ne rien enregistrer et demander de corriger ses dates ou de revoir la période, puis réessayer. Les imports restent strictement intacts. La protection couvre tous les chemins de modification des dates, pas seulement le déplacement depuis le calendrier.
5. **Import externe** : autoriser une identité employé OU intervenant Dispos non lié, jamais les deux. Vérifier son existence ; rattachement manuel, aucune création d’employé. Ajouter l’unicité date × chantier × intervenant externe et conserver le verrouillage de l’import pour les réimports concurrents.
6. Conserver les droits : écriture et export admin/logistique ; lecture chefs d’équipe ; aucun accès anonyme ni élargissement aux autres rôles.

## Écrans et export après accord
- Revue des noms : employés et externes Dispos cherchables et clairement distingués ; validation manuelle des cas incertains.
- Onglet **Affectations** : exactement les dix colonnes actuelles, dans le même ordre.
- Onglets **Personnes** et **Chantiers** : ajouter « Passages terrain » et « Passages atelier », sans donnée de rémunération. Pour un passage mixte, les deux colonnes peuvent compter ce passage ; le total dédoublonné reste inchangé.
- En cas de réduction de période incompatible, afficher un message lisible et les affectations à revoir, sans déplacement partiel.

## Recette avant l’import réel
- Export : dix colonnes, les deux formats Staffing et un format importé conservé ; synthèses terrain/atelier.
- Compteurs : atelier exclu par défaut, inclus avec l’option ; passage mixte sans pollution des opérations/lieux terrain.
- Déplacer une étape de plusieurs jours : toutes ses affectations non importées suivent, vue personne cohérente et import inchangé.
- Réduire la période : affectation hors période signalée, aucune modification partielle.
- Importer un fichier exemple avec un externe Dispos sans employé, le relire dans l’historique puis le réimporter : zéro doublon et zéro employé créé.
- Contrôler refus d’écriture chef d’équipe/anonyme, lecture mobile 390 px et saisie 1366 px ; supprimer toutes les données de test.

**À ce stade : inventaire vérifié ; modifications et recette ci-dessus non réalisées, en attente d’accord sur la migration. Rien publié.**

## Détails techniques
- Remplacer explicitement la définition de `planning_terrain_historique`, de ses lecteurs/export/compteurs et de `planning_terrain_importer`, à partir de leurs définitions actuelles.
- Réutiliser `assignations.terrain`, `historique_terrain`, `etape_logistique_id`, `employe_id` et `dispos_intervenant_id` ; ajouter uniquement un index d’unicité pour les imports externes et la protection transactionnelle des changements de dates d’étapes.
- Préserver l’export en une seule requête autorisée, les chaînes Excel littérales et le chargement du module Excel uniquement au clic.
- Aucune modification de modèle pour les lots 2/3 au-delà des compteurs demandés ; aucun moteur de suggestions, aucune publication.