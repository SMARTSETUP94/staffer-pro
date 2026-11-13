# Lot « Note et commentaires des devis modifiables »

## Analyse revérifiée en base (13/11)
- 66 devis ont une note (max 2 016 car.), 113 commentaires sur 27 devis. Aucune contrainte de taille sur `devis.note_mcp`.
- Écrivent la note aujourd'hui : `devis_mcp_marquer` (tronque à 4 000, **remet à zéro** `modifie_par_humain_le/_id`) et `devis_soumettre` (remplace, tronque à 4 000). Schémas MCP : `note` max 4 000.
- Marque humaine sur `devis` : déclencheur `trg_devis_marquer_humain` (BEFORE UPDATE, humain hors MCP) — une modification de la note à la main pose donc déjà `modifie_par_humain_*` (point 10 confirmé pour la note) ; `trg_devis_lignes_humain` fait de même pour les commentaires.
- Cases : `note_mcp_coches` (jsonb) contient **le texte des points**, pas leur position (1 devis concerné, vérifié). Le repérage est déjà par texte.
- Aucun historique de note/commentaire n'existe.

## Décisions sur les 10 points
1. État : relu ci-dessus, aucun devis réel modifié.
2. Note écrasée par Claude : `devis_soumettre` et `devis_mcp_marquer` **ajoutent** désormais en fin de note (séparateur « — Mise à jour du JJ/MM/AAAA (Claude) — ») au lieu de remplacer, sauf note vide ; tout changement passe aussi par l'historique (déclencheur), donc rien n'est perdu.
3. Taille : 8 000 partout — contrainte `CHECK (char_length(note_mcp) <= 8000) NOT VALID` puis validée (max actuel 2 016), fonctions alignées, schémas MCP `max(8000)`, compteur dans l'éditeur. Un ajout qui dépasserait 8 000 est refusé (pas de troncature silencieuse).
4. Cases : on garde le repérage **par texte de ligne** (déjà en place, robuste aux ajouts). Au remplacement, un déclencheur retire des coches les textes qui n'existent plus dans la note ; à l'ajout, les coches restent valides.
5. `devis_mcp_marquer` ne remet plus à zéro la marque humaine quand le devis existe déjà repris (remise à zéro seulement à la création du brouillon, quand `cree_par_mcp` était faux). Le verrou d'autonomie tient.
6. Nouvelle table `devis_textes_historique`, alimentée uniquement par déclencheurs sur `devis.note_mcp` et `devis_lignes.texte` (type commentaire). Auteur : `auth.uid()` + source `mcp` si `mcp_dispatch_actif()`, sinon `humain`.
7. Nouvelle fonction `devis_texte_modifier` (note ou commentaire), autorisée en `brouillon` et `a_valider`, sans ouvrir le reste de l'en-tête ; `devis_entete_modifier` inchangée.
8. `note` ajoutée à `devis_mcp_appliquer` (branche `devis_modifier_entete`, redéfinie depuis sa version relue) ; restauration = appel de `devis_texte_modifier` avec le texte d'une version → nouvelle entrée.
9. `devis_lire` (MCP) renvoie `note_historique` : 5 dernières versions avec auteur, source, date et extrait de 200 caractères ; texte complet via un nouvel outil lecture seule `devis_note_version(version_id)`.
10. Confirmé (voir analyse).

## Lot 1 — Éditeur
- Bandeau « Note / hypothèses » (`RedactionClaude.tsx`, affiché aussi pour les devis non rédigés par Claude) : bouton « Modifier » → zone multiligne, aperçu markdown simple (listes, gras, rendu sans HTML brut), compteur /8 000, Enregistrer / Annuler.
- Commentaires : édition en place (double-clic ou crayon), Maj+Entrée saut de ligne, Échap annule, enregistrement à la perte du focus, via `devis_texte_modifier`.
- Tiroir « Historique de la note » (et historique par commentaire) : auteur, date, avant/après, « Restaurer cette version ».
- Lecture seule au-delà de « à valider » avec info-bulle « Devis validé : note figée ».

## Lot 2 — MCP
- `devis_modifier_entete.champs.note` : `{ mode: "remplacer" | "ajouter", texte ≤ 8000 }` ; aperçu avant/après sans écriture, confirmation 10 min, mêmes règles brouillon / autonomie (refus si repris par un humain) / conversation.
- `note_mcp_coches` optionnel (liste de textes de points présents dans la note), même circuit.
- `devis_lire` : `note_historique` (extraits) ; nouvel outil lecture seule `devis_note_version`.
- `devis_remplir` inchangé ; ses modifications de commentaires sont tracées par le déclencheur.
- Le contenu de la note reste une donnée : aucun traitement ne s'en sert comme instruction.

