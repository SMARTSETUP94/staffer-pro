# ADR 005 — MCP Claude en lecture seule

## Décision
Utiliser le SDK officiel `@lovable.dev/mcp-js` (Streamable HTTP) et le serveur OAuth géré de Lovable Cloud existant. OAuth/DCR ont été activés le 26 octobre 2026 ; la configuration fournisseur confirme un issuer direct et une clé ES256 active. Aucun serveur de tokens local, token opaque, clé métier admin, ni token de session copié.

Le fournisseur possède authorize, token, register, refresh et discovery RFC 8414. La découverte RFC 9728 sur le domaine Staffing annonce cet issuer ; les endpoints `/oauth/*` et `/.well-known/oauth-authorization-server` ne sont **pas dupliqués sur le domaine de l'app**. C'est une différence explicite par rapport au cahier des charges, conforme à la préférence pour OAuth géré. S256 est supporté par le fournisseur ; sa découverte annonce également plain, qui n'a pas été désactivé par ce lot. La durée des tokens suit la configuration fournisseur, non une table locale.

Chaque requête MCP requiert un JWT OAuth avec `client_id`, api.mcp, mcp_v1, un consentement local non révoqué et un utilisateur valide. Les lectures utilisent son bearer et la RLS. Les droits métier sont revérifiés. Les scopes non globaux sont refusés, sauf pipeline personnel explicitement filtré, tant que des readers dédiés ne sont pas implémentés. Les vues matérialisées dépourvues de RLS sont réservées à une affaire déjà autorisée et au scope global ; aucune politique existante n'est élargie.

## Consentement et révocation
Le consentement n'accepte que les deux callbacks Claude configurés. Le retour de connexion préserve authorization_id, y compris mot de passe et lien magique ; self-signup reste désactivé. Le SDK gère l'approbation/refus et les erreurs fournisseur.

`mcp_connections` est un registre de consentements locaux, **pas un inventaire des sessions OAuth actives**. Révoquer une connexion bloque immédiatement tous ses JWT sur Staffing. Pour son propre compte, le SDK révoque aussi les sessions et refresh grants fournisseur. Pour un autre compte, seul le blocage Staffing est appliqué : ne pas prétendre invalider ses tokens fournisseur.

L'API admin fournisseur n'est utilisée que par une fonction serveur de gestion qui vérifie admin et api.mcp avant d'importer le client privilégié, jamais par les outils MCP.

## Bornes et confidentialité
25 lignes par défaut, maximum 100, pagination déterministe et plafond 200 000 octets. Agrégations : maximum 999 lignes sources sinon erreur explicite, pas de total silencieusement incomplet. Pas de salaires, IBAN, contrats, numéros SS ou motifs de maladie. Audit technique seulement, arguments whitelistés sans texte libre. Un échec d'audit empêche le retour des données.

## Limites de cette révision
La plateforme n'a pas de limiteur standard : aucun limiteur ad hoc n'est ajouté avant confirmation de ce compromis. La fiche ne calcule pas la marge provenant du tableur séparé et le pipeline ne fabrique pas un CA estimé absent de sa source. Ces champs indiquent leur indisponibilité. Aucun WebMCP : ce lot demande expressément un serveur distant Claude.

Les tests locaux et l'extraction du manifeste ne prouvent pas une publication ; republication et essai réel Claude restent nécessaires.

Le transport officiel SDK émet les résultats legacy sous forme SSE Streamable HTTP, non JSON seul. Les deux versions demandées ont été vérifiées. Un refus dans createAppContext (ex. connexion révoquée) produit actuellement une réponse générique HTTP 500 du SDK, sans donnée ; ne pas confondre ce statut avec une fuite ou une lecture réussie. Aucun transport custom ni route générée retouchée pour contourner le SDK.