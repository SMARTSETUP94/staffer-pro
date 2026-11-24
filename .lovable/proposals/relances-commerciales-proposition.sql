-- PROPOSITION — NON APPLIQUÉE. Lot « Relances commerciales ».
-- Additif uniquement : aucune donnée réelle modifiée, aucun paramètre inséré (valeurs par défaut dans le code : 7 / 7 / 14 jours).

-- 1. Types
ALTER TYPE public.opp_action_type ADD VALUE IF NOT EXISTS 'relance_autre';      -- mail=relance_email, tél=relance_tel (existants)
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'relances_semaine';

-- 2. Reports / « ignorer cette semaine » (aucune action fictive dans opportunite_actions)
CREATE TABLE public.relances_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affaire_id uuid NOT NULL REFERENCES public.affaires(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('reporter','ignorer')),
  jusqu_au date NOT NULL,                 -- reporter : date choisie ; ignorer : dimanche de la semaine
  motif text,                             -- obligatoire si ignorer (CHECK ci-dessous)
  auteur_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  annule_le timestamptz,
  CHECK (type <> 'ignorer' OR length(trim(coalesce(motif,''))) > 0)
);
CREATE INDEX ON public.relances_reports (affaire_id, jusqu_au) WHERE annule_le IS NULL;
GRANT SELECT, INSERT, UPDATE ON public.relances_reports TO authenticated;
GRANT ALL ON public.relances_reports TO service_role;
ALTER TABLE public.relances_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY rr_select ON public.relances_reports FOR SELECT TO authenticated
  USING (public.current_user_has_capability('commercial.relances') AND public.user_has_affaire_access(affaire_id));
CREATE POLICY rr_insert ON public.relances_reports FOR INSERT TO authenticated
  WITH CHECK (auteur_id = auth.uid() AND public.current_user_has_capability('commercial.relances')
              AND public.user_can_write_affaire(affaire_id));
CREATE POLICY rr_update ON public.relances_reports FOR UPDATE TO authenticated   -- annulation seulement
  USING (auteur_id = auth.uid()) WITH CHECK (auteur_id = auth.uid());

-- 3. Capacité : admin, commercial ; chef de projet = titulaire d'un rôle projet sur l'affaire (filtré dans le lecteur). Jamais atelier.
INSERT INTO public.capabilities (code, libelle) VALUES ('commercial.relances','Relances commerciales') ON CONFLICT DO NOTHING;
-- + role_capabilities pour admin, commercial, chef_chantier (lecture limitée aux affaires où il tient un rôle projet).

-- 4. Lecteur partagé app + MCP (SECURITY INVOKER, RLS de l'appelant, aucun coût)
--    relances_a_faire(p_charge_id uuid DEFAULT NULL, p_tous boolean DEFAULT false, p_date date DEFAULT current_date)
--    → jsonb [{affaire_id, numero, titre, client, contact{nom,email}, statut, devis_id, devis_numero, version,
--              date_envoi, validite_le, net_ht, motifs[{code,priorite,jours}], derniere_action{type,date,texte},
--              jours_attente, prochaine_action_due_le}]
--    Périmètre : 4 statuts actifs + devis_retenu_pipeline, mêmes CTE que pipeline_indicateurs (0144),
--    défini en relisant le texte actuel en base juste avant application (diff montré).
--    Motifs (priorité) : 1 envoye_sans_reponse (règle a_relancer, N = relance_delai_envoi)
--                        2 action_en_retard (prochaine_action_due_le < p_date, non close)
--                        3 validite_proche (validite ≤ p_date + relance_delai_validite)
--                        4 inactif (a_l_etude/presque_gagne, dernière action ≥ relance_delai_inactivite)
--                        5 sans_prochaine_action
--    Exclus : reports/ignorés actifs (jusqu_au ≥ p_date). p_tous réservé admin (refus sinon).
--    Paramètres lus dans devis_parametres (versionnés, clés relance_*), défaut 7/7/14 si absents.

-- 5. « Relance faite » : app_ajouter_action_opportunite existant (type relance_email|relance_tel|relance_autre,
--    texte = note, prochaine_action_due_le = J+7 modifiable). Ajout des 3 types à sa liste blanche
--    ET à celle de mcp_dispatch_write (règle AGENTS.md), redéfinis depuis le texte actuel en base.

-- 6. Notification du lundi (cloche uniquement, jamais d'e-mail)
--    relances_notifier_semaine() SECURITY DEFINER : pour chaque utilisateur ayant ≥1 relance, une
--    notification 'relances_semaine' (« N relances cette semaine », lien /relances), idempotente par semaine.
--    SELECT cron.schedule('relances-lundi','0 6 * * 1','SELECT public.relances_notifier_semaine()');  -- 1 exécution / semaine
