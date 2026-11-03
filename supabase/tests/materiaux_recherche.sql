-- Test de la recherche matériaux sur le catalogue réel (lecture seule, transaction annulée).
-- Exécuter en tant qu'utilisateur ayant devis.rediger (ex. un admin) : request.jwt.claims.sub = son id.
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"afcb9389-edb4-4ce0-b82c-e302a0aff71a","role":"authenticated"}', true);
DO $t$
DECLARE r record; t0 timestamptz; ms numeric; tete record; ko text := '';
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('mdf 19',            '^mdf',                       19::numeric, NULL),
    ('medium M1 19',      '(mdf|medium).*(m1|ignifug)', 19, NULL),
    ('cp okoume ctbx 10', '(cp|contreplaque).*okoum',   10, NULL),
    ('tube 40x40x2',      '^tube carre',                2,  NULL),
    ('tasseau 22x48',     '^tasseau',                   NULL, '22x48'),
    ('pmma 3 opale',      '(pmma|plexi).*(diffus|dif|opal)', 3, NULL),
    ('dibond 3 blanc',    'dibond.*blanc',              3,  NULL),
    ('moquette rouge',    '^moquette.*rouge',           NULL, NULL),
    ('vis 4x40',          '^vis ',                      NULL, '4x40'),
    ('velours noir',      '^velours.*noir',             NULL, NULL),
    -- sections et épaisseurs (lot 4 corrections) ; aucun 27x40 au catalogue : la section la plus proche doit sortir
    ('tasseau sapin 27x40', '^tasseau.*sapin',          NULL, '(2[5-9]|30)x40|40x(2[5-9]|30)'),
    ('tasseau 27 x 40',   '^tasseau',                   NULL, '(2[5-9]|30)x40|40x(2[5-9]|30)'),
    ('tasseau 40*27',     '^tasseau',                   NULL, '(2[5-9]|30)x40|40x(2[5-9]|30)'),
    ('MDF 19',            '^mdf',                       19, NULL),
    ('MDF 19 mm',         '^mdf',                       19, NULL),
    ('tube 60x2',         '^tube',                      NULL, '60x2'),
    ('PMMA 15',           '(pmma|plexi)',               15, NULL)
  ) v(q, motif, ep, dim) LOOP
    t0 := clock_timestamp();
    SELECT x.* INTO tete FROM materiaux_rechercher(r.q, _limit => 1) x;
    ms := extract(epoch FROM clock_timestamp() - t0) * 1000;
    IF tete.id IS NULL
       OR materiaux_norm(tete.produit) !~ r.motif
       OR (r.ep IS NOT NULL AND tete.epaisseur_mm IS DISTINCT FROM r.ep)
       OR (r.dim IS NOT NULL AND materiaux_norm(concat_ws(' ', tete.produit, tete.format_texte)) !~ r.dim)
       OR ms > 1000 THEN
      ko := ko || format(E'\n  %s → %s (%s ms)', r.q, coalesce(tete.produit, 'aucun'), round(ms));
    END IF;
  END LOOP;
  -- « vis » ne doit plus remonter les plaques Viscom
  IF EXISTS (SELECT 1 FROM materiaux_rechercher('vis 4x40', _limit => 50) x WHERE x.produit ILIKE '%viscom%') THEN
    ko := ko || E'\n  vis 4x40 → Viscom présent'; END IF;
  -- « tube 40x40x2 » : le tube carré passe avant tout tube rond
  IF (SELECT min(rk) FROM (SELECT row_number() OVER () rk, x.* FROM materiaux_rechercher('tube 40x40x2', _limit => 100) x) z WHERE produit ILIKE '%rond%')
     < (SELECT min(rk) FROM (SELECT row_number() OVER () rk, x.* FROM materiaux_rechercher('tube 40x40x2', _limit => 100) x) z WHERE produit ILIKE '%carr%') THEN
    ko := ko || E'\n  tube 40x40x2 → tube rond avant le carré'; END IF;
  -- tarif ancien (Vidal Bois 2024) jamais en tête pour « tasseau 22x48 »
  IF (SELECT fournisseur_etat FROM materiaux_rechercher('tasseau 22x48', _limit => 1)) = 'ancien' THEN
    ko := ko || E'\n  tasseau 22x48 → tarif ancien en tête'; END IF;
  IF ko <> '' THEN RAISE EXCEPTION 'Recherche matériaux KO :%', ko; END IF;
  RAISE NOTICE 'Recherche matériaux : 17 requêtes OK + Viscom / tube rond / tarif ancien OK';
END $t$;
ROLLBACK;
