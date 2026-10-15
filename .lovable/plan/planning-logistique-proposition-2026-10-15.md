# Planning logistique — proposition

## Idée en une phrase
Un jalonnement arrive (mail à log@ ou dépôt manuel sur un chantier) → l'IA lit les dates et propose un planning complet → un humain corrige et valide → les étapes rejoignent le **planning logistique général**, affiché en grand sur l'écran de l'atelier.

```text
Mail log@ / fichier déposé ──> IA lit le jalonnement ──> Proposition (à valider)
                                                            │ validation case par case
                                                            v
              Fiche logistique du chantier <── Étapes validées ──> Planning général
                                                            │
                                    Écran atelier (TV)  <───┘  + véhicules réservés
```

## Audit de l'existant

| Module | État | Décision |
|---|---|---|
| Relevé log@ (toutes les 30 min, lecture seule) | Fonctionne, corps complet déjà envoyé à l'IA, 3 mails log reçus | Réutilisé tel quel, on ajoute la lecture des pièces jointes |
| Chantiers (dates montage/démontage, lieu, contact site) | En place | Fiche chantier enrichie d'un onglet « Logistique » |
| Véhicules (8 en base) + planning véhicules + demandes transport | Existe mais caché | Réutilisé : chaque chargement/livraison réserve un véhicule, conflit signalé |
| Trajets / feuille de route | Vides (0 ligne) | Branchés plus tard, pas bloquants |
| Lieux | 2 seulement | Liste complétée au fil des validations |
| Échéances | Vue séparée | Fusionnée dans le planning logistique (vue « Liste ») |
| Planning général par métier, planning atelier | Personnes / heures, pas logistique | Inchangés, pas de doublon |

Aucune table d'étapes logistiques n'existe aujourd'hui : c'est le cœur à créer.

## Droits et accès

| Profil | Voir le planning | Modifier les étapes | Valider les propositions IA | Paramètres (délais, véhicules) |
|---|---|---|---|---|
| Admin | Oui | Oui | Oui | Oui |
| Logistique | Oui | Oui | Oui | Oui |
| Chef d'équipe | Oui | Ses chantiers | Ses chantiers | Non |
| Chef de pose | Oui | Non | Non | Non |
| Chargé d'affaires | Oui | Non | Non | Non |
| Écran atelier | Lecture seule, sans menu | Non | Non | Non |

Écran atelier : un compte dédié « Écran atelier » (lecture seule) connecté en permanence sur la TV — pas de lien public, pour ne pas exposer clients et adresses.

## Livraison par lots (chacun testé avant le suivant)

1. **Socle** — étapes logistiques (appro, emballage, chargement, livraison, montage, finitions, permanence, démontage, déchargement), contacts, besoins, paramètres de délais, droits ci-dessus.
2. **Planning manuel + écran atelier** — page `/logistique` (semaine / mois, une couleur par type, horaires et véhicule dans chaque carte, glisser-déposer) et page `/ecran-atelier` (grand format, aujourd'hui + 7 jours, rafraîchie toutes les 2 min). Utilisable immédiatement, même sans IA.
3. **Fiche logistique du chantier** — onglet sur le chantier : étapes, véhicule choisi (liste des 8 véhicules + location/transporteur), contacts, besoins à commander.
4. **IA : lecture des jalonnements** — pièces jointes PDF/Excel/images de log@ + bouton « Déposer un jalonnement » sur un chantier ; règles de lecture du cahier des charges ; rattachement suggéré à un numéro d'affaire (jamais automatique).
5. **Proposition et validation** — rétroplanning calculé en jours ouvrés (chargement = livraison − 1 j, etc.), écran document à gauche / étapes à droite, une case par ligne et par champ, comparaison avec la version précédente.
6. **Relances** — alertes quand il manque le démontage, un véhicule, un contact ou une confirmation.
7. **Calendrier Outlook de log@** — après ajout du droit calendrier côté Microsoft (vous le faites, je fournis la marche à suivre).

Lots 1 à 3 d'abord : ils donnent un planning visible à l'atelier rapidement ; l'IA vient ensuite l'alimenter.

## Points à confirmer
- Délais par défaut (appro 3 j, emballage 2 j, chargement 1 j, montage 2 j, déchargement 1 j) : OK provisoirement ?
- L'écran atelier : une TV avec navigateur connecté au compte dédié, ça vous va ?

## Détails techniques
- Tables : `affaire_etapes_logistiques`, `contacts_logistiques`, `affaire_besoins_logistiques`, `jalonnements` (bucket privé), `propositions_logistiques`, `logistique_parametres` ; colonnes ajoutées à `affaires` (responsable production, J1, entrée stock, statut logistique, prochaine action).
- Caps `logistique.planning.view / etape.edit / proposition.view / proposition.validate / parametres.edit`, seed par rôle, lecture via `user_has_affaire_access()`. Rôle écran = profil dédié avec `logistique.planning.view` seul.
- Écritures via RPC atomiques `valider_proposition_logistique`, `rejeter_proposition_logistique`, `deplacer_etape_logistique` (journalisées).
- Rétroplanning en lib pure testée Vitest (`src/lib/logistique/retroplanning.ts`) réutilisant le helper jours ouvrés FR.
- Conflit véhicule : contrôle de chevauchement sur `vehicule_id` + dates, avertissement non bloquant.
- IA via Lovable AI (modèle pro pour les tableaux), sortie JSON stricte du cahier des charges.
- Menu : entrée « Planning logistique » ajoutée au mode simplifié actuel.
