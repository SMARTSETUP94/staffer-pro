# Lot « Demandes logistiques et planning » + passage à Claude

Plan seulement. Aucune migration, aucun code, aucune donnée touchés. Chaque migration passera par l'outil de migration **et attendra l'approbation** avant application (rappel 0128 pris en compte).

## Ce qui a été vérifié aujourd'hui (code)
- **La passerelle Lovable AI propose Claude** : `anthropic/claude-sonnet-5` (extraction), `anthropic/claude-haiku-4-5` (tri), `anthropic/claude-opus-5` disponible. La politique de l'espace autorise ces modèles sur l'API Messages. **Aucune clé `ANTHROPIC_API_KEY` n'est nécessaire** ; facturation sur les crédits de l'espace, journal dans l'onglet IA. Si Gabin préfère quand même sa propre clé, je la demanderai par le formulaire de secret.
- Appels IA actuels (11 fichiers), modèles mélangés :
  - Gemini 3 Flash : tri des boîtes (`shared-inbox-classify.ts`, `poll-smart-inbox.ts`), images des devis (`images-ia`).
  - GPT-6 Astra : assistant étapes logistiques, jalonnements, documents fournisseurs, import planning, notes de frais, enrichissement client, suggestion de mail client.
  - Le constat « Gemini partout » est donc partiel : l'extraction logistique tourne aujourd'hui sur GPT-6 Astra.
- `ia_feedback_logistique` est lue dans `src/lib/logistique/ia-feedback.ts` ; son usage réel dans la consigne est **à confirmer en étape 0** (non affirmé).
- Les chiffres du constat (27 cas, ~150 mails, 293 étapes, jalonnement 16-22 nov, 15 étapes du 12/11) seront relus en base en étape 0 ; aucun n'est repris ici comme vérifié.

## Découpage livrable

### Étape 0 — Relevé (lecture seule)
Relire en base les 27 cas, la file `pending_review` par expéditeur/boîte, les étapes de la semaine 16-20/11, le jalonnement et la lecture de `ia_feedback_logistique`. Livrable : tableau de constat corrigé.

### Étape 1 — L0 : module IA unique + banc d'essai (livrée en premier)
- Module serveur unique `src/lib/ai/fournisseur.server.ts` : `appelerIA({ usage, systeme, contenu, schema })`.
  - Constante `MODELES_PAR_USAGE` : `extraction_logistique`, `jalonnement`, `documents_fournisseurs`, `images_devis` → Sonnet 5 ; `tri_mails` → Haiku 4.5 ; secours → `google/gemini-3-flash-preview`.
  - Appels Claude en flux (API Messages), sortie JSON stricte via outil unique, schéma validé côté serveur ; contenu des mails/PJ toujours dans un bloc « données », jamais dans la consigne.
  - Secours Gemini uniquement sur 5xx / 429 épuisé / réponse invalide ; jamais sur refus ou 403. Trace du basculement.
  - Journal par appel (nouvelle table `ia_appels`, M-L0) : usage, modèle, secours oui/non, durée, jetons, coût estimé, statut, run id. Aucun contenu stocké.
- **Banc d'essai** (script serveur admin, non exposé) : rejoue les 27 cas + ~15 mails de tri déjà validés avec Gemini, GPT-6 Astra (référence actuelle) et Claude. Score par champ (date, type, lieu, heures, nb étapes, affaire), coût, durée. Rapport en Markdown dans Files.
- **Bascule seulement après lecture du rapport par Gabin.** Les autres usages (notes de frais, enrichissement client, mail client) passent par le module mais gardent leur modèle tant que Gabin ne demande pas leur changement.

### Étape 2 — L1 : extraction
- Champs `heure_debut`, `heure_fin`, `a_partir_de` (booléen), `duree_minutes` ; la durée calcule l'heure de fin, jamais dans la note ; `heure_fin 00:00` refusée sauf nuit explicite.
- Dates : année déduite de la date de réception (fonction pure testée) ; date < réception − 30 j → signalée, non proposée.
- Lieu : rapprochement pur sur `lieux`, adresses favorites, lieu de l'affaire et table d'alias (M-L1 : `lieux_alias`, admin seulement) → `lieu_id` si sûr, sinon `lieu_libre` + drapeau.
- Affaire par numéro (4/6/9XXX) puis client/projet (helper existant `suggest-affaire.ts`).
- Lecture des PJ déjà classées (texte de pages du lot images, `classement_pj`).
- Conditionnement / chargement atelier proposés **décochés** sauf mention.
- 5 à 8 corrections passées les plus proches (`ia_feedback_logistique`) injectées comme exemples.

### Étape 3 — L2 : tri
- Nouvelle valeur `fournisseur_suivi` ajoutée à `email_categorie` (M-L2, additif) ; règles d'expéditeurs connus + Haiku.
- Écran admin « Reclasser la file » : bilan par catégorie proposée avec exemples, case par lot, confirmation admin → statut `dismissed` + motif « classé sans suite : … ». Aucun lancement sur données réelles sans accord.

### Étape 4 — L3 : planning
- Validation → étapes avec `proposition_id` / `source_email_id` / `jalonnement_id` ; jalonnement → `planifie` + nombre d'étapes (RPC existante étendue, corps relu avant redéfinition).
- Doublons avant création (même affaire, date, type, horaires ±2 h) : Fusionner / Ignorer / Créer quand même.
- Suggestion de véhicule (volume mentionné × capacité × conflits), jamais affectée automatiquement.
- Responsable rapproché d'un employé actif, texte libre conservé si doute ; effectif et postes.
- **Jalonnement 16-22 nov** : proposer un rapprochement ligne à ligne avec les 15 étapes existantes (affaire + date + type), affiché en bilan ; **aucune écriture avant accord de Gabin**.

### Étape 5 — L4 : mesure
Carte « Qualité IA logistique » dans l'écran Demandes logistiques : part des champs corrigés par semaine et par champ, lue depuis `ia_feedback_logistique` via une fonction de lecture admin/logistique.

## Migrations prévues (texte complet montré dans l'outil avant chaque application)
- **M-L0** `ia_appels` : table + GRANT (service_role ALL, authenticated SELECT admin via RLS) + RLS.
- **M-L1** `lieux_alias` (alias, lieu_id) + colonnes nullables `a_partir_de`, `duree_minutes`, `lieu_douteux` sur `affaire_etapes_logistiques`.
- **M-L2** valeur d'enum `fournisseur_suivi` ; colonne `motif_classement` nullable sur `emails_entrants`.
- **M-L3** colonnes nullables d'origine sur les étapes si absentes (vérifié en étape 0), redéfinition explicite des RPC de validation depuis leur corps actuel ; nouvelles SECURITY DEFINER avec `REVOKE EXECUTE FROM PUBLIC, anon`.

## Coûts estimés (à confirmer par le banc)
Banc : ~45 cas × 3 modèles, moins de 2 € au total. Production : Sonnet ~0,01–0,03 € par demande, Haiku < 0,002 € par mail trié.

## Tests
Fonctions pures testées : année de date, détection > 30 j, heures/durée, alias de lieu, doublons, choix véhicule, secours IA (statuts). Essais sur données d'essai retirées ensuite ; écrans 390 et 1366 px.

## Questions pour Gabin
1. Passerelle Lovable (sans clé) plutôt que clé Anthropic propre : d'accord ?
2. Notes de frais, enrichissement client et mail client : rester sur GPT-6 Astra ou passer aussi à Claude ?
