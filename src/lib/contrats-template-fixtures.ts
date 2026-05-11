/**
 * v0.42.2 — Fixtures de test pour la validation E2E du template contrat.
 *
 * 5 cas critiques couvrant les zones à risque détectées en v0.42.1 :
 *  A. Poste renseigné (Constructeur) sur chantier court
 *  B. Fallback poste null → "Technicien de plateau"
 *  C. Adresse longue (risque débordement)
 *  D. Libellé chantier long (risque césure H1)
 *  E. Cadre (vs Non cadre) — vérifier rendu placeholder catégorie pro
 */
import type { ContratPdfData } from "@/lib/contrats-pdf";

export interface ContratTestCase {
  id: string;
  label: string;
  description: string;
  data: ContratPdfData;
}

const TEMPLATE_PLACEHOLDER = ""; // sera injecté par le caller (template HTML actif)

const baseFixture = (overrides: Partial<ContratPdfData>): ContratPdfData => ({
  numero_contrat: "TEST0001",
  employe_nom: "DUPONT",
  employe_prenom: "Jean",
  employe_adresse: "12 rue de la République, 75011 Paris",
  employe_email: "jean.dupont@example.com",
  chantier_nom: "Chantier test",
  chantier_numero: "9999",
  chantier_lieu: "Paris",
  date_debut: "2026-05-15",
  date_fin: "2026-05-20",
  heures_estimees: 40,
  taux_horaire_brut: 17,
  forfait: false,
  statut_contrat: "CDDU intermittent",
  signature_employe_url: null,
  signature_employeur_url: null,
  signed_at_employe: null,
  signed_at_employeur: null,
  template_html: TEMPLATE_PLACEHOLDER,
  poste: null,
  ...overrides,
});

export const CONTRAT_TEST_FIXTURES: ContratTestCase[] = [
  {
    id: "a-poste-renseigne",
    label: "A · Poste renseigné (Constructeur)",
    description: "SAVOYEN Hadrien · Constructeur · chantier 9231 court — cas nominal",
    data: baseFixture({
      numero_contrat: "FABAFCD3",
      employe_nom: "SAVOYEN",
      employe_prenom: "Hadrien",
      employe_adresse: "40 Rue Etienne Dolet, 75020 Paris",
      employe_email: "hadrien@example.com",
      chantier_numero: "9231",
      chantier_nom: "Atelier mandarine M&Ms",
      poste: "Constructeur",
      statut_contrat: "CDDU intermittent",
    }),
  },
  {
    id: "b-fallback-null",
    label: "B · Fallback poste null",
    description: "DUPONT Jean · poste = null → doit afficher « Technicien de plateau »",
    data: baseFixture({
      numero_contrat: "FB000002",
      poste: null,
    }),
  },
  {
    id: "c-adresse-longue",
    label: "C · Adresse longue",
    description: "MARTIN Luc · adresse 90 caractères — vérifier non-débordement",
    data: baseFixture({
      numero_contrat: "AD000003",
      employe_nom: "MARTIN",
      employe_prenom: "Luc",
      employe_adresse: "1234 avenue du Général Charles-de-Gaulle, Résidence des Tilleuls, Bât. C, 75019 Paris",
      poste: "Machiniste",
    }),
  },
  {
    id: "d-libelle-long",
    label: "D · Libellé chantier long",
    description: "DURAND Anne · libellé chantier 50 caractères — vérifier H1 non chevauché",
    data: baseFixture({
      numero_contrat: "LB000004",
      employe_nom: "DURAND",
      employe_prenom: "Anne",
      chantier_numero: "9412",
      chantier_nom: "Atelier mandarine M&Ms version pilote 2 — Phase 1",
      poste: "Peintre décorateur",
    }),
  },
  {
    id: "e-interim",
    label: "E · Intérim (vs CDDU)",
    description: "LEROY Paul · statut Intérim — format potentiellement distinct",
    data: baseFixture({
      numero_contrat: "IN000005",
      employe_nom: "LEROY",
      employe_prenom: "Paul",
      statut_contrat: "Intérim",
      poste: "Régisseur",
      taux_horaire_brut: 19.5,
    }),
  },
];

/**
 * Sections attendues dans le rendu (chaînes recherchées en plain text dans le HTML interpolé).
 * Servent aux tests Playwright + au panneau "Checklist" du dialog.
 */
export const EXPECTED_SECTIONS = [
  "Engagement et objet",
  "Durée",
  "Rémunération",
  "Règlement intérieur",
  "Cotisations",
  "Modification",
  "Conditions de réception",
  "Signatures",
  "Affiliations",
  "Périodicité",
  "Hygiène",
  "Lu et approuvé",
] as const;
