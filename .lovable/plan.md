# Demandes logistique : formulaire équipes + meilleure lecture des mails log@

Règles : modifications de base montrées avant application, ajouts seulement, aucune suppression, log@ en lecture seule, rien publié.

## 1. Formulaire « Demande logistique »

**Écrans**
- Page publique `/demande-logistique` (lien partageable, comme Dispos) : l'utilisateur choisit son nom dans la liste, sans compte. Même page accessible connecté (nom prérempli).
- Une demande = en-tête (demandeur, projet) + une ou plusieurs interventions (« + Ajouter une intervention »). Par intervention : catégorie (11 types d'étape), date, heure début, heure fin ou « à partir de », adresse, contact sur place (nom + téléphone), accès / contraintes, véhicule (flotte + « petit colis » / « aucun »), nombre de personnes, chef d'équipe, commentaire, pièces jointes PDF/images.
- Recherche projet : chantiers actifs + opportunités 9XXX (numéro + nom seulement).
- Écran de confirmation après envoi, sans renvoyer de données.

**Arrivée côté dispatcheur**
- La demande apparaît dans « Demandes logistique », onglet À traiter, badge « Formulaire » (aucune étape créée directement).
- « Ajouter au planning » entièrement prérempli : type, date, heures, lieu, véhicule, nb personnes, responsable = chef d'équipe, contact + accès dans le commentaire équipe, pièces jointes rattachées à l'étape. Validation en un clic, une étape par intervention.

**Copie mail à log@setup.paris**
- Objet « LOG – <projet> – <catégorie> – <date> », champs en clair, lien vers la demande, en-tête technique + identifiant de demande dans le corps.
- Le releveur reconnaît cet identifiant et rattache le mail à la demande existante, sans créer de doublon.

## 2. Lecture des mails libres log@

- **Gabarit détecté** (lignes « Catégorie : / Projet : / Date : / Heure : / Adresse : / … / Commentaire : ») : lecture déterministe, prioritaire sur l'IA ; tout ce qui suit (historique cité « De : / From: / Le … a écrit ») est ignoré.
- **Sinon IA** avec une échéance enrichie : heure_debut, heure_fin, lieu, contact_sur_place, nb_personnes, vehicule, responsable, commentaire, tous à null si absents. Consigne : seule la demande la plus récente (haut du mail) compte ; l'historique cité ne produit pas d'étape.
- La fenêtre « Ajouter au planning » est préremplie avec tous ces champs ; les pièces jointes du mail sont listées et peuvent être rattachées à l'étape (copie dans le stockage privé existant, log@ inchangé).
- Le mail 6053 est réanalysé avec la nouvelle lecture.

## 3. Étapes « propose » créées par le releveur

- Constaté : le releveur tente bien d'ajouter ces étapes, mais une erreur éventuelle est seulement notée dans son rapport, jamais affichée. **Cause pas encore confirmée** : première étape = lire les rapports et rejouer l'ajout sur le mail 6053 pour l'identifier (champ obligatoire manquant, garde-fou d'écriture, ou numéro de chantier non reconnu).
- **Recommandation : retirer cette création automatique** plutôt que la réparer. Elle fait doublon avec la fenêtre de validation, et c'est elle qui aurait produit des étapes inventées (« Livraison chariots 12/11 »). Les propositions restent visibles dans Demandes logistique, et rien n'arrive au planning sans validation humaine. Aucune donnée à supprimer (0 ligne existante).

## Sécurité du lien public

- Le lien sert uniquement à créer une demande. Tout passe par des fonctions dédiées en base (comme Dispos), les tables restent fermées.
- Lectures limitées à quatre listes minimales : noms des personnes (sans téléphone ni données RH), projets (numéro + nom, sans client ni montant), véhicules (nom + type), types d'étape.
- Anti-spam : limite par adresse et par heure (sur le modèle des Dispos), champ piège invisible, tailles bornées (10 interventions, 5 fichiers de 10 Mo, PDF/JPG/PNG seulement), contrôle de toutes les saisies côté serveur.
- Fichiers déposés dans un dossier privé réservé aux demandes ; le lien public peut déposer mais pas lire.
- Les demandes publiques arrivent marquées « Formulaire » et le nom choisi est affiché « déclaré », sans compte.

## Modifications de base (montrées avant application, ajouts seulement)

- Demandes formulaire stockées dans la table existante `emails_entrants` (source « formulaire », champs dans les métadonnées) : aucune nouvelle table.
- Nouvelles colonnes facultatives pour relier pièces jointes et étape, si nécessaire.
- Fonctions publiques : listes du formulaire + création de demande avec limite d'envoi.
- Règle de stockage pour le dossier privé des demandes.

## Tests

- Mail 6053 : une seule étape appro le 10/11 à partir de 17h, 45 rue Ampère 95300 Ennery, petit colis, 1 personne, responsable Guillaume, contact 01 34 33 09 83 / 06 07 55 82 61, commentaire « devis fourni pour le contact sur place », PDF joint proposé ; aucune étape « Livraison chariots 12/11 ».
- Gabarit prioritaire sur l'IA ; historique cité ignoré.
- Copie log@ reconnue, pas de deuxième demande.
- Lien public : création possible, aucune lecture au-delà des quatre listes, limite d'envoi respectée.
- Parcours navigateur : formulaire à 390 px, validation dispatcheur en un clic.

## Détails techniques

- Parseur gabarit pur partagé (`src/lib/logistique/gabarit-demande.ts`) utilisé à l'ingestion, à la réanalyse et pour la copie formulaire ; coupe au premier séparateur de citation (FR/EN).
- `EcheanceDetectee` enrichi dans `shared-inbox-classify.ts`, schéma IA mis à jour.
- Identifiant de demande `X-Setup-Demande-Id` + marqueur dans le corps ; le releveur fait le rapprochement avant insertion.
- Bloc d'ajout d'étapes (lignes 155-179 de `poll-shared-inboxes.ts`) retiré après diagnostic.
- Envoi de la copie par l'infrastructure mail de l'app, à confirmer pendant la réalisation.
