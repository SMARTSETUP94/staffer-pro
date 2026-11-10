# Renforts sur le planning atelier (réutilise le mécanisme logistique)

## 1. Aujourd'hui : planning logistique
- **Où c'est stocké** : table `assignations` (pas de table dédiée). Une ligne = une personne, un jour, une étape (`etape_logistique_id`), avec `terrain = true`, `source_terrain = 'manuelle'`, `role_terrain` (chef_equipe / equipier), `heures = 0`, `demi_journee = 'JOURNEE'`, heures de l'étape recopiées.
- **Qui** : fonction `planning_terrain_affecter`, autorisée par `planning_terrain_ecrire_autorise` = admin ou logistique (refusé à Claude).
- **Internes vs externes** : soit un salarié actif (`employe_id`), soit un intervenant Dispos actif non relié à un salarié (`dispos_intervenant_id`) — c'est là que vivent intérimaires/extras. Une contrainte impose l'un OU l'autre. Les salariés inactifs sont refusés. Il n'y a pas de « type » Intérim/Sous-traitant stocké (le statut Dispos est vide pour les 28 fiches) ; les sous-traitants (table `sous_traitants`) ne sont pas affectables nominativement.
- **Effet** : la personne apparaît dans Équipes/Personnes, compte dans « staffé vs besoin » de l'étape. Aucun jour-homme en heures (heures = 0), aucune écriture dans les heures saisies.

## 2. Aujourd'hui : planning atelier
- **Charge** : heures par chantier × métier (`affaire_planning_metier.heures_prevues`, sinon heures du devis), réparties sur les jours ouvrés de la barre (fériés FR exclus).
- **Capacité** : uniquement un chiffre fixe par métier, `metiers.capacite_jour` (personnes/jour : Construction 20, Métallerie 6, Peinture 10, Numérique 1, Tapisserie 4, UV 1, Machiniste vide = sans limite). Capacité semaine = personnes × 8 h × jours ouvrés. % et alertes en découlent.
- **Personnes affichées** : aucune. Le planning atelier ne montre pas de noms (choix initial) ; le petit « configurateur nb de personnes » est local à l'appareil et ne compte pas dans la capacité.

## 3. Proposition (la plus simple)
Réutiliser `assignations` comme en logistique, avec un marqueur de pôle :
- **Ajouter un renfort** (bouton « + Renfort » dans le planning atelier) : personne (recherche salarié actif ou intervenant Dispos actif), métier, chantier, du / au (ou un seul jour), type affiché **Renfort** ou **Intérim**. Crée une ligne par jour ouvré.
- **Retirer** : sur un jour ou toute la période.
- **Capacité** : capacité du métier ce jour = `capacite_jour` + nombre de renforts ce jour-là (métier sans limite : affiché, pas de %).
- **Affichage** : section « Renforts » sous la charge hebdo, une ligne par personne avec barre et badge Intérim / Renfort ; dans la cellule de charge, « dont +N renfort(s) ». Lecture seule sur mobile.
- **Droits** : exactement `planning_atelier_ecriture_autorisee` (admin, logistique, chef d'atelier, chef d'équipe), refusé à Claude.
- **N'apparaît pas** dans le planning logistique ni l'ancien planning (filtre sur le pôle).

Hors périmètre : salaires, taux, contrats, heures saisies, réactivation de salariés, modification des données existantes.

## Migration SQL proposée (à valider avant application)
```sql
-- Ajouts seulement ; lignes existantes intactes (colonnes nulles)
ALTER TABLE public.assignations
  ADD COLUMN pole_planning text CHECK (pole_planning IS NULL OR pole_planning = 'atelier'),
  ADD COLUMN type_renfort text CHECK (type_renfort IS NULL OR type_renfort IN ('renfort','interim')),
  ADD CONSTRAINT assignations_atelier_coherent CHECK (
    pole_planning IS NULL OR (metier_id IS NOT NULL AND etape_logistique_id IS NULL
      AND type_renfort IS NOT NULL AND heures = 0));
CREATE UNIQUE INDEX assignations_atelier_unique ON public.assignations
  (affaire_id, metier_id, date, coalesce(employe_id, dispos_intervenant_id))
  WHERE pole_planning = 'atelier';

-- Ajout : une ligne par jour ouvré (fériés exclus), personne active uniquement
CREATE FUNCTION public.planning_atelier_renfort_ajouter(
  _affaire uuid, _metier int, _debut date, _fin date,
  _personne uuid, _origine text, _type text) RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ ...
  -- IF NOT planning_atelier_ecriture_autorisee() THEN RAISE 42501
  -- contrôle employé actif / intervenant Dispos actif non relié (comme logistique)
  -- INSERT ... terrain=true, pole_planning='atelier', heures=0, role_terrain='equipier',
  --        source_terrain='manuelle', phase='fabrication' ON CONFLICT DO NOTHING
$$;

-- Retrait : uniquement des lignes pole_planning='atelier'
CREATE FUNCTION public.planning_atelier_renfort_retirer(
  _affaire uuid, _metier int, _personne uuid, _debut date, _fin date) RETURNS int ...;

REVOKE ALL ON FUNCTION ... FROM public, anon;
GRANT EXECUTE ON FUNCTION ... TO authenticated;
```
Le texte complet des deux fonctions vous sera montré avant application.

## Technique
- Lecture : la fonction serveur du planning atelier renvoie les renforts (prénom + nom, type, métier, chantier, dates), sans téléphone.
- `chargeHebdomadaire` reçoit la capacité ajustée par jour (helper pur testé : renfort un jour férié = 0, métier sans limite = pas de %).
- Vérifier que `planning_terrain_semaine` et les lecteurs logistique filtrent sur `etape_logistique_id` / `pole_planning IS NULL` ; sinon ajouter ce filtre dans la même migration (redéfinition explicite).
- Triggers existants sur `assignations` (historique équipe, notification, chantier ouvert) à contrôler : les notifications d'affectation seraient émises — à neutraliser pour `pole_planning='atelier'` si non voulu.
- Tests : ajout/retrait, capacité +1, droits (chef d'équipe oui, employé non), 390 px ; essais effacés.

## Questions
- Un renfort est-il rattaché à un chantier (proposé, car la base l'exige) ou seulement à un métier ?
- Les personnes ajoutées doivent-elles recevoir une notification ? (proposé : non)
