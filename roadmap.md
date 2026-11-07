# Roadmap

## Import réel PDF 9–15 novembre — Gabin
- [ ] Rapprocher les employés et Dispos ; créer dans Dispos uniquement les noms réellement absents, sans coordonnées inventées.
- [ ] Importer les interventions et vérifier leur lecture dans Planning équipes ; ne pas publier.

## Planning équipes — affichage et export (7 nov. 2026)
- [x] Vue personne limitée aux personnes staffées de la semaine ; dates françaises, numéro/plage de semaine et flèches comme Dispos. Lecture admin et téléphone vérifiées, aucun débordement de page.
- [x] Export Excel hebdomadaire au format de blocs Planning (six colonnes et noms par six) ; téléchargement admin vérifié et contenu non vide testé avec fixture. Les semaines consultées en base étaient vides ; réimport réel de cet export non vérifié. Aucune migration ni publication.

## Import hebdomadaire Excel/PDF — Gabin (7 nov. 2026)
- [x] Import réutilisable Excel/PDF ajouté dans Planning équipes, aperçu éditable et rattachement cherchable aux personnes/chantiers existants ; historique séparé. Migration approuvée puis appliquée, aucun doublon de table.
- [x] PDF réel lu à l’écran : 14 interventions / 69 affectations (correction du total initial de 71 après recomptage), noms multilignes et les deux opérations du vendredi conservés ; 15 rattachements d’affectations restent manquants. Aucun planning réel enregistré.
- [x] Excel testé, enregistrement et réimport sans doublon, externe Dispos, fichier renommé, correction préservée et erreur atomique vérifiés avec session admin. Vue semaine relue, 19 tests verts, essais supprimés (0 étape fictive restante), mobile 390 et bureau 1366 contrôlés. Erreur XLSX.read et débordement mobile corrigés. Rien publié.
- [ ] Import réel : attend validation humaine des noms non rapprochés et des étapes existantes ambiguës ; pas de création automatique. Parcours chef et logistique en navigateur non vérifiés.

## Lot 1 — Planning nominatif logistique (7 nov. 2026)
- [x] « Planning équipes » rendue visible dans le menu (groupe Logistique) malgré le mode « suivi des affaires » actif globalement : ajout à la liste blanche des URL + test de garde. Vérifié à l'écran en admin (item présent, clic ouvre la page avec export et ajout). Droits en base : ouverture dispos.view (admin, logistique, chef d'équipe), import/export dispos.edit (admin, logistique). Rien publié.
- [x] Précisions Gabin : migration présentée, approuvée et appliquée ; formats terrain/atelier, synthèses séparées et compteurs terrain par défaut avec option atelier. Déplacement transactionnel et refus de réduction incompatibles vérifiés ; import externe manuel, réimport et export réel vérifiés ; 31 tests verts. Essais nettoyés. Lecture chef/refus écriture vérifiés en base, pas en navigateur ; fichier réel de Gabin et passage mixte en base non vérifiés. Rien publié.
- [x] Ajout Gabin approuvé : vue historique vivant et lecteurs protégés appliqués ; export Excel 10 colonnes et synthèses Personnes/Chantiers ; compteurs chantier/lieu/opération. Validation, aujourd’hui exclu, AM/PM, refus, annulation, correction, suppression et refus anonyme testés ; export téléchargé 1366/390, essais nettoyés. Pas de publication.
- [x] Plan réduit approuvé et socle additif appliqué : personnes et affectations existantes réutilisées.
- [x] Inventaire demandé après rejet : employés, postes, statuts, assignations, absences et écrans relus ; 63 tests existants passent.
- [ ] Réunir l’équipe terrain sans doublons, besoins qualifiés et affectations nominatives ; droits admin/logistique en écriture, chef d’équipe en lecture.
- [ ] Planning équipes semaine par étape / personne, recherche et disponibilités, filtres ; lecture mobile.
- [ ] Import unique consolidé onglet Affectations (10 colonnes exactes, ~2 130 lignes) : aperçu, rattachement manuel, historique dans assignations sans étapes passées ; réimport sans doublons. Import hebdomadaire Excel/PDF séparé autorisé par Gabin le 7 novembre pour la transition.
- [ ] Recette partielle : compteurs 4/6→6/6 et réimport 1 ajouté puis 0 ajouté/1 existant vérifiés ; essais nettoyés. Restent filtres qualifiés, disponibilités visibles, rapprochement externes, rendu 1366 et lecture chef à contrôler.
- [ ] Lots 2/3 : modèle compatible seulement, aucun écran ni automatisation ; publication réservée à Gabin.

