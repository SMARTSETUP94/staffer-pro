/**
 * Lot L2 — Catalogue typé des 59 capabilities de la matrice définitive.
 *
 * Source de vérité côté front pour les tests d'intégrité (vérifie que la table
 * DB `capabilities` contient bien les mêmes clés) et pour l'auto-complétion
 * dans les futurs gardes (`requireCapability(CAP.SECTION_INBOX)` etc.).
 *
 * Doit rester synchronisé avec la migration de seed `role_capabilities` (L2.2).
 */

export const CAPABILITY_CATALOG = {
  sections: [
    { key: "section.inbox", label: "Aujourd'hui (inbox)" },
    { key: "section.ma_semaine", label: "Ma semaine" },
    { key: "section.tableau_de_bord", label: "Tableau de bord" },
    { key: "section.pipeline_opportunites", label: "Pipeline opportunités" },
    { key: "section.affaires", label: "Affaires" },
    { key: "section.devis", label: "Devis" },
    { key: "section.fabrication", label: "Fabrication" },
    { key: "section.planning_fab", label: "Planning fab" },
    { key: "section.planning_chantier_macro", label: "Planning chantier macro" },
    { key: "section.logistique", label: "Logistique" },
    { key: "section.equipes", label: "Équipes" },
    { key: "section.contrats_rh", label: "Contrats / RH" },
    { key: "section.admin", label: "Admin plateforme" },
  ],
  data: [
    { key: "data.margins", label: "Marges & budget" },
    { key: "data.salaries", label: "Salaires & taux" },
    { key: "data.client_contacts", label: "Contacts client" },
    { key: "data.employee_rh", label: "Fiches RH employés" },
    { key: "data.journal_client", label: "Journal client" },
    { key: "data.audit_logs", label: "Journaux d'audit" },
  ],
  actions: [
    { key: "action.create_devis", label: "Créer un devis" },
    { key: "action.sign_opportunite", label: "Signer une opportunité" },
    { key: "action.create_opportunite", label: "Créer une opportunité" },
    { key: "action.edit_opportunite", label: "Éditer une opportunité" },
    { key: "action.delete_opportunite", label: "Supprimer une opportunité" },
    { key: "action.publish_plan_fab", label: "Publier un plan fab" },
    { key: "action.delete_plan_fab", label: "Supprimer un plan fab" },
    { key: "action.validate_hours", label: "Valider des heures" },
    { key: "action.create_contract", label: "Créer un contrat" },
    { key: "action.sign_contract", label: "Signer un contrat" },
    { key: "action.create_mission_pose", label: "Créer une mission de pose" },
    { key: "action.cancel_mission_pose", label: "Annuler une mission de pose" },
    { key: "action.export_data", label: "Exporter des données" },
    { key: "action.casting.manage", label: "Gérer le casting" },
    { key: "action.objet_equipe.manage", label: "Gérer l'équipe d'un objet" },
    { key: "action.upload_photo", label: "Uploader une photo" },
    { key: "action.delete_photo", label: "Supprimer une photo" },
    { key: "action.archive_affaire", label: "Archiver une affaire" },
    { key: "affaire.team.manage", label: "Gérer l'équipe d'une affaire" },
    { key: "employes.edit", label: "Éditer les fiches employés" },
    { key: "heures.personnelles.saisir", label: "Saisir ses heures personnelles" },
  ],
  admin: [
    { key: "rh.hub.view", label: "Voir le hub RH (alias legacy)" },
    { key: "admin.email_preview.view", label: "Voir l'aperçu emails" },
    { key: "admin.feature_flags.manage", label: "Gérer les feature flags" },
    { key: "admin.feedback.view", label: "Voir les feedbacks" },
    { key: "admin.permissions.manage", label: "Gérer la matrice de permissions" },
    { key: "admin.audit", label: "Voir l'audit admin" },
    { key: "heures.audit", label: "Auditer les heures" },
  ],
  affaire: [
    { key: "affaire.equipe.view", label: "Voir l'équipe d'une affaire" },
    { key: "objet.view", label: "Voir la fiche d'un objet" },
    { key: "contrats.view_own", label: "Voir ses propres contrats" },
  ],
  inbox: [
    { key: "inbox.mission_pose", label: "Missions de pose" },
    { key: "inbox.validation_heures", label: "Validation des heures" },
    { key: "inbox.be_attente", label: "BE en attente" },
    { key: "inbox.devis_brouillon", label: "Devis brouillons" },
    { key: "inbox.opp_action", label: "Opportunités à actionner" },
    { key: "inbox.echantillons", label: "Échantillons à traiter" },
    { key: "inbox.plan_lacune", label: "Lacunes de planning" },
    { key: "inbox.heures_saisir", label: "Heures à saisir" },
    { key: "inbox.rh_contrats", label: "Contrats RH à traiter" },
    { key: "inbox.alertes_equipe", label: "Alertes équipe" },
  ],
  mobile: [
    { key: "mobile.mes_missions", label: "Mobile — Mes missions" },
    { key: "mobile.equipe_chantiers", label: "Mobile — Équipe & chantiers" },
    { key: "mobile.fabrication_atelier", label: "Mobile — Atelier" },
    { key: "mobile.staffer_rapide", label: "Mobile — Staffer rapide" },
    { key: "mobile.signaler_probleme", label: "Mobile — Signaler un problème" },
  ],
  casting: [
    { key: "casting.view_phase_commercial", label: "Voir casting — phase commercial" },
    { key: "casting.view_phase_fabrication", label: "Voir casting — phase fabrication" },
    { key: "casting.view_phase_logistique", label: "Voir casting — phase logistique" },
    { key: "casting.view_phase_montage", label: "Voir casting — phase montage" },
    { key: "casting.view_phase_demontage", label: "Voir casting — phase démontage" },
    { key: "casting.edit_phase_commercial", label: "Éditer casting — phase commercial" },
    { key: "casting.edit_phase_fabrication", label: "Éditer casting — phase fabrication" },
    { key: "casting.edit_phase_logistique", label: "Éditer casting — phase logistique" },
    { key: "casting.edit_phase_montage", label: "Éditer casting — phase montage" },
    { key: "casting.edit_phase_demontage", label: "Éditer casting — phase démontage" },
  ],
} as const;

type Group = keyof typeof CAPABILITY_CATALOG;
export type CapabilityKey =
  (typeof CAPABILITY_CATALOG)[Group][number]["key"];

export const ALL_CAPABILITY_KEYS: readonly CapabilityKey[] = (
  Object.values(CAPABILITY_CATALOG).flat() as ReadonlyArray<{ key: CapabilityKey }>
).map((c) => c.key);

export const CAPABILITY_CATEGORY_LABELS: Record<Group, string> = {
  sections: "Sections (navigation)",
  data: "Données sensibles",
  actions: "Actions",
  admin: "Administration",
  affaire: "Affaires & objets",
  inbox: "Inbox (sources d'alerte)",
  mobile: "Mobile",
  casting: "Casting par phase",
};
