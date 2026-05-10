
-- 1) Table parametres_entreprise (singleton)
CREATE TABLE IF NOT EXISTS public.parametres_entreprise (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  raison_sociale text NOT NULL,
  marque_commerciale text NOT NULL,
  adresse_ligne1 text NOT NULL,
  code_postal text NOT NULL,
  ville text NOT NULL,
  siret text NOT NULL,
  naf text NOT NULL,
  label text NOT NULL,
  convention_collective_nom text NOT NULL,
  convention_collective_brochure text NOT NULL,
  representant_legal_nom text NOT NULL,
  representant_legal_titre text NOT NULL,
  urssaf text NOT NULL,
  caisse_retraite text NOT NULL,
  medecine_travail text NOT NULL,
  caisse_conges_spectacles text NOT NULL,
  lieu_signature_defaut text NOT NULL,
  employeur_email_contact text NOT NULL DEFAULT 'contact@setup.paris',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT singleton_must_be_true CHECK (singleton = true)
);

ALTER TABLE public.parametres_entreprise ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parametres_entreprise_select_authenticated ON public.parametres_entreprise;
CREATE POLICY parametres_entreprise_select_authenticated
  ON public.parametres_entreprise FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS parametres_entreprise_admin_modify ON public.parametres_entreprise;
CREATE POLICY parametres_entreprise_admin_modify
  ON public.parametres_entreprise FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

DROP TRIGGER IF EXISTS trg_parametres_entreprise_updated_at ON public.parametres_entreprise;
CREATE TRIGGER trg_parametres_entreprise_updated_at
  BEFORE UPDATE ON public.parametres_entreprise
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed singleton
INSERT INTO public.parametres_entreprise (
  singleton, raison_sociale, marque_commerciale, adresse_ligne1, code_postal, ville,
  siret, naf, label, convention_collective_nom, convention_collective_brochure,
  representant_legal_nom, representant_legal_titre, urssaf, caisse_retraite,
  medecine_travail, caisse_conges_spectacles, lieu_signature_defaut, employeur_email_contact
) VALUES (
  true,
  'SMART RESTRUCTURING',
  'SET UP PARIS',
  '8, avenue du Président Salvador Allende',
  '94405',
  'Vitry sur Seine Cedex',
  '95311689400015',
  '9002Z',
  '425 « Prestataire de service du spectacle vivant »',
  'Convention collective des entreprises techniques au service de la création et de l''évènement',
  '3365',
  'Gabin CHAUSSEGROS',
  'Directeur Général',
  'URSSAF de Créteil, 3 rue des Archives 94046 CRETEIL CEDEX',
  'AUDIENS — 74, rue Jean BLEUZEN 92170 Vanves',
  'CMB — 26 rue Notre-Dame des Victoires - 75086 Paris Cedex 02',
  'LES CONGES SPECTACLES — 7 rue du Helder, 75440 PARIS Cedex 09',
  'Vitry sur Seine',
  'contact@setup.paris'
) ON CONFLICT (singleton) DO NOTHING;

-- 2) Remplacement contenu v1 active par texte officiel CDDU
UPDATE public.contrat_templates
SET
  nom = 'Contrat CDDU Technicien du spectacle — v1',
  notes = 'Texte officiel SMART RESTRUCTURING / SET UP PARIS — CDDU Technicien du spectacle (page 1 contrat + page 2 CGE).',
  contenu_json = NULL,
  contenu_html = $HTML$
<h1 style="text-align:center;font-size:16pt;">CONTRAT DE TRAVAIL À DURÉE DÉTERMINÉE D'USAGE : TECHNICIEN DU SPECTACLE</h1>

<table style="width:100%;border-collapse:collapse;margin-top:12pt;">
  <tr>
    <td style="vertical-align:top;width:50%;padding-right:12pt;">
      <p><strong>SMART RESTRUCTURING / SET UP</strong><br/>
      8 avenue du Président Salvador Allende, 94405 Vitry sur Seine Cedex<br/>
      SIRET 95311689400015 — NAF 9002Z<br/>
      LABEL N° 425 « Prestataire de service du spectacle vivant »</p>
      <p><em>Ci-après dénommé l'employeur d'une part</em></p>
    </td>
    <td style="vertical-align:top;width:50%;padding-left:12pt;border-left:1px solid #999;">
      <p>{{employe_civilite}} <strong>{{employe_nom}} {{employe_prenom}}</strong><br/>
      {{employe_adresse_ligne1}}<br/>
      {{employe_code_postal}} {{employe_ville}}</p>
      <p><em>Ci-après dénommé le salarié d'autre part</em></p>
    </td>
  </tr>
</table>