## Lot 1 — Équipe projet, Presque gagné, planning BE / projets (27 oct. 2026)
- [x] Base : statut presque_gagne, tables role_referents + affaire_roles (RLS, blocage OAuth), synchro bidirectionnelle des colonnes historiques, liaison smart@ → Gabin C, reprise 88/16/1, fusion Kevin (fiche désactivée, 0 référence restante), seed 59 référents, compteur de charge, RPC affecter_role_projet, retrait restriction 6XXX, capability planning.pilotage, dispatch MCP.
- [x] Écran : bloc Équipe projet (fiche affaire / opportunité), badges rôle à affecter, colonne Presque gagné + alerte 15 j, Paramètres > Référents par rôle, Planning BE / projets.
- [x] Claude : equipe_projet dans fiche_affaire / rechercher_affaires, affecter_role_projet, planning_pilotage, presque_gagne. Manifeste 24 outils.
- [x] Tests Vitest + contrôles SQL annulés (dates par défaut, synchro, refus OAuth).
- [ ] Publication : en attente de l'accord de Gabin.

## MCP v2 — écriture contrôlée (26 oct. 2026)
- [x] Confirmation atomique 10 min, idempotence, droits api.mcp.write / mcp_v2_write, audit sécurisé et filtre écritures ; cible/snapshot verrouillés, clés externes isolées compte/client et contenu identique requis.
- [x] 9 outils écriture et 4 lectures supplémentaires ; préserver les 9 lecteurs v1. Scopes écriture globaux seulement.
- [x] 53 tests Vitest verts et premier OAuth réel : opportunité 9440 + étape, déplacement, annulation, archivage affaire confirmé et audit visible.
- [ ] Finition demandée : revue des RPC directs, parcours OAuth complet renforcé, audit et nettoyage, puis activation admin seulement si vérifié.
- [x] Migration de fermeture refusée : remplacer la réécriture dynamique par définitions explicites des 12 familles de fonctions (15 signatures avec surcharges), garde/contexte privé et policies restrictives sur 7 tables ; tester chaque signature OAuth refusé/UI accepté. Rôle NOLOGIN/NOBYPASSRLS vérifié et JWT UI sans client_id confirmé. Migration refusée non appliquée.
- [x] Vérifier les parcours UI signature, import Progbat, archivage, feuille de route sur données de test ; rejouer OAuth complet après cette migration. Consentement local actuellement refusé « Demande expirée ou indisponible », session/temporaire de test à reconstituer.
- [x] 404 DCR identifié : script utilisait /oauth/register au lieu du registration_endpoint découvert /oauth/clients/register ; endpoint production 201, discovery 200 et MCP anonyme 401, aucune configuration OAuth changée.
- [x] Documentation, ADR 005, mémoire ; signaler les limites et la republication nécessaire.

