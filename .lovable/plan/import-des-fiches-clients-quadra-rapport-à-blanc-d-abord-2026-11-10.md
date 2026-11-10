# Import des fiches clients Quadra : rapport à blanc d'abord

Aucune donnée client n'est écrite à cette étape. Ensuite, deux points d'accord séparés : (A) la migration, (B) l'écriture des données après relecture du rapport.

## Étape 0 : contrôle du fichier
- Je relis le CSV collé (séparateur ;, 16 colonnes) et je compte les lignes. S'il y en a moins de 165, je vous donne le nombre exact et la dernière fiche reçue. Je ne peux pas deviner les fiches absentes sans le fichier complet : il faudra me renvoyer celles qui manquent.
- Je signale les lignes qui n'ont pas 16 colonnes.

## Étape 1 : migration à vous montrer (ajouts seulement, rien appliqué sans accord)
```sql
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS raison_sociale text,
  ADD COLUMN IF NOT EXISTS comptes_auxiliaires text[],
  ADD COLUMN IF NOT EXISTS plateforme_facturation text,
  ADD COLUMN IF NOT EXISTS import_compta_remarques text;
COMMENT ON COLUMN public.clients.comptes_auxiliaires IS 'Codes auxiliaires Quadra (0A/0V/0D…), distincts du futur 411 Pennylane';
CREATE INDEX IF NOT EXISTS clients_comptes_aux_gin ON public.clients USING gin (comptes_auxiliaires);
```
- La contrainte sur `numero_compte_client` ne change pas, et les droits non plus.
- Le contrôle de la base qui écarte les valeurs invalides n'est pas modifié. Il ne doit pas toucher à la plateforme ni aux remarques.
- Contrôle Pennylane (fiche et liste) : un e-mail de facturation **ou** une plateforme suffit. Un test est ajouté pour cette règle.
- Fiche client, section Facturation (Pennylane) : affichage de la raison sociale, des comptes Quadra, de la plateforme et du bloc « Remarques de la comptable » (en lecture).

## Étape 2 : rapport à blanc (lecture seule, aucune écriture)
Je lis les clients actuels sans les modifier. Les clients fusionnés (`fusionne_dans` non vide) sont exclus.
1. **Rapprochement**, dans l'ordre :
   - SIRET identique, ou SIREN identique (9 premiers chiffres du SIRET, ou SIREN saisi) ;
   - sinon nom normalisé identique : majuscules, sans accents ni ponctuation, et sans les formes juridiques (SAS, SASU, SARL, EURL, SA, SC, SCI, LTD, LIMITED, SL, SOCIEDAD LIMITADA, GMBH, BV, SRL, INC, LLC, PLC) ;
   - sinon **candidats approchants**, listés sans rattachement : un nom inclus dans l'autre, des mots en commun, une faible distance d'écriture, plus les cas que vous avez cités (Baldoria, bangumi, Dior, Crazy Horse).
2. **Projection des écritures** selon vos règles :
   - Type : Entreprise, Etrangère et Etranger donnent entreprise ; Particulier donne particulier.
   - Pays : colonne Pays si c'est un code valide à 2 lettres. Sinon je le déduis de la ville ou de l'adresse (SC, US, GB, DE…). Sinon je le signale. Jamais FR par défaut pour un client étranger.
   - Plateformes (Portail ou Plateforme Chorus, Sy by Cegedim, STRATOW) : elles vont dans `plateforme_facturation`. Les autres valeurs sont découpées sur la virgule et vont dans `emails_facturation`.
   - Les codes Quadra vont dans `comptes_auxiliaires`. La colonne A_verifier va dans `import_compta_remarques`, telle quelle (les valeurs proposées « → … » ne sont pas appliquées).
   - Langue fr_FR. Conditions de paiement reprises telles quelles.
3. **Contrôles par la règle de la base** : SIRET (clé de Luhn, avec l'exception La Poste), SIREN, cohérence TVA FR / SIREN, code postal à 5 chiffres seulement pour la France, e-mails. Je liste les valeurs qui seraient écartées et gardées en note (par exemple la clé de TVA de KM, les SIRET étrangers).

## Contenu du rapport (déposé dans vos fichiers en Excel + résumé dans le fil)
- Totaux : lignes lues, rattachées par SIRET/SIREN, par nom exact, à créer, clients étrangers.
- Tableau des candidats approchants : fiche du fichier, client actuel, score, raison.
- Tableau des conflits, champ par champ : valeur actuelle dans Staffing, valeur du fichier, décision (garder la valeur actuelle, remplir un champ vide, ou remplacer l'adresse complète par l'adresse structurée quand le code postal est le même).
- Valeurs qui seraient écartées.
- Pays déduits ou à signaler.
- Doublons dans le fichier lui-même : même SIREN ou même compte Quadra sur deux lignes (par exemple MONOPO, Crazy, Canal).

## Étape 3 : après votre accord sur le rapport, pas avant
Écriture en un seul bloc, qui s'annule entièrement en cas d'échec :
- remplissage des champs vides seulement ;
- création des clients non trouvés (actif, nom = raison sociale = Dénomination) ;
- aucun rattachement aux candidats approchants sans votre choix ligne par ligne ;
- `email` (contact) jamais modifié ; téléphone rempli seulement s'il est vide.

Rien n'est publié.