<p style="margin-top:14pt;">Le présent engagement constitue un contrat de travail à durée déterminée d'usage constant conclu dans le cadre des dispositions des articles L 1242-2, D. 1242-1 et D. 1243-1 du Code du Travail (Secteur d'activité dans lequel il est d'usage constant de ne pas recourir à des contrats à durée indéterminée à raison de la nature de l'activité exercée) et de l'accord interbranche du 12 octobre 1998. Il est régi par les dispositions de la Convention collective des entreprises techniques au service de la création et de l'évènement (brochure n° 3365), dont un exemplaire est tenu à sa disposition au siège de l'entreprise et peut par ailleurs être téléchargé notamment sur le site Légifrance.fr, et par son Règlement intérieur.</p>

<h2 style="font-size:13pt;">Engagement et objet</h2>
<p>Sous réserve de la présentation d'une attestation d'aptitude au travail à jour délivrée par le Centre Médical de la Bourse (26 rue Notre-Dame des Victoires - 75086 Paris Cedex 02) ou, à défaut, de la visite médicale d'embauche, l'employeur engage le Salarié en qualité de <strong>{{poste}}</strong> pour la fabrication du (des) décors de (des) l'émission(s) dénommé(s) à ce jour <strong>{{nom_emission}}</strong>, catégorie <strong>{{categorie}}</strong>.</p>

<h2 style="font-size:13pt;">Durée du contrat</h2>
<p>Le contrat est conclu à durée déterminée pour une durée minimale de <strong>{{duree_minimale_texte}}</strong>. Il prendra effet le <strong>{{date_debut}}</strong> et prendra fin le <strong>{{date_fin}}</strong>.</p>

<h2 style="font-size:13pt;">Durée du Travail</h2>
<p>Elle s'entend sur la base d'une durée hebdomadaire de <strong>{{duree_hebdomadaire_heures}}</strong> heures. Il est précisé que le présent contrat ne peut avoir pour effet de porter la durée de travail du salarié au-delà des temps de travail maxima prévus à l'article 5 de la convention collective précitée.</p>

<h2 style="font-size:13pt;">Rémunération</h2>
<p>Le Salarié percevra une rémunération brute calculée sur la base de <strong>{{taux_horaire_brut}}</strong> de l'heure.</p>

<h2 style="font-size:13pt;">Règlement intérieur</h2>
<p>Le Salarié s'engage à se conformer au règlement intérieur de l'entreprise et aux instructions de la direction concernant les conditions d'exécution du travail. De même, il devra respecter les règlements intérieurs des établissements dans lesquels il sera amené à travailler pour le compte de l'employeur. Le Salarié est informé que l'entreprise est équipée, pour des raisons de sécurité et protection de ses locaux et matériels, d'un dispositif de vidéosurveillance dont les enregistrements pourraient, le cas échéant, être utilisés dans le cadre d'une éventuelle procédure disciplinaire.</p>

<h2 style="font-size:13pt;">Cotisations</h2>
<p>L'employeur cotisera aux différents organismes sociaux dont la caisse de retraite AUDIENS - 74, rue Jean BLEUZEN 92170 Vanves et la caisse des congés spectacles.</p>

<h2 style="font-size:13pt;">Modification du contrat</h2>
<p>Le présent contrat peut être modifié par avenant, soumis à l'accord des deux parties.</p>

<h2 style="font-size:13pt;">Conditions de réception</h2>
<p>Sauf dérogation expresse donnée par toute personne habilitée à représenter Set Up, la présente offre d'emploi sera considérée comme nulle et non avenue à défaut de réception par l'employeur, soit 1ex de son exemplaire signé par le salarié au plus tard 2 jours ouvrés avant la date de prise d'effet prévue, ou, si la présente offre a été effectuée dans ce délai, 2ex d'un mail du salarié adressé à <strong>contact@setup.paris</strong> confirmant la bonne réception de la présente et son acceptation au plus tard la veille du jour prévu pour la prise d'effet du contrat.</p>

<p style="margin-top:12pt;"><strong>Fait en deux exemplaires à {{lieu_signature}}, le {{date_signature}}</strong></p>

<table style="width:100%;border-collapse:collapse;margin-top:12pt;">
  <tr>
    <td style="vertical-align:top;width:50%;padding-right:12pt;border:1px solid #999;padding:10pt;">
      <p><strong>Le (la) salarié(e)</strong><br/>{{employe_nom}} {{employe_prenom}}</p>
      <p>[[ZONE_SIGNATURE_EMPLOYE_PAGE_1]]</p>
    </td>
    <td style="vertical-align:top;width:50%;padding-left:12pt;border:1px solid #999;padding:10pt;">
      <p><strong>Pour SMART RESTRUCTURING / SET UP</strong><br/>Monsieur Gabin CHAUSSEGROS<br/>Directeur Général</p>
      <p>[[ZONE_SIGNATURE_EMPLOYEUR_PAGE_1]]</p>
    </td>
  </tr>
