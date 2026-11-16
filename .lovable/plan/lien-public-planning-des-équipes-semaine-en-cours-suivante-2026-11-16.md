# Lien public « Planning des équipes » (semaine en cours + suivante)

## Ce que verront les personnes qui ont le lien
- Une page publique, sans connexion, ouverte par un lien du type `staffing.setup.paris/planning-equipes?cle=…`.
- Deux onglets, identiques aux vues d'impression : **Jour par jour** et **Par employé** (colonne « Nom Prénom »).
- Bascule **Cette semaine / Semaine suivante**, rien d'autre (pas de navigation plus loin).
- Mise à jour en temps réel : rechargement automatique toutes les 60 s et au retour sur l'onglet, avec « Mis à jour à HH:MM ».
- Lisible sur téléphone (390 px) et ordinateur (1366 px), mêmes couleurs par type d'opération et même légende.

## Ce qui n'apparaît jamais
- Aucun coût, taux, montant, client facturé, contact, téléphone, adresse e-mail, commentaire interne ni note de frais.
- Seulement : jour, type d'opération, chantier (numéro + intitulé), lieu, horaires, chef, nom et prénom des intervenants, véhicule.
- Étapes annulées exclues.

## Gestion du lien (admin et logistique)
- Dans **Paramètres → Lien formulaire logistique**, un nouveau bloc « Lien planning des équipes » : copier le lien, **régénérer** (l'ancien cesse aussitôt de fonctionner), désactiver.
- Lien aussi copiable depuis « Plus » du planning logistique.

## Points à confirmer par Gabin
1. Un seul lien partagé pour tous (comme le formulaire logistique) — ou un lien personnel par intervenant comme les dispos ?
2. Afficher les **noms complets** des intervenants sur un lien public : d'accord ? (alternative : « Nom P. »)
3. Le lieu doit-il montrer l'adresse complète ou seulement le nom du lieu ?

## Détails techniques
- Migration additive : clé `planning_public_jeton` (hachée) dans le paramétrage existant, fonctions SECURITY DEFINER `planning_public_lire(_cle, _semaine)` (semaine 0 ou 1 seulement, liste explicite de champs sûrs, refus si clé invalide/désactivée) et `planning_public_regenerer()` (admin/logistique vérifiés). `REVOKE EXECUTE FROM PUBLIC, anon` puis `GRANT` ciblé (anon pour la lecture uniquement). Aucune table lisible directement.
- Écran : nouvelle route publique hors `_app`, réutilisant les composants/aides purs des vues d'impression (`blocsExport`, `semaineParPersonne`), `noindex`.
- Tests : refus clé invalide, semaine hors 0/1 refusée, absence de champs sensibles, régénération invalide l'ancienne clé ; écrans 390/1366 px.
- Migration montrée avant application ; rien publié.
