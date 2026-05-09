-- Drop ancien dashboard_tips (créé au tour précédent, remplacé par content_astuces)
DROP TABLE IF EXISTS public.dashboard_tips CASCADE;

-- ========================
-- content_astuces
-- ========================
CREATE TABLE public.content_astuces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  texte text NOT NULL,
  categorie text NOT NULL DEFAULT 'process'
    CHECK (categorie IN ('atelier','process','securite','livraison','RH')),
  auteur text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.content_astuces ENABLE ROW LEVEL SECURITY;

CREATE POLICY content_astuces_select_authenticated
  ON public.content_astuces FOR SELECT TO authenticated USING (true);

CREATE POLICY content_astuces_admin_modify
  ON public.content_astuces FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE TRIGGER content_astuces_set_updated_at
  BEFORE UPDATE ON public.content_astuces
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_content_astuces_active_cat
  ON public.content_astuces(active, categorie);

-- ========================
-- content_quiz
-- ========================
CREATE TABLE public.content_quiz (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  reponses jsonb NOT NULL,
  bonne_reponse_index int NOT NULL CHECK (bonne_reponse_index BETWEEN 0 AND 3),
  explication text,
  categorie text NOT NULL DEFAULT 'culture-G'
    CHECK (categorie IN ('sceno','menuiserie','securite','event','culture-G')),
  difficulte text NOT NULL DEFAULT 'moyen'
    CHECK (difficulte IN ('facile','moyen','difficile')),
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Validation que reponses est un array de 4 strings (trigger pour rester flexible)
CREATE OR REPLACE FUNCTION public.validate_content_quiz_reponses()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF jsonb_typeof(NEW.reponses) <> 'array' THEN
    RAISE EXCEPTION 'reponses doit être un array JSON';
  END IF;
  IF jsonb_array_length(NEW.reponses) <> 4 THEN
    RAISE EXCEPTION 'reponses doit contenir exactement 4 éléments';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER content_quiz_validate_reponses
  BEFORE INSERT OR UPDATE ON public.content_quiz
  FOR EACH ROW EXECUTE FUNCTION public.validate_content_quiz_reponses();

CREATE TRIGGER content_quiz_set_updated_at
  BEFORE UPDATE ON public.content_quiz
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.content_quiz ENABLE ROW LEVEL SECURITY;

CREATE POLICY content_quiz_select_authenticated
  ON public.content_quiz FOR SELECT TO authenticated USING (true);

CREATE POLICY content_quiz_admin_modify
  ON public.content_quiz FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE INDEX idx_content_quiz_active_cat
  ON public.content_quiz(active, categorie);

-- ========================
-- SEED 15 astuces (3 par catégorie)
-- ========================
INSERT INTO public.content_astuces (texte, categorie, auteur) VALUES
-- atelier
('Toujours débrancher la défonceuse avant de changer la fraise — 2 secondes qui sauvent un doigt.', 'atelier', 'Gabin'),
('Sur la CNC, vérifier le zéro Z avant chaque nouveau panneau : 80% des casses fraise viennent de là.', 'atelier', NULL),
('Une lame de scie chaude = lame qui dévie. Pause 10 min après 30 coupes longues.', 'atelier', NULL),
-- process
('Une astuce ouverte sans devis rattaché = facturation impossible. Toujours vérifier le code D-XXXX.', 'process', NULL),
('Saisir ses heures le soir même prend 30 secondes. Le vendredi pour 5 jours, c''est 15 minutes de douleur.', 'process', 'Gabin'),
('Avant de fermer un objet en fab, photo du résultat dans le commentaire de l''étape : tracé qualité.', 'process', NULL),
-- securite
('Casque + lunettes + chaussures S3 : non négociable atelier, même pour "juste une coupe rapide".', 'securite', NULL),
('Un chariot non rangé = un chariot qui blesse. Fin de journée, tout retourne à sa place.', 'securite', NULL),
('Travail en hauteur > 1m : harnais OU nacelle. Jamais d''échelle posée sur un truc bancal.', 'securite', 'Gabin'),
-- livraison
('Sangler 4 points minimum sur un objet > 50kg, même pour un trajet de 2km.', 'livraison', NULL),
('Anticiper les hauteurs de portes au moment du chargement : un objet trop haut = remontage sur place.', 'livraison', NULL),
('Toujours emporter visserie + colle + scotch noir dans le camion. Le chantier improvise toujours.', 'livraison', 'Gabin'),
-- RH
('Une absence imprévue se signale au chef de chantier AVANT 8h, pas via WhatsApp à 10h30.', 'RH', NULL),
('Les congés se posent dans l''app, pas par mail. Sinon ils ne sont pas comptabilisés en paie.', 'RH', NULL),
('Pause déjeuner : 30 min mini, sortir de l''atelier. Bosser en mangeant n''est pas une preuve d''engagement.', 'RH', 'Gabin');

-- ========================
-- SEED 20 quiz (4 par catégorie, mix difficultés)
-- ========================
INSERT INTO public.content_quiz (question, reponses, bonne_reponse_index, explication, categorie, difficulte) VALUES
-- sceno
('Quel est le rôle principal d''un practicable en scéno ?', '["Décor visible","Plateforme technique pour rehausser une zone","Élément acoustique","Cache régie"]'::jsonb, 1, 'Le practicable sert de plateforme modulable pour rehausser comédiens, mobilier ou décor.', 'sceno', 'facile'),
('Combien de cm fait un module standard de gradin scéno français ?', '["40 cm","60 cm","80 cm","100 cm"]'::jsonb, 1, '60 cm de hauteur de marche est le standard utilisé pour les gradins événementiels.', 'sceno', 'moyen'),
('Le terme "blackout" en scéno désigne :', '["Une panne électrique","Une coupure totale lumière voulue","Un décor noir","Un type de moquette"]'::jsonb, 1, 'Le blackout est un noir total volontaire utilisé pour transitions ou changements de décor.', 'sceno', 'facile'),
('Quelle est la classification feu minimum d''un tissu de scéno ERP ?', '["M0","M1","M2","NF EN 13501"]'::jsonb, 1, 'M1 (non inflammable) est requis pour tissus tendus en ERP. M0 est incombustible mais réservé.', 'sceno', 'difficile'),
-- menuiserie
('Quelle essence de bois est la plus stable pour un objet exposé en extérieur sans traitement ?', '["Pin","Chêne","Mélèze","Hêtre"]'::jsonb, 2, 'Le mélèze contient des résines naturelles qui le rendent durable sans traitement.', 'menuiserie', 'moyen'),
('Quel est l''angle standard d''une coupe d''onglet pour assemblage 90° ?', '["30°","45°","60°","90°"]'::jsonb, 1, '45° + 45° = 90°, c''est la coupe d''onglet classique pour cadres et caissons.', 'menuiserie', 'facile'),
('Que signifie MDF ?', '["Medium Density Fiberboard","Massif Découpé Fini","Multi-Densité Fixé","Médium Densité France"]'::jsonb, 0, 'MDF = panneau de fibres à densité moyenne, très utilisé pour décors peints.', 'menuiserie', 'facile'),
('Quel taux d''humidité est recommandé pour du bois avant collage ?', '["2-4%","8-12%","15-20%","25-30%"]'::jsonb, 1, 'Entre 8 et 12% : trop sec → fissures, trop humide → décollement.', 'menuiserie', 'difficile'),
-- securite
('Que signifie EPI ?', '["Équipement de Protection Individuelle","Élément Préventif Important","Équipement de Première Intervention","Engin de Protection Industriel"]'::jsonb, 0, 'EPI : casque, lunettes, gants, chaussures de sécurité, harnais…', 'securite', 'facile'),
('À partir de quelle hauteur le port du harnais devient-il obligatoire en France ?', '["1 m","2 m","3 m","5 m"]'::jsonb, 1, 'Au-delà de 2m, le harnais ou un dispositif équivalent est obligatoire (Code du travail).', 'securite', 'moyen'),
('Quelle est la couleur normalisée d''un extincteur eau pulvérisée ?', '["Rouge","Bleu","Jaune","Vert"]'::jsonb, 0, 'Tous les extincteurs sont rouges en France ; la pastille de couleur indique l''agent.', 'securite', 'facile'),
('Quelle classe d''extincteur traite un feu d''origine électrique sous tension ?', '["Classe A","Classe B","Classe C","Pas de classe spécifique"]'::jsonb, 3, 'Pas de classe dédiée : on utilise CO2 ou poudre, jamais d''eau.', 'securite', 'difficile'),
-- event
('Que signifie "load-in" sur un projet event ?', '["Vente de billets","Phase de chargement / installation","Démontage","Test son"]'::jsonb, 1, 'Load-in = arrivée + installation du matériel sur site. Inverse du load-out.', 'event', 'facile'),
('Quel est le poids maximum classique au m² d''un plancher de salle d''expo ?', '["100 kg","250 kg","500 kg","1000 kg"]'::jsonb, 2, '500 kg/m² est la charge admissible standard ; vérifier au cas par cas.', 'event', 'moyen'),
('Le "rider technique" d''un artiste, c''est :', '["Sa fiche de paie","Son cahier des charges technique","Son contrat de cession","La playlist"]'::jsonb, 1, 'Document listant son matériel scénique, lumière, son et besoins logistiques.', 'event', 'facile'),
('À quelle norme doit répondre un ERP type L (salle de spectacle) en France ?', '["NF C 15-100","ERP type L règlement de sécurité","ISO 9001","HQE"]'::jsonb, 1, 'Règlement de sécurité ERP type L : règles spécifiques aux salles d''audition et spectacle.', 'event', 'difficile'),
-- culture-G
('Quel architecte a conçu le Centre Pompidou avec Renzo Piano ?', '["Le Corbusier","Richard Rogers","Jean Nouvel","Frank Gehry"]'::jsonb, 1, 'Richard Rogers et Renzo Piano, livré en 1977, archi high-tech avec tuyaux apparents.', 'culture-G', 'moyen'),
('La couleur "International Klein Blue" est l''œuvre de :', '["Pablo Picasso","Yves Klein","Jean Dubuffet","Pierre Soulages"]'::jsonb, 1, 'Yves Klein a déposé en 1960 ce bleu outremer ultra-saturé (IKB).', 'culture-G', 'facile'),
('Quelle est la hauteur du plafond de la nef de Notre-Dame de Paris ?', '["20 m","33 m","45 m","60 m"]'::jsonb, 1, '33 m sous voûte centrale — typique du gothique parisien du XIIe siècle.', 'culture-G', 'difficile'),
('Le mouvement "Bauhaus" est né dans quel pays ?', '["France","Italie","Allemagne","Pays-Bas"]'::jsonb, 2, 'Fondé par Walter Gropius à Weimar en 1919, école d''art et design pluridisciplinaire.', 'culture-G', 'moyen');