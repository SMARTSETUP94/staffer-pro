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

## MCP v2 — écritures contrôlées
Les neuf outils v1 et leur limite de débit sont conservés. Les outils d’écriture apparaissent uniquement avec `api.mcp.write`, le flag `mcp_v2_write` et le droit métier correspondant en périmètre global ; activation initiale réservée aux administrateurs. Les périmètres restreints sont refusés dans cette révision.

| Outil | Portée |
|---|---|
| creer_opportunite | Client existant ou création explicitement autorisée avec `creer_client=true`, code 9XXX atomique, contact/source facultatifs |
| ajouter_action_opportunite | Action du journal commercial et échéance |
| mettre_a_jour_opportunite | Champs commerciaux autorisés, prochaine action, jalon existant, perdu/en attente avec motif ; jamais signature |
| modifier_chantier | Dates, lieu, contact site, responsables, statut, informations montage et notes |
| ajouter_note_chantier | Discussion existante du chantier |
| creer_etape_logistique | Étape manuelle et véhicule facultatif |
| modifier_etape_logistique | Champs logistiques autorisés |
| deplacer_etape_logistique | Nouvelle date ; durée préservée sans nouvelle fin |
| annuler_etape_logistique | Statut annulé avec motif, sans suppression |

Quatre lectures supplémentaires : `rechercher_clients`, `planning_logistique` (avec conflits véhicules), `vehicules_disponibles`, `lister_propositions_logistiques` (registre des jalonnements uniquement, sans validation IA).

### Confirmation obligatoire
1. Appeler l’outil sans `confirmation_id` : aucune écriture métier ; résultat avant/après, avertissements, doublons et identifiant valable **10 minutes**.
2. Présenter cet aperçu à l’utilisateur et obtenir son accord.
3. Renvoyer exactement les mêmes arguments avec `confirmation_id` : exécution atomique, audit et résultat. Identifiant lié au compte, au client OAuth, à l’outil, aux arguments, à la cible et à son état initial.
4. Arguments modifiés, expiration, droits retirés ou cible modifiée : refus et nouvel aperçu nécessaire. Une confirmation déjà exécutée renvoie le résultat existant. `cle_externe` évite une deuxième création d’opportunité ou d’étape.

Les conflits véhicules avertissent sans bloquer. Modifier les dates d’un chantier ne déplace pas ses étapes ou affectations. `notes` désigne le commentaire général du chantier ; `ajouter_note_chantier` ajoute un message de discussion. Le responsable logistique reste un texte, conformément au planning existant (`responsable_id` n’est pas pris en charge). « En attente » correspond à « À faire » et le motif est conservé dans le journal. Un jalon doit déjà exister dans la fiche.

Audit → Connecteur Claude → **Écritures uniquement** : aperçu, exécution/refus, cible, confirmation et différences expurgées des textes et coordonnées. Aucune écriture heures, affectations, RH, contrats, paie ; aucun effacement physique ni signature. Aucun secret supplémentaire, aucun nouveau service à activer.

### Vérification et mise en service v2
Parcours OAuth réel local avant le dernier renforcement : opportunité 9440 créée, confirmée/rejouée sans doublon, clé externe réutilisée sans nouvelle création ; étape créée, déplacée puis annulée ; résultat relu dans la fiche et audit visible. Opportunité de test archivée par le chemin applicatif. Les clés externes sont désormais isolées par compte et client OAuth ; un même identifiant avec un contenu différent est refusé. Les reprises après retrait d’accès ou archivage sont refusées, sans nouvelle écriture.

Le dernier renforcement (cible/snapshot obligatoires, rattachement étape verrouillé, accès direct aux RPC partagés refusé pour OAuth) est appliqué et relu en base, mais son parcours OAuth n’a pas pu être rejoué : le service d’enregistrement du client de vérification a renvoyé 404 dans l’environnement final. Ne pas considérer le lot prêt à publier avant ce dernier contrôle et la vérification complète des chemins directs préexistants. Aucun nouveau service n’a été activé ; Lovable Cloud et OAuth étaient déjà présents.

## Vérifications restantes / écarts explicites
- Publier puis effectuer une vraie connexion depuis Claude, tester mobile/desktop et déconnexion/reconnexion.
- Limite sur mesure confirmée : 60 requêtes POST /mcp par utilisateur sur 60 secondes glissantes, partagées entre clients OAuth et instances. Compteur atomique en base ; au-delà, HTTP 429, `Retry-After` en secondes et erreur JSON-RPC « limite atteinte, réessayez dans X s ». Refus journalisé `rate_limited` sans lecture métier ; aucune prolongation de la fenêtre par les refus. Une panne du compteur ou de son audit bloque la requête (503).
- OAuth authorize/register/token et RFC 8414 sont hébergés par le fournisseur et annoncés par la découverte, pas dupliqués sur le domaine Staffing (ADR 005).
- S256 supporté ; le fournisseur annonce aussi plain. Le lot n'impose pas S256 exclusif côté fournisseur.
- Durées access/refresh héritées du fournisseur ; pas de promesse de 1 h/30 j sans lecture de sa configuration.
- Essais simulés ne prouvent pas les erreurs du fournisseur ni le parcours réel Claude ; consulter les résultats de vérification du lot.
- SDK officiel : réponses legacy Streamable HTTP en SSE (`data:`), et non JSON seul. Les versions 2025-06-18 et 2025-03-26 passent les tests initialize. La révocation locale bloque avant tout lecteur mais remonte actuellement un HTTP 500 générique du SDK, pas un 403.

## Vérifications réalisées
Ajout de la limite : 6 tests Vitest supplémentaires (27 tests dans les deux fichiers MCP exécutés), migration et fonction vérifiées en base. Parcours OAuth réel localhost puis 60 requêtes ping acceptées et 61e refusée HTTP 429 JSON-RPC avec Retry-After 52 s ; statut rate_limited relu dans le journal à l'écran. Consentements temporaires révoqués. L'adaptation de l'origine OAuth concerne uniquement le script localhost, pas la configuration fournisseur. Manifeste toujours à 9 outils ; révision non publiée.

52 tests Vitest : protocole, pagination, 9 lecteurs avec données simulées, refus métier, audit, taille et helpers existants. OAuth réel via client de vérification : inscription dynamique, consentement, PKCE S256 et échange JWT ES256, lecture profil et chantier 6067, pipeline, échéances et demandes clients, audit visible, blocage après révocation. Sur localhost seulement, l'origine OAuth a été adaptée par le script de test à l'origine canonique autorisée ; aucun réglage fournisseur n'a été élargi. Cela ne vérifie pas Claude ni la révision publiée. Les sources assignations/atelier_planning/heures_saisies sont vides en base : les calculs et anomalies n'ont été testés qu'avec fixtures, pas avec de vraies données de planning.