# Planning logistique : une seule page pour planifier et staffer

La fusion des doublons est terminée (11 doublons fusionnés, réimport S46 : 0 étape créée), donc ce lot peut démarrer.

## Ce qui existe déjà (vérifié)
- Pages : `/logistique` (étapes), `/logistique/equipes` (Planning équipes), `/logistique/dispos`, `/logistique/ecran`, `/ecran-atelier`, `/logistique/vehicules-planning`.
- Les étapes portent déjà le nombre de chefs, les permis requis, les CACES requis (et « CACES autre »), le véhicule et le nombre de véhicules. **Le point C n'a donc besoin d'aucune nouvelle colonne** : il faut seulement les afficher et les rendre modifiables.
- Les affectations portent déjà un statut de confirmation et sa date.
- Il n'existe pas de profil « Écran atelier » parmi les rôles.

## Livraison en 4 étapes (chacune testée avant la suivante)

**Étape 1 : page unique + cartes (A, B-carte, C)**
- `/logistique` avec 3 onglets : Étapes · Équipes · Personnes. Mise en page commune : en-tête semaine de Dispos, filtres partagés (chantier, opération, personne, non pourvu, alerte), mémorisés par utilisateur.
- `/logistique/equipes` redirige vers l'onglet Équipes.
- Carte d'étape commune :
  - couleur selon l'opération ;
  - « 4130 · Montage · 7h–15h30 · lieu » et le véhicule ;
  - compteur 3/5 (rouge si incomplet, vert si complet) ;
  - initiales des personnes et badge chef ;
  - puces de besoins « 1 chef · 1 permis C · 1 R489 », en rouge tant que non couverts.
- Champs « permis requis » et « CACES requis » ajoutés dans la fenêtre de modification d'étape.

**Étape 2 : staffer vite (B)**
- Bouton « Compléter » qui ouvre un panneau latéral :
  - liste triée par dispo, filtres permis / CACES / chef ;
  - ajout en un clic, plusieurs personnes à la suite sans refermer le panneau.
- Sur ordinateur, glisser-déposer :
  - d'un nom du bandeau « Dispo non staffés » vers une carte ;
  - d'une personne d'une carte à une autre, le même jour.
- « Copier l'équipe sur… » : autres jours de la même étape, ou rotations suivantes du même chantier.
- « Reprendre l'équipe de la semaine dernière ».
- Les personnes déjà présentes ne sont jamais ajoutées deux fois.

**Étape 3 : alertes « À traiter » + communication (D, E)**
- Panneau en haut de page, calculé à l'affichage (aucune table) :
  - personne « Pas dispo » ou sans réponse ;
  - même personne sur deux étapes qui se chevauchent ;
  - étape sous-staffée à J-3 ;
  - besoin qualifié non couvert ;
  - horaire à confirmer ;
  - chargement ou livraison sans véhicule ;
  - montage sans démontage prévu ;
  - le jeudi, intervenants Dispos sans réponse pour la semaine suivante.
- Chaque ligne ouvre la carte concernée.
- « Copier le message WhatsApp » par jour, et « Copier ses missions de la semaine » par personne.
- Statut par personne sur la carte (en attente / confirmée / refusée), modifiable par la logistique et les admins.

**Étape 4 : mobile chef + écran atelier (F, G)**
- Chef d'équipe à 390 px, en lecture seule : « Ma journée / Ma semaine » avec ses étapes, son équipe (téléphone cliquable), l'adresse en lien vers une carte et les horaires.
- `/ecran-atelier` refait :
  - aujourd'hui + 6 jours, en grand format ;
  - équipe et véhicule sur chaque carte ;
  - rafraîchi toutes les 2 min ;
  - sans téléphones ni montants.
- Nouveau profil « Écran atelier » en lecture seule. C'est Gabin qui créera le compte.

## Droits
- Écriture : admin et logistique.
- Lecture : chef d'équipe (seulement ses étapes en vue mobile) et écran atelier.
- Les droits sont contrôlés dans la base, pas seulement à l'écran.

## Changement de base (montré avant application, à l'étape 4 seulement)
- Ajout de la valeur « ecran_atelier » à la liste des rôles. Aucune nouvelle table, aucune suppression.
- Il faudra aussi lui donner ses droits de lecture (planning logistique, écran atelier). Ce sont des données : je vous les montre avant de les écrire.
- Le lecteur de l'écran atelier renvoie seulement les champs autorisés, sans téléphone ni montant.
- Les étapes 1 à 3 ne demandent aucun changement de base.

## Tests
- Règles pures : alertes (sur des données d'exemple), couverture des besoins, texte WhatsApp, copie d'équipe sans doublon.
- Navigateur à 390 et 1366 px : onglets, filtres mémorisés, « Compléter », glisser-déposer, copie WhatsApp, redirection de l'ancienne page.
- Droits : admin et logistique écrivent ; chef et écran atelier n'ont aucun bouton d'écriture et la base refuse.
- Non-régression : aller-retour export/réimport = 0 différence, réimport S46 = 0 étape créée.
- Bilan vérifié / non vérifié à chaque étape. Rien publié.

## Hors lot
Import consolidé historique, suggestions automatiques, lettres de mission / Mes missions intervenants.

## Détails techniques
- Nouveaux composants partagés dans `src/components/logistique/` : `EtapeCarte`, `PanneauCompleter`, `FiltresPlanning`, `PanneauATraiter`.
- Logique pure dans `src/lib/logistique/` : `alertes-planning.ts`, `besoins-etape.ts`, `message-whatsapp.ts`, `copie-equipe.ts`, chacun avec ses tests.
- Glisser-déposer : HTML5 natif sur ordinateur seulement. Déplacer = nouvelle affectation puis retrait de l'ancienne, en passant par les fonctions d'affectation existantes.
- Données : la lecture `planning_terrain_semaine` est réutilisée. Si elle ne renvoie pas déjà les besoins qualifiés et les statuts de confirmation, sa redéfinition sera présentée avant application.