</table>

<p style="text-align:center;margin-top:16pt;font-style:italic;">TSVP — Merci de signer les Conditions Générales d'Engagement du Salarié au dos et de mentionner Lu et Approuvé.</p>

<div style="page-break-before:always;"></div>

<h1 style="text-align:center;font-size:16pt;">CONDITIONS GÉNÉRALES D'ENGAGEMENT DU SALARIÉ</h1>

<p>Le présent engagement constitue un contrat de travail à durée et objet déterminés dit d'usage. Il n'est donc en aucun cas renouvelable par tacite reconduction et cesse de plein droit au terme fixé pour son expiration sans préavis ni indemnité. Une déclaration unique d'embauche sera effectuée en temps utile auprès de l'URSSAF de Créteil, 3 rue des Archives 94046 CRETEIL CEDEX, sur laquelle le Salarié pourra exercer le droit d'accès et de rectification que lui confère la Loi du 6 janvier 1978.</p>

<p>Le Salarié est tenu de se conformer strictement aux instructions de la Société ou de ses représentants en ce qui concerne le lieu, l'horaire, le programme et les conditions de travail. Compte tenu du contexte professionnel particulier du secteur d'activité de la Société et des impératifs de ponctualité liés notamment au tournage, toute absence injustifiée ou retard significatif pourra être constitutif d'une faute grave, pouvant engendrer la rupture anticipée du présent contrat.</p>

<p>En cas de maladie, le Salarié doit prévenir immédiatement le service du personnel par téléphone ou à défaut de toute personne habilitée puis produire un certificat médical dans les 48 heures. À défaut, l'absence sera considérée comme injustifiée. La société se réserve le droit de faire effectuer un contrôle médical.</p>

<p>Le Salarié déclare connaître le règlement intérieur en vigueur dans la Société et s'engage à en respecter les clauses. Le Salarié déclare qu'il est et restera libre de tout engagement, soit à l'égard de la Société, soit à l'égard de tiers, qui serait incompatible avec l'accomplissement des obligations résultant du présent contrat.</p>

<p>Le Salarié reconnaît avoir été informé qu'il n'a et ne doit effectuer aucune heure supplémentaire sans avoir obtenu l'accord préalable et écrit de la Société ou d'un de ses représentants, sauf circonstance exceptionnelle, et que toute heure supplémentaire le cas échéant effectuée devra être immédiatement déclarée et compensée. Le Salarié ayant plusieurs employeurs s'oblige à respecter les durées maximales de travail et de repos quotidiens et hebdomadaires.</p>

<p>Sauf autorisation préalable de la Société, le Salarié ne peut utiliser ou laisser utiliser à des fins de publicité personnelle ou commerciale sa collaboration avec la Société. Le Salarié reconnaît que la prestation qui lui est demandée ne comporte aucune activité de création ouvrant droit à un quelconque droit d'auteur et reconnaît à la Société tous droits de propriété sur le résultat de sa prestation emportant, sans limitation de durée et pour tout pays et notamment tout droit de cession, fixation, reproduction, représentation, diffusion, exploitation commerciale ou non, par tous les moyens et procédés connus ou inconnus à ce jour. Il garantit que les travaux ou prestations effectués par lui ne porteront atteinte en aucune manière à de quelconques droits privatifs détenus par des tiers et notamment aux droits des auteurs des œuvres protégées.</p>

<p>Le Salarié s'engage formellement à observer la discrétion la plus stricte sur tous documents et informations se rapportant aux moyens, activités ou partenaires de la Société (notamment croquis, dessins, projets, notes, maquettes ou enregistrements), en intégralité ou en extraits, auxquels il aura accès à l'occasion ou dans le cadre de ses fonctions, ce tant pendant l'exécution du présent contrat qu'après sa cessation.</p>

<p>Le Salarié s'engage à restituer à la Société dès que la demande lui en sera faite et au plus tard spontanément le jour de la cessation de ses fonctions dans la Société, quelle qu'en soit la cause, tout bien ou matériel mis à sa disposition par la Société, ainsi que tout document écrit ou enregistré contenant des informations confidentielles telles que définies ci-dessus, et à n'en conserver aucune copie ou enregistrement sur quelque support que ce soit.</p>

<h2 style="font-size:13pt;">Affiliations</h2>
<ul>
  <li><strong>AUDIENS</strong> — 74 rue Bleuzen, 92177 Vanves Cedex — Caisse de retraite complémentaire (cadre et non cadre) et de Prévoyance (cadre)</li>
  <li><strong>LES CONGES SPECTACLES</strong> — 7 rue du Helder, 75440 PARIS Cedex 09</li>
  <li><strong>CMB</strong> — 26 rue Notre-Dame des Victoires - 75086 Paris Cedex 02</li>
