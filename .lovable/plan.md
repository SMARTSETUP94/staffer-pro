# Terminer la lecture des personnes atelier

Les six fonctions de la migration B contiennent les filtres atelier et leurs droits sont conservés. Les noms, l’ajout/retrait, les badges et la vue Personnes sont construits. Les essais à 390 et 1366 px ont été retirés ; aucune notification ni heure saisie créée, aucune présence atelier dans le lecteur logistique.

## Complément indispensable
Le lecteur actuel du planning logistique ne donne pas accès aux chefs d’atelier. Ajouter un lecteur réservé au planning atelier, sans élargir les droits d’écriture ni exposer téléphones, contrats ou rémunérations.

Après accord, appliquer le SQL ci-dessous, remplacer le lecteur actuel et vérifier l’accès des rôles atelier.

## SQL proposé
Le texte complet est dans `.lovable/atelier-personnes-lecture-proposee.sql`, reproduit ci-dessous avant toute application.