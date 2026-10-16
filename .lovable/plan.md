# Synchronisation du planning logistique vers un agenda Outlook partagé

## Objectif
Chaque étape logistique validée apparaît automatiquement dans un agenda Outlook commun « Planning logistique Setup », hébergé sur log@setup.paris. Toute l'équipe peut s'y abonner sur téléphone et sur ordinateur. Le sens est unique : l'application fait foi, et toute modification faite dans Outlook sera écrasée.

## Ce qui sera fait
1. **Création de l'agenda** « Planning logistique Setup » dans la boîte log@setup.paris, une seule fois et automatiquement.
2. **Un événement par étape validée** :
   - Titre : `[Montage] 4130 The Voice — 4p`
   - Lieu : le lieu de l'étape
   - Horaire : les heures si elles sont renseignées, sinon un événement « journée entière » sur plusieurs jours si besoin
   - Description : client, responsable, véhicule, accès, note, commentaire d'équipe et lien vers l'étape dans l'application
   - Aucun nom de personnel, seulement le nombre de personnes
3. **Mise à jour automatique** : quand une étape est créée, modifiée, déplacée ou supprimée, l'événement Outlook est mis à jour ou supprimé.
4. **Bouton admin « Resynchroniser Outlook »** sur le Planning logistique : il renvoie toutes les étapes à venir, ce qui sert au rattrapage et au premier envoi.
5. **Partage** : je vous indiquerai comment partager l'agenda depuis Outlook avec l'équipe, en lecture seule.

## Détails techniques
- La synchronisation passe par l'application Microsoft déjà configurée pour log@ et devis@. Il faut ajouter la permission **Calendars.ReadWrite** (application) et un consentement admin Microsoft : c'est la seule action de votre côté.
- Une nouvelle colonne `outlook_event_id` sur `affaire_etapes_logistiques`.
- Une fonction serveur `syncEtapeOutlook(etapeId)` est appelée après chaque enregistrement ou suppression. Elle fait un POST/PATCH/DELETE sur `/users/log@setup.paris/calendars/{id}/events`, dans le fuseau Europe/Paris.
- Les erreurs sont journalisées sans bloquer l'enregistrement dans l'application.
