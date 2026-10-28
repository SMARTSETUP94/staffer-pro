# Correctif 0044 — Écarter une demande avec clé externe

Rien n'est appliqué avant votre accord écrit. Pas de publication.

## Constat (vérifié en base)
- Contraintes actuelles de la table des clés externes : seulement la clé primaire `(tool, key_hash)`.
- Lignes existantes : 172 `creer_etape_logistique` + 5 `creer_opportunite`, **toutes avec une affaire**. La contrainte CHECK ci-dessous est donc satisfaite par l'existant.

## Migration complète (0044)

```sql
ALTER TABLE public.mcp_write_external_keys ALTER COLUMN affaire_id DROP NOT NULL;

ALTER TABLE public.mcp_write_external_keys
  ADD CONSTRAINT mcp_write_external_keys_affaire_requise
  CHECK (affaire_id IS NOT NULL OR tool = 'traiter_demande');
```

- Rien d'autre : aucune autre colonne, contrainte, index, policy ou fonction modifiés.
- La contrainte CHECK maintient l'affaire obligatoire pour tous les autres outils. Pour `traiter_demande`, elle n'est vide que pour un écart (un rattachement enregistre toujours l'opportunité).

## Comportement de la relance (vérifié dans la définition actuelle)
Dans `mcp_execute_write_locked` :
`IF existing.request_hash IS DISTINCT FROM _arguments_hash OR (_tool<>'creer_opportunite' AND existing.affaire_id IS DISTINCT FROM c.affaire_id) THEN refus`
- Écart rejoué, même clé et mêmes arguments : `NULL IS DISTINCT FROM NULL` = faux, et le hash est identique → pas de refus, le résultat enregistré est renvoyé avec `doublon_cle_externe = true`.
- Même clé, contenu différent : le hash diffère → refus « Clé externe déjà utilisée avec un contenu différent ».
- Ordre d'exécution : le contrôle de la clé passe avant l'appel métier, donc la relance ne retouche pas les mails déjà écartés.

## Tests après application (transaction annulée, demandes fictives)
1. Écarter 2 mails sans opportunité avec `cle_externe` → exécuté, 2 demandes écartées avec motif, `validated_by`/`validated_at` renseignés, audit avec `email_ids`.
2. Même clé rejouée (nouvel aperçu, mêmes arguments) → même résultat, `doublon_cle_externe = true`, aucune nouvelle écriture.
3. Même clé avec un contenu différent (autre motif) → refus.
4. Écarter 2 autres mails sans `cle_externe` → exécuté.
5. Contrôle de la contrainte : insertion d'une clé sans affaire pour un autre outil → refusée.

Les résultats vous seront rapportés ; pas de publication sans votre accord.
