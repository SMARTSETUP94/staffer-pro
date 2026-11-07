# Demandes clients — mails transférés et identité d’origine

## Résultat attendu
- Demandes clients reste exclusivement alimenté par **devis@setup.paris**.
- Une demande transférée affiche le vrai contact, la société et l’objet d’origine, avec le badge « transféré par smart@setup.paris » ou l’adresse réelle du transmetteur.
- La date de demande est celle du message d’origine lorsqu’elle est identifiable ; la date de réception reste conservée.
- Si l’origine ne peut pas être identifiée, conserver l’expéditeur du transfert et afficher « Client à identifier ».
- Aucun déplacement, archivage ou suppression de mail ; aucune publication.

## État vérifié
- La liste Demandes clients filtre déjà `source_boite = devis`.
- Les demandes sont stockées dans **emails_entrants** ; il n’existe pas de table `demandes_clients`. Aucune nouvelle table ne sera créée.
- Le relevé direct de devis@ renseigne déjà la bonne source, mais conserve l’expéditeur et l’objet du transfert.
- Un second relevé de smart@ déduit la source des destinataires. Le lecteur d’expéditeur existant prend le dernier en-tête De/From et ne traite pas complètement les dates, objets et transferts internes successifs.
- La base contient également de vrais mails smart@, de nombreuses candidatures et demandes anciennes : leur étiquette « smart » seule ne prouve pas une réception sur devis@.

## 1. Reconnaître les transferts
- Pour les mails reçus sur devis@ : déclencher le traitement si l’expéditeur appartient exactement à `setup.paris` ou `groupe-smart.fr`, ou si l’objet commence par Fw:, Fwd: ou TR:, sans distinction de casse.
- Reconnaître les blocs Outlook français et anglais : De/From, Envoyé/Sent, À/To, Cc, Objet/Subject ; gérer HTML, texte, entités et lignes repliées.
- Parcourir les transferts du plus récent vers l’origine, ignorer les transmetteurs internes et retenir le **premier expéditeur externe** avec son bloc d’en-tête associé. Ne pas mélanger l’expéditeur d’un bloc avec la date ou l’objet d’un autre.
- Déduire la société de la signature du message externe sélectionné, puis du domaine professionnel. Ne pas transformer un domaine grand public en société certaine.
- Retirer les préfixes de transfert de l’objet. Les champs absents restent incertains : aucune date ou identité inventée.

## 2. Ingestion et affichage
- Appliquer le même lecteur à l’ingestion, à la réanalyse et au recalcul des anciens mails pour éviter des résultats différents.
- Enregistrer `source_boite = devis` à partir de la boîte réellement relevée, jamais à partir de l’expéditeur.
- Conserver le corps complet, les identifiants Outlook et les pièces jointes sans modification ; mémoriser aussi les en-têtes du transfert avant remplacement.
- Utiliser l’identité d’origine pour la liste, la lecture, le préremplissage du contact/client et les réponses proposées.
- Garder les liens client/contact déjà validés ; ne pas modifier automatiquement les fiches clients ou les opportunités existantes.
- Ajouter le badge de transfert et l’état « Client à identifier ». La page ne proposera aucune source « smart » ; ne pas supprimer cette source des autres modules qui la nécessitent.

## 3. Recalcul des demandes existantes
- Préparer un bilan des anciennes demandes marquées smart et des transferts déjà marqués devis.
- Confirmer la réception sur devis@ à partir des données disponibles ou d’une lecture Microsoft en lecture seule, rapprochée par identifiant stable. Un objet TR/Fw ou un expéditeur interne ne suffit pas à prouver la boîte de réception.
- Corriger les demandes confirmées : source devis, transmetteur, identité/contact, société, objet et date d’origine. Les cas sans origine exploitable gardent leur expéditeur avec « Client à identifier ».
- Les lignes dont la réception sur devis@ reste impossible à confirmer seront listées à part pour validation, sans reclasser massivement les vrais mails smart@.
- Conserver strictement le statut, les liens, les identifiants et les pièces jointes ; aucune suppression et aucun nouvel email dupliqué. Rejouer le recalcul ne doit pas remplacer le transmetteur par l’expéditeur déjà corrigé.

## Migration proposée — avant application
Uniquement deux colonnes ajoutées à la table existante ; pas de changement de droits ou de politiques.

```sql
ALTER TABLE public.emails_entrants
  ADD COLUMN IF NOT EXISTS transmis_par text,
  ADD COLUMN IF NOT EXISTS client_a_identifier boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.emails_entrants.transmis_par IS
  'Adresse du transmetteur conservée lors de la résolution du message externe d origine.';
COMMENT ON COLUMN public.emails_entrants.client_a_identifier IS
  'Origine client non identifiée de façon fiable dans une demande transferee.';
```

La date de demande d’origine et les en-têtes du transfert conservés utiliseront les métadonnées existantes. `received_at` reste la date réelle de réception. Le recalcul sera une opération de données séparée, après application de la migration approuvée.

## Vérifications
- Tests concrets : Outlook FR/EN, HTML/texte, transferts successifs internes, premier externe, nom/adresse, société, date et objet associés ; corps absent ou en-tête incomplet ; mail direct inchangé.
- Tester la provenance devis indépendante de l’expéditeur et la non-reclassification d’un véritable mail smart.
- Tester le dédoublonnage et l’idempotence du recalcul, la conservation du statut et des liens client/opportunité.
- Vérifier dans Demandes clients une demande réelle corrigée et un cas « Client à identifier », avec badge et pièces jointes accessibles.
- Rendre un bilan : corrigées, non identifiées, provenance à confirmer ; vérifié / non vérifié. Aucun envoi et aucune publication.

## Suivi du planning en cours
Le planning du 9–15 novembre reste à importer après résolution des identités : quatre fiches Dispos ont été reliées à des employés et treize fiches ont été ajoutées avec leurs vrais portables avant le passage en mode plan. Il reste notamment les employés inactifs FRANCAIS Kévin, RAVI Dylan et TOURE Amadou, le portable absent de CARVALHO Alberto et les correspondances de noms ROUX / MATINGOU à confirmer. Ne pas inventer de portable, réactiver un employé ou fusionner un nom ambigu sans accord. Cette correction des mails ne supprime pas la tâche du planning ; elle sera ajoutée à la roadmap à la reprise de l’implémentation.