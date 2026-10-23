---
name: sources-boites-email
description: Intégration log@setup.paris et devis@setup.paris via redirection vers smart@ — détection de la boîte d'origine par destinataire, catégorie IA logistique
type: feature
---

# Sources email multi-boîtes (oct 2026)

- Boîtes partagées `log@setup.paris` (logistique) et `devis@setup.paris` (demandes clients) **sans mot de passe propre** : le connecteur Outlook ne peut pas les lire directement (scope Mail.Read.Shared indisponible, 403 ErrorAccessDenied via `/users/{boîte}/...`).
- Solution retenue : **règles de redirection Exchange** (admin M365) qui redirigent log@ et devis@ vers `smart@setup.paris`. Le destinataire initial est conservé dans To/Cc, ce qui permet d'identifier la boîte d'origine.
- Colonne `emails_entrants.source_boite` text NOT NULL DEFAULT 'smart', CHECK IN ('smart','logistique','devis'), index (source_boite, received_at DESC). Enum `email_categorie` enrichi de `'logistique'`.
- `poll-smart-inbox.ts` : `detectSourceBoite(msg)` (to+cc) ; `$select` inclut toRecipients,ccRecipients ; le classifieur IA reçoit un indice de source (devis@ → biais opportunite, log@ → biais logistique) ; 5 catégories.
- UI `/inbox-smart` : onglet Logistique, badge source (log@/devis@) sur les cartes, option de reclassement Logistique. Les logistique écartés n'apparaissent PAS dans Pubs/Écartés.
- Prérequis côté client : créer les 2 règles de redirection dans le centre d'admin Exchange (sinon rien n'arrive). Depuis le 23/10/2026, les emails restent en place : lecture seule stricte, aucun archivage/déplacement/suppression ; voir la contrainte emails-lecture-seule.
- La connexion Outlook (SMART, std_01ksy7req2fxfsn9f52ms7g11j) avait un refresh token expiré → reconnectée le 15/10/2026 ; surveiller `inbox_smart_settings.last_poll_error` en cas de nouvelle expiration.
