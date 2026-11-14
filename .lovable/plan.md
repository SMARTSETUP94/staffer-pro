# Onglet « Opportunités » — planning prévisionnel (lecture seule)

Principe : onglet à part, aucune écriture dans `affaires`, `devis`, `devis_*`, `opportunite_actions`. Aucun chiffre ne passe vers le pilotage, l'atelier ou la logistique, et aucun n'en vient. Aucune somme d'heures, aucune comparaison à la capacité.

## Constats vérifiés en base (14/11)
- Probabilités : `devis_parametres` (clé/valeur datée `date_effet`) : `proba_presque_gagne` 80, `proba_a_l_etude` 40, `proba_envoye` 30, `proba_a_faire` 10.
- `affaires` porte `date_montage`, `date_demontage`, `date_evenement_debut/fin`, `taille`, `archived_at`, `statut_opportunite`, `typologie`, `charge_affaires_id`.
- Tailles présentes : tres_petit, petit, moyen, gros (+ vides). La valeur `tres_gros` existe dans le type : durée par défaut à décider (proposition 8 sem.).
- `devis_materiaux` : materiau_id, designation, fournisseur, unite, quantite, prix_achat, supprime_le.
- Fonctions existantes réutilisables : `devis_calculer_interne`, `devis_heures_be`, `devis_charge_be`, `pipeline_indicateurs`. Droits existants : `section.pipeline_opportunites`, `opportunites.read.all` / `.read.mine`, `devis.couts`.

## L1 — Base (migration additive, montrée avant application)
**Paramètres, sans nouvelle table** : ajouter les clés dans `devis_parametres` (même mécanisme daté que `proba_*`, déjà modifiable par un admin) pour éviter une table en doublon :
`opp_plan_echantillons_jours` 5, `opp_plan_commande_jours` 3, `opp_plan_equipe_type` 4, `opp_plan_heures_semaine` 35, `opp_plan_duree_tres_petit/petit/moyen/gros/tres_gros` 1/2/4/6/8 sem., `opp_plan_fermeture_debut` 24/12, `opp_plan_fermeture_fin` 01/01, `opp_plan_seuil_complet_heures` (heures minimales pour juger un devis « assez complet », proposition : > 0 h de fabrication).
Les valeurs sont saisies via la page de paramètres devis existante (nouvelle section « Planning opportunités »).
Si Gabin préfère une table dédiée, l'alternative est `opportunites_planning_parametres` (une ligne, admin seul).

**Nouveau droit** : `opportunites.planning.view`, accordé par défaut à admin, commercial, bureau_etude, et aux responsables projet (rôle chef_chantier). Jamais aux rôles atelier, poseur, ecran_atelier.

**Fonction `opportunites_planning_lire(_debut date, _fin date, _charge_affaires_id uuid)`**, SECURITY DEFINER, `REVOKE EXECUTE FROM PUBLIC, anon`, `GRANT authenticated` :
- refuse sans `opportunites.planning.view` ; applique la règle de portée existante (`read.all` sinon `read.mine`) ;
- périmètre : typologie prototype, statut hors gagne/perdu/termine, `archived_at` nul, numéros 9440 et 9462 exclus ;
- devis de référence : le plus récent non supprimé (lu via `devis_peut_lire`) ; montant = `montant_ht` sinon `net_ht` de `devis_calculer_interne` ;
- heures de fabrication : réutilise le calcul d'heures de `devis_heures_be` / `devis_charge_be` (part fabrication, hors BE) ;
- retourne les dates brutes et les paramètres ; le calcul des périodes est fait par un module pur côté écran (testable, une seule règle) ;
- matériaux : désignation, quantité, unité, fournisseur, materiau_id ; `prix_achat` et montant à NULL sans `devis.couts` ;
- prochaine action : dernière `opportunite_actions` à venir.
Lecture seule : `STABLE`, aucune écriture.

## L2 — Onglet et calendrier
- Onglet « Planning » dans `/opportunites` (route dédiée `/opportunites/planning`), réservé au nouveau droit.
- Blocs en haut : « À dater » (sans montage ni événement) et « Date passée, à clore », pastilles vers l'opportunité.
- Groupes Presque gagné, À l'étude, Devis envoyé, À faire (replié), tri par date de montage. Filtre chargé d'affaires (sélecteur cherchable). Fenêtre 16 semaines / 6 mois, précédent / suivant, ligne « Aujourd'hui », fermeture grisée.
- Barres : échantillons orange plein, fabrication hachurée, période client pleine (couleur du groupe), trait de limite de signature rouge / orange / vert avec étiquette, caddie le jour de commande si le devis a de la matière.
- Mobile 390 px : liste par groupe avec dates en texte, défilement horizontal du calendrier.

## L3 — Fiche à droite
Numéro, intitulé, client, statut et probabilité, montant (droit coûts), alerte de signature, phases datées, date de commande, matériaux (achat avec droit coûts, colonne stock), prochaine action, boutons « Ouvrir l'opportunité » et « Ouvrir le devis ».

## L4 — Matériaux à commander
- Regroupement : même materiau_id et unité, sinon même désignation (normalisée) et unité. Une colonne par semaine (lundi de la date de commande), total, achat HT (droit coûts), stock.
- Numéros d'opportunités sous chaque matériau et chaque semaine. Cases par probabilité (À faire décochée), bascule « Toutes / Opportunité sélectionnée ». Quantités non pondérées. Lignes sans prix (lots, locations, prestataires) non consolidées, visibles seulement dans la fiche.

## L5 — Stock
Colonne « non suivi » et bandeau : l'application Stock ne compte que quelques mouvements, aucune liaison dans ce lot.

## Règles de calcul (module pur `src/lib/opportunites/planning-previsionnel.ts`)
- Jours ouvrés lundi-vendredi, fermeture de fin d'année exclue.
- Client : montage → démontage, sinon événement début → fin.
- Fabrication : se termine la veille ouvrée du montage ; durée = ceil(heures ÷ (équipe × 35)), minimum 1 semaine, sinon durée selon taille.
- Échantillons : 5 jours ouvrés juste avant la fabrication ; limite de signature = leur début.
- Commande : 3 jours ouvrés avant la fabrication.
- Pastille signature : dépassée rouge (« Signature hors délai (n j) »), ≤ 7 j orange, sinon vert (« À signer d'ici le JJ/MM »).

## Tests
- Jours ouvrés, fermeture 24/12 → 01/01, limite, commande, durée par heures et par taille, regroupement matériaux, masquage des prix.
- Recette sur les données du jour : 9516 ONFW27 (attendu maquette : échantillons 05/12 → 11/12, fabrication 12/12 → 15/01, client 16/01 → 24/01, commande 09/12), 9495 hors délai, total OSB 18 semaine du 07/12. Écarts éventuels expliqués (ex. jours ouvrés ou fermeture).
- Essai base : compte atelier refusé, compte sans `devis.couts` sans prix.
- Écrans vérifiés à 390 et 1366 px. Rien publié.

## Points à trancher par Gabin
1. Paramètres dans `devis_parametres` (proposé) ou table dédiée.
2. Durée pour la taille « très gros » (proposé 8 semaines) et pour une taille vide (proposé 4, comme « moyen »).
3. Critère « devis assez complet » (proposé : heures de fabrication > 0).
4. Commande : 3 jours ouvrés ou calendaires (la recette 09/12 vs fabrication 12/12 suggère calendaires ; à confirmer).
5. Rôles qui reçoivent le droit de lecture.