## MCP v1 — Claude lecture seule (26 oct. 2026)
- [x] OAuth géré et DCR activés ; clé ES256 déjà active, connexion existante et allow-list conservées.
- [x] SDK officiel, manifeste 9 outils, api.mcp/mcp_v1 administrateurs uniquement, lectures RLS, consentement, révocation et audit. 52 tests verts ; build OK.
- [x] Parcours OAuth réel (origine canonique adaptée uniquement dans le test localhost) : DCR → consentement → PKCE → JWT ES256 → profil + 6067 + pipeline + échéances + demandes clients → audit relu à l'écran → révocation bloque le prochain appel. Qui est où / charge / heures retournent vide, sources réellement vides en base ; calculs vérifiés sur fixtures uniquement. Erreur consentement lisible sur mobile.
- [ ] Données hors v1 : marge du tableur, CA estimé absent de la source, scopes métier non globaux sauf pipeline personnel ; demandent des readers complémentaires dédiés, pas d'extension de RLS.
- [ ] Écarts fournisseur/SDK documentés ADR 005 : OAuth hébergé chez le fournisseur et non dupliqué sur /oauth/* ; SDK émet du SSE Streamable HTTP pour les réponses legacy, pas JSON seul ; révocation globale renvoie un refus SDK HTTP 500 sans donnée, pas 403 ; sessions présentées comme consentements, pas inventaire tokens ; S256 non exclusif annoncé par le fournisseur.
- [x] Limite sur mesure : 60 appels/min/utilisateur en fenêtre glissante sur POST /mcp, compteur atomique en base et audit rate_limited dans la même transaction. 6 nouveaux tests Vitest (27 tests MCP verts), build OK et 9 outils conservés au manifeste. OAuth réel localhost : 60 ping acceptés, 61e HTTP 429 JSON-RPC + Retry-After 52 s, audit rate_limited relu dans /admin/audit ; consentements de vérification révoqués. Aucun autre changement au lot ; republication nécessaire.
- [ ] Test externe Claude après republication et connexion par l'utilisateur.

## Affectations chantier (26 oct. 2026)
- [x] Chef de projet dans Liste des chantiers, Chantiers, fiche chantier et signature ; dessinateur pour les 6XXX, recherche par nom et sauvegarde partagée. Colonne dessinateur additive et signature atomique via surcharge RPC, droits existants conservés.
- [x] 10 tests verts, build OK. Sur 6067 : chef et dessinateur enregistrés, relus après rechargement et retrouvés en fiche, puis valeurs initiales null restaurées et confirmées en base. Colonnes Chantiers visibles. Fenêtre 9405 : chef disponible, dessinateur visible pour 6123 et masqué pour 4123. Aucune opportunité réelle signée pendant la vérification.

## Traçabilité des codes dans la liste (26 oct. 2026)
- [x] Ancien code → code signé visible ; tri sur le code d'opportunité d'origine ; recherche ancien code et filtre 9XXX incluent les signatures.
- [x] 3 tests verts, build OK ; liste réelle vérifiée : 9439 → 4132 puis 9438 → 6067 puis 9437. Recherche 9439 sous filtre Opportunités retrouve 4132. Aucune signature modifiée.

## Code affaire à la signature (26 oct. 2026)
- [x] Code saisi manuellement indépendamment de la typologie ; suggestions facultatives sans écraser la saisie, unicité conservée par la RPC existante à code explicite (vérifiée en base).
- [x] 36 tests verts ; dans la fenêtre réelle de 9405 (fabrication), 6123, 4123 et 20123 restent saisis et permettent de signer ; 9437 refusé. Build OK. Aucune opportunité réelle convertie pour ce contrôle.

## Filtres chantiers et typologie tableur (26 oct. 2026)
- [x] Corriger le contraste des filtres dans Liste des chantiers : fond secondaire et texte contrasté, sélection vérifiée à l’écran.
- [x] Typologie tableur enregistrée immédiatement ; sauvegardes par cellule indépendantes et valeur en attente utilisée au blur. 58 tests verts, build OK. Sur 9437 : Stockage enregistré puis relu après rechargement, valeur initiale vide restaurée et relue.

## Emails en lecture seule (23 oct. 2026)
- [x] Retirer tout archivage et toute écriture archived_outlook ; audit src + supabase/functions : aucun autre déplacement/suppression de mail (les suppressions calendrier restent indépendantes).
- [x] Ajouter internet_message_id avec index unique et dédoublonnage stable ; correspondance historique exacte (conversation/date/objet/expéditeur quand connu), erreurs de lecture bloquantes et pagination Inbox complète. 7 tests verts, build OK ; migration vérifiée en base. Le parcours du poll a été testé avec réponses Outlook simulées, pas relancé sur toute la vraie boîte. Publication nécessaire pour arrêter le poll de la version publiée.

## Onglets chantier non déployés (23 oct. 2026)
- [x] Masquer Planning chantier, Devis, Grille, Planning (atelier), Planning fab, Équipe et Casting dans la fiche chantier ; URL directe renvoie à la synthèse. Liste centralisée dans `src/lib/affaire-tabs-visibility.ts`, code des pages conservé. 5 tests verts (`affaire-tabs-cachees.test.ts`), onglets relus dans l’app et redirections vérifiées.

## Fiche opportunité intégrée au chantier (23 oct. 2026)
- [x] Réunir le brief et le suivi commercial dans un onglet de la même affaire, préserver les anciens liens ; historique conservé après signature.
- [x] Permettre le classement des pièces jointes des emails d’origine dans les documents du chantier courant, préselectionné ; droits existants conservés.
- [x] Vérifier la cohérence des informations et le parcours réel : 9435, ancien lien redirigé, brief enregistré et relu avec en-tête cohérent, PDF classé et retrouvé dans Documents puis retiré. Lecteur ouvert, rendu PDF non confirmé. 26 tests verts, aucune erreur navigateur.

## Documents par affaire (23 oct. 2026)
- [x] Inclure les 9XXX dans la liste des chantiers (26 opportunités visibles dans le filtre).
- [x] Liste globale des documents par affaire, recherche, accès direct au fichier ; vue liste/galerie et lecteur PDF par chantier.
- [x] Classement depuis Demandes clients, choix d'affaire 4XXX/6XXX/9XXX, stockage privé sous RLS et anti-doublon. Parcours réel enregistré, relu depuis la liste globale et image ouverte ; document de vérification retiré. 10 tests verts, build OK.

## Numérotation opportunités (23 oct. 2026)
- [x] Prochain code 9XXX attribué à l’enregistrement sous verrou, historique des codes conservé après signature ; cinq derniers numéros affichés. Création réelle avec code périmé 9000 → 9437, relue après rechargement ; prochaine suggestion 9438. Opportunité de test supprimée, 4 tests verts.

## Création opportunité (19 oct. 2026)
- [x] Recherche client par mot-clé et création de fiche ; recherche chantier par numéro/nom/client/lieu avec intitulé libre. 14 tests verts ; création et rattachement client vérifiés dans l’app, données de test supprimées.

## Informations juridiques clients (17 oct. 2026)
- [x] Dirigeant modifiable et suggéré par l’IA, recherche ciblée Pappers / Société.com et liens directs ; 5 tests verts, recherche et enregistrement vérifiés sur agence-pamo (dirigeant non confirmé : laissé vide).
- [x] Bouton IA dans le bloc juridique, vérification du SIREN, adresse postale et site web avant enregistrement ; conserver les champs existants. 3 tests verts ; recherche réelle sur agence-pamo, adresse et site enregistrés puis relus. SIREN non trouvé : laissé vide.

## Demandes clients (17 oct. 2026)
- [x] Après lecture : analyse brève du projet, points à clarifier et réponse IA modifiable et copiable, sans envoi automatique. Vérifié sur une vraie demande : réponse générée et presse-papiers identique ; 5 tests des transferts verts.

## Calendrier chantier (17 oct. 2026)
- [x] Fenêtre de calendrier d'un seul chantier depuis le planning logistique, recherche et dates vides masquées.
- [x] Modification via le formulaire existant selon les droits ; 20 tests verts, vérification sur chantier 4130, enregistrement et retour au calendrier, affichage mobile.
- [x] Planning logistique ouvert par défaut sur 1 semaine glissante depuis aujourd'hui (J → J+6) au lieu de 2 semaines calées sur le lundi ; bouton « Aujourd'hui » aligné, titre « Du … au … ». Garde-fou Vitest `planning-fenetre-defaut.test.ts`, vérifié dans l'app (7 colonnes dès le 17 oct.).

## Fait aujourd'hui (15 oct. 2026)
- [x] Bug flèche pipeline : la page /opportunites ne rendait jamais la fiche enfant (pas d'Outlet) — corrigé en séparant la liste (route index) du gabarit (Outlet). Vérifié kanban + tableur + retour arrière.
- [x] Menu simplifié « suivi des affaires » : flag `deploiement_suivi_affaires` actif, menu = Pipeline opportunités + Demandes clients + Chantiers uniquement, tout le reste caché (accueil, planning, logistique, RH, Admin). Aucun blocage d'URL.

## À venir
- [x] Accès au calendrier Outlook revérifié le 17 oct. à 11:12 UTC : authentification et lecture calendriers / événements 200 ; 30 étapes suivies en base et 30 événements réellement présents dans « Planning logistique Setup » de log@setup.paris. Relance depuis le planning : agenda à jour, aucune modification en attente. Ancien blocage 403 disparu.
- [ ] **Module « planning logistique »** (demande Gabin 15/10) : nouveau planning lié aux montages / démontages / livraisons / approvisionnements / chargements / déchargements. Les modules planning existants (Planning général, Tableau d'atelier, Charge atelier, Qui est où) sont seulement CACHÉS, pas supprimés. Le module Échéances doit être revu et mixé avec ce planning logistique.

## Planning logistique (CDC Project Shift)
- [x] Lot 1 — Socle (étapes, contacts, besoins, paramètres, droits)
- [x] Lot 2 — Planning /logistique + écran atelier /ecran-atelier
- [x] Lot 3 — Onglet Logistique sur le chantier, choix véhicule, conflits
- [x] Lot 4 — IA lecture jalonnements (pièces jointes log@ + dépôt manuel)
- [x] Lot 5 — Rétroplanning + écran de validation des propositions
- [ ] Lot 6 — Relances
- [x] Lot 7 — Calendrier Outlook log@ : ABANDONNÉ (Gabin 15/10) — le planning logistique vit dans l'app (mobile inclus) ; synchro Outlook éventuelle plus tard, certains éléments seulement
- [ ] Compte « Écran atelier » (attend email de la TV)

## Notes de frais
- [x] Recherche par mot-clé dans le choix de chantier (demande Gabin 19/10 08:31) : le sélecteur filtre en direct sur n°, nom, client et lieu. Vérifié : 45 chantiers proposés, « noel » → 2, « 6055 » → 1, sélection remplit bien la fiche. Garde-fou Vitest `notes-frais-choix-chantier-recherche.test.ts`.

## Pipeline opportunités (23 oct. 2026)
- [x] Filtre « chargé d'affaires » ouvert par défaut sur **Tous les CA** pour tout le monde (demande Gabin 23/10 11:58) : plus de présélection automatique sur l'utilisateur connecté. Vérifié dans l'app : sélecteur = « Tous les CA », 27 opportunités dont 9437 visible dès l'ouverture.

## Lot 4 — Outils Claude pour les devis (3 nov. 2026)
- [x] Passe 0 : fermer l'accès anonyme aux fonctions mcp_*.
- [x] Passe 1 : colonnes devis, journal, verrou humain, devis_soumettre, devis_remplir_lot, dispatch/aperçu (sans seuil de remise).
- [x] Passe 2 : 11 outils MCP + instructions + photos (10 Mo visé, repli 5 Mo).
- [x] Passe 3 : badge « Rédigé par Claude », note de Claude.
- [x] Recette (10 points). Publication : non, en attente de Gabin.

## Lot 3a — Transfert ProGBat (3 nov. 2026)
- [x] Passe 1 : colonnes transfert, données d'export, enregistrement du transfert, envoi après transfert, listes avec numéro ProGBat.
- [x] Passe 2 : générateur Excel + fiche de contrôle (arrondi absorbé dans Suivi/Pose/Dépose).
- [x] Passe 3 : bouton « Vers ProGBat », fenêtre « Enregistrer le transfert », numéro dans listes/éditeur/pipeline/PDF.
- [x] Fichier d'exemple 9484-R2 (hors historique).
- [ ] Lot 3b (outils Claude) : en attente d'un vrai import ProGBat avec Gabin.

## Pipeline + éditeur devis (3 nov. 2026)
- [x] Lisibilité Kanban (8 points)
- [x] A. Suppléments 6XXX dans le pipeline (règle, tuile, colonne, badge, cas 6064)
- [x] B. Éditeur de devis : bandeau compact + plein écran, note Claude repliable/cases, arbre redimensionnable, chapitres simplifiés, heures au devis, liens coûts manquants, liste de contrôle, champs secondaires repliés
