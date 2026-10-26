# Connecteur Claude — Staffing Setup Paris

## Adresses
- Production : `https://staffing.setup.paris/mcp`
- URL publiée alternative : `https://staffer-pro.lovable.app/mcp`
- Preview : `https://id-preview--646285ee-aca4-406c-aa78-a85235d7e6e0.lovable.app/mcp`

Ces adresses ne servent la nouvelle révision qu'après publication (la preview suit les modifications). Le connecteur est privé par OAuth même si le site est public.

## Connexion
1. Republier l'application avec le lot MCP.
2. Claude → Paramètres → Connecteurs → Ajouter un connecteur personnalisé.
3. Nom : Staffing Setup Paris ; URL : `https://staffing.setup.paris/mcp`.
4. Connecter, se connecter à Staffing avec le compte existant, puis autoriser la consultation.
5. Demander « Qui suis-je et quels sont mes droits ? », puis « Recherche le chantier 6067 ».

OAuth, inscription dynamique des clients et clé asymétrique active : confirmés côté Lovable Cloud. Aucun secret à saisir dans Claude ou Project Settings. Seuls les administrateurs ont api.mcp et mcp_v1 au départ. La présence d'un client enregistré n'autorise jamais un compte sans ces droits.

Claude obtient les tokens via OAuth/PKCE S256 ; ne jamais coller de token de session. Ses versions desktop/mobile dépendent de la disponibilité des connecteurs distants dans le compte Claude, non d'un serveur MCP local installé.

## Outils
| Outil | Données | Droit métier |
|---|---|---|
| rechercher_affaires | identité, dates, responsables, filtres | section.affaires |
| fiche_affaire | identité, équipe, objets/heures, devis selon droits complémentaires | section.affaires |
| pipeline_opportunites | pipeline actif, jalon, prochaine action | section.pipeline_opportunites + droits commerciaux |
| qui_est_ou | affectations, indisponibilités sans motif, anomalies | planning.view |
| charge_atelier | personnes/jour par métier vs capacité | section.fabrication |
| heures_affaire | heures et comparaison devis | heures.audit |
| echeances | opérations à 14, 31 ou 92 jours | section.affaires |
| demandes_clients | métadonnées des emails classés opportunité | demandes_clients.view |
| mon_profil | identité personnelle, rôles, capabilities | api.mcp |

Toutes les descriptions et entrées sont en français, strictes, en lecture seule. `limit` = 25 par défaut, maximum 100 ; `cursor` est un offset décimal, initialement `"0"`, puis reprendre `next_cursor`. Périodes explicites maximum 93 jours inclusifs. Dates ISO, euros HT. Plafond 200 000 octets ; réduire la période si trop volumineuse.

Marge et CA estimé absent de la source ne sont pas inventés. Les scopes métier limités sont actuellement refusés, sauf pipeline personnel ; pas d'ouverture des RLS pour les contourner. Audit des consultations dans `/admin/audit` → Connecteur Claude.

## Révocation
Ouvrir `/admin/connecteur-claude`, trouver la connexion puis Révoquer et confirmer. Le prochain appel est bloqué même avec un JWT non expiré. Pour son propre compte, les sessions et renouvellements fournisseur sont également révoqués ; pour un autre compte, le blocage porte sur Staffing. La page présente les autorisations, pas des sessions supposées actives.

## Vérifications restantes / écarts explicites
- Publier puis effectuer une vraie connexion depuis Claude, tester mobile/desktop et déconnexion/reconnexion.
- Limite 60 appels/min : en attente de confirmation d'un mécanisme ad hoc, faute de primitive standard.
- OAuth authorize/register/token et RFC 8414 sont hébergés par le fournisseur et annoncés par la découverte, pas dupliqués sur le domaine Staffing (ADR 005).
- S256 supporté ; le fournisseur annonce aussi plain. Le lot n'impose pas S256 exclusif côté fournisseur.
- Durées access/refresh héritées du fournisseur ; pas de promesse de 1 h/30 j sans lecture de sa configuration.
- Essais simulés ne prouvent pas les erreurs du fournisseur ni le parcours réel Claude ; consulter les résultats de vérification du lot.