</ul>

<h2 style="font-size:13pt;">Périodicité et conditions</h2>
<p>La périodicité du paiement des salaires est mensuelle. Le présent contrat est conclu, sous réserve que le Salarié :</p>
<ul>
  <li>Remplisse une fiche de renseignements si cette formalité n'a jamais été accomplie ou en cas de changement de situation ;</li>
  <li>Soit en possession des autorisations professionnelles nécessaires à l'exercice de son emploi et les communique à son employeur sur simple demande ;</li>
  <li>Soit en possession d'une carte de contrôle médical à jour et ne comportant aucune opposition de la médecine du travail. En sus, si la Société jugeait nécessaire de prendre une assurance complémentaire à son bénéfice ou à celui du Salarié, ce dernier s'engage à se prêter à tous les examens médicaux éventuellement exigés par les compagnies d'assurances ;</li>
  <li>Soit en règle vis-à-vis des différents organismes sociaux auxquels il est tenu d'adhérer du fait de sa profession. Une information incomplète ou inexacte serait de nature à justifier la rupture anticipée du présent contrat ;</li>
  <li>En cas d'utilisation d'un véhicule personnel, ait souscrit une assurance permettant l'utilisation de son véhicule personnel à des fins professionnelles.</li>
</ul>

<h2 style="font-size:13pt;">HYGIÈNE ET SÉCURITÉ</h2>
<p>Le Salarié s'engage à respecter l'ensemble des règles d'hygiène et de sécurité et notamment à porter les équipements de sécurité requis selon sa mission tenus à sa disposition (lunettes de protection, chaussures, protections d'oreille, masques anti-poussières, etc.) et à ne pas porter atteinte ou désactiver les systèmes de protection : il ne pourra utiliser des équipements personnels que pour autant que ceux-ci sont homologués et en bon état.</p>
<p>L'utilisation de téléphones portables et/ou le port de casques musicaux sont interdits durant les heures de travail en raison des conséquences dangereuses (isolement sonore, perte d'attention, perte d'équilibre…) qu'ils peuvent engendrer pour le Salarié lui-même et/ou d'autres personnels.</p>
<p>Conformément au Code du travail, à la loi Évin et au Règlement intérieur, fumer est strictement interdit dans les locaux de l'entreprise ainsi que dans ceux des clients de la Société. L'introduction d'alcool ou de substances illicites est pareillement interdite. Toute violation ou refus de se conformer aux règles précitées et à toutes autres directives émanant d'un responsable de la Société pourra entraîner la rupture anticipée du contrat pour faute grave.</p>

<h2 style="font-size:13pt;">Dispositions sanitaires (COVID-19)</h2>
<p>(1) Dans le cadre de la gestion de la crise sanitaire du COVID-19 (ex 2019-nCoV) la Société a mis en place un ensemble de mesures pour protéger la santé de chaque personne intervenant sur le tournage des émissions conformément aux recommandations gouvernementales. L'ensemble des mesures mises en place par la Société seront rappelées sur place, y compris par voie d'affichage approprié le cas échéant.</p>
<p>(2) Compte tenu du contexte sanitaire actuel, j'ai donc pleinement conscience que certaines mesures d'hygiène, de prévention et de protection sont requises afin de préserver la santé de chacun et déclare :</p>
<ul>
  <li>Avoir été informé(e) des mesures mises en place à cet effet par la Société et obtenu toutes précisions souhaitées sur celles-ci ;</li>
  <li>Avoir été informé(e) et sensibilisé(e) de la nécessité de respecter strictement les gestes barrières et toutes les mesures d'hygiène, de prévention et de protection décidées par la Société dans le cadre de l'Émission ;</li>
  <li>Ne pas ressentir et ne pas avoir ressenti au cours des 15 (quinze) jours précédents aucun des symptômes du COVID-19 tels qu'ils ressortent du test proposé sur le site https://maladiecoronavirus.fr/ ou via le service Allo COVID au 0806 800 540 ;</li>
  <li>M'engager, en cas de suspicion d'infection, à me rendre chez mon médecin traitant et/ou à effectuer un test et à prévenir la Société en cas de contamination avérée ;</li>
  <li>Ne pas avoir été, à ma connaissance, en contact avec une personne atteinte du COVID-19 ou en présentant les symptômes.</li>
</ul>

<p style="margin-top:18pt;"><strong>Lu et approuvé :</strong> ____________________________</p>
<p>[[ZONE_LU_APPROUVE_PAGE_2]]</p>
$HTML$,
  updated_at = now()
WHERE actif = true AND version_int = 1;