## Migration N1 (montrée avant application)
```sql
CREATE TABLE public.devis_textes_historique (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  devis_id uuid NOT NULL REFERENCES public.devis(id) ON DELETE CASCADE,
  ligne_id uuid REFERENCES public.devis_lignes(id) ON DELETE SET NULL,
  cible text NOT NULL CHECK (cible IN ('note','commentaire')),
  avant text, apres text,
  auteur_id uuid, source text NOT NULL CHECK (source IN ('humain','mcp','systeme')),
  restaure_depuis uuid REFERENCES public.devis_textes_historique(id),
  cree_le timestamptz NOT NULL DEFAULT now(),
  CHECK ((cible='note') = (ligne_id IS NULL))
);
CREATE INDEX ON public.devis_textes_historique (devis_id, cree_le DESC);
GRANT SELECT ON public.devis_textes_historique TO authenticated;
GRANT ALL ON public.devis_textes_historique TO service_role;
ALTER TABLE public.devis_textes_historique ENABLE ROW LEVEL SECURITY;
CREATE POLICY hist_lecture ON public.devis_textes_historique FOR SELECT TO authenticated
  USING (public.devis_peut_lire(devis_id));
-- pas de politique d'écriture : seules les fonctions déclencheurs écrivent

ALTER TABLE public.devis ADD CONSTRAINT devis_note_mcp_len CHECK (char_length(note_mcp) <= 8000) NOT VALID;
ALTER TABLE public.devis VALIDATE CONSTRAINT devis_note_mcp_len;

CREATE FUNCTION public.devis_textes_tracer() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_src text := CASE WHEN public.mcp_dispatch_actif() THEN 'mcp' WHEN auth.uid() IS NULL THEN 'systeme' ELSE 'humain' END;
BEGIN
  IF TG_TABLE_NAME='devis' THEN
    IF NEW.note_mcp IS DISTINCT FROM OLD.note_mcp THEN
      INSERT INTO devis_textes_historique(devis_id,cible,avant,apres,auteur_id,source,restaure_depuis)
      VALUES (NEW.id,'note',OLD.note_mcp,NEW.note_mcp,auth.uid(),v_src,NULLIF(current_setting('app.devis_restaure',true),'')::uuid);
    END IF;
  ELSIF NEW.type='commentaire' AND (TG_OP='INSERT' OR NEW.texte IS DISTINCT FROM OLD.texte) THEN
    INSERT INTO devis_textes_historique(devis_id,ligne_id,cible,avant,apres,auteur_id,source,restaure_depuis)
    VALUES (NEW.devis_id,NEW.id,'commentaire',CASE WHEN TG_OP='UPDATE' THEN OLD.texte END,NEW.texte,auth.uid(),v_src,NULLIF(current_setting('app.devis_restaure',true),'')::uuid);
  END IF;
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION public.devis_textes_tracer() FROM PUBLIC, anon;
CREATE TRIGGER trg_devis_note_hist AFTER UPDATE OF note_mcp ON public.devis FOR EACH ROW EXECUTE FUNCTION public.devis_textes_tracer();
CREATE TRIGGER trg_devis_comm_hist AFTER INSERT OR UPDATE OF texte ON public.devis_lignes FOR EACH ROW EXECUTE FUNCTION public.devis_textes_tracer();

-- coches : retirer les points disparus quand la note change
CREATE FUNCTION public.devis_coches_elaguer() RETURNS trigger ... -- BEFORE UPDATE OF note_mcp : garde les coches dont le texte figure encore dans pointsNote(NEW.note_mcp)
REVOKE EXECUTE ... FROM PUBLIC, anon;

CREATE FUNCTION public.devis_texte_modifier(_devis_id uuid, _cible text, _ligne_id uuid, _texte text, _mode text DEFAULT 'remplacer', _restaure_depuis uuid DEFAULT NULL)
 RETURNS jsonb SECURITY DEFINER ...
 -- devis_peut_ecrire ; statut_redaction IN ('brouillon','a_valider') sinon refus « devis figé » ;
 -- sous MCP : brouillon seulement ; _mode ajouter = concat + séparateur daté ; longueur ≤ 8000 ;
 -- commentaire : la ligne doit appartenir au devis et être de type commentaire ;
 -- restauration : version du même devis/cible, pose app.devis_restaure ; set app.devis_rpc.
REVOKE EXECUTE ON FUNCTION public.devis_texte_modifier(...) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_texte_modifier(...) TO authenticated, service_role;

-- redéfinitions explicites depuis leur texte relu (règle : pas de réécriture dynamique)
CREATE OR REPLACE FUNCTION public.devis_mcp_marquer(...)  -- ajout au lieu de remplacer, 8000, marque humaine effacée seulement si cree_par_mcp était faux
CREATE OR REPLACE FUNCTION public.devis_soumettre(...)    -- ajout au lieu de remplacer, 8000
CREATE OR REPLACE FUNCTION public.devis_mcp_appliquer(...) -- branche devis_modifier_entete : champs note / note_mcp_coches → devis_texte_modifier / devis_note_mcp_cocher
-- devis_note_mcp_cocher : ajout contrôle « chaque coche figure dans la note », ≤ 200
```
Le texte complet des corps redéfinis sera joint en différence avant application.

## Fichiers
- `src/components/devis/RedactionClaude.tsx`, nouveaux `NoteEditeur.tsx`, `HistoriqueTextesSheet.tsx`, édition en place dans le composant de ligne commentaire de l'éditeur ; `DevisEditeur.tsx` (montage, droits par statut).
- `src/lib/devis/note.ts` (pur : ajout daté, élagage des coches, limite) + tests.
- `src/lib/mcp/devis.ts` (schémas 8 000, `note`, `note_historique`), `tools/devis_modifier_entete.ts` (description), nouvel outil `tools/devis_note_version.ts`, `index.ts` ; extraction du manifeste.
- `src/lib/devis/AGENTS.md` : une règle sur l'historique par déclencheurs.

## Lot 3 — Essais
Sur un devis d'essai (retiré logiquement ensuite, historique d'essai effacé) : note modifiée à la main puis restaurée ; commentaire édité en place ; MCP note « ajouter » puis « remplacer » (aperçu, confirmation, contenu, historique source mcp) ; refus note sur devis validé et autonomie sur brouillon repris ; non-régression remise/dates/client ; tests purs (ajout daté, élagage, 8 000) ; écrans 390 et 1366 px. Rien publié.

## Point à trancher
Le séparateur d'ajout de `devis_soumettre`/`devis_mcp_marquer` : je propose le même que `devis_modifier_entete` (« — Mise à jour du JJ/MM/AAAA (Claude) — »).
