import { supabase } from "@/integrations/supabase/client";

export type ContratTemplate = {
  id: string;
  nom: string;
  contenu_html: string;
  contenu_json: unknown | null;
  version_int: number;
  actif: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ContratTemplateVariables = Record<string, string | number | null | undefined>;

export type PlaceholderKey =
  | "employe_nom" | "employe_prenom" | "employe_adresse" | "employe_email" | "date_naissance" | "numero_secu"
  | "date_debut" | "date_fin" | "lieu_mission" | "chantier_nom" | "chantier_numero" | "poste"
  | "taux_horaire_brut" | "taux_horaire_charge" | "nb_heures"
  | "employeur_nom" | "employeur_signataire" | "numero_contrat" | "convention_collective" | "statut_contrat"
  | "date_signature_employe" | "date_signature_employeur";

export interface PlaceholderDef {
  key: PlaceholderKey;
  label: string;
  example: string;
}

export const PLACEHOLDER_GROUPS: Array<{ groupe: string; items: PlaceholderDef[] }> = [
  {
    groupe: "Employé",
    items: [
      { key: "employe_nom", label: "Nom", example: "AUBERT" },
      { key: "employe_prenom", label: "Prénom", example: "Valentin" },
      { key: "employe_adresse", label: "Adresse", example: "12 rue de la Paix, 75002 Paris" },
      { key: "employe_email", label: "Email", example: "valentin.aubert@example.com" },
      { key: "date_naissance", label: "Date de naissance", example: "14 mars 1990" },
      { key: "numero_secu", label: "N° sécurité sociale", example: "1 90 03 75 056 042 12" },
    ],
  },
  {
    groupe: "Mission",
    items: [
      { key: "date_debut", label: "Date début", example: "12 mai 2026" },
      { key: "date_fin", label: "Date fin", example: "16 mai 2026" },
      { key: "lieu_mission", label: "Lieu de mission", example: "Grand Palais Éphémère, Paris" },
      { key: "chantier_nom", label: "Nom du chantier", example: "Salon exemple" },
      { key: "chantier_numero", label: "N° chantier", example: "4123" },
      { key: "poste", label: "Poste", example: "Technicien montage" },
      { key: "nb_heures", label: "Nombre d'heures", example: "35 h" },
    ],
  },
  {
    groupe: "Tarif",
    items: [
      { key: "taux_horaire_brut", label: "Taux horaire brut", example: "18,00 €" },
      { key: "taux_horaire_charge", label: "Taux horaire chargé", example: "26,40 €" },
    ],
  },
  {
    groupe: "Employeur",
    items: [
      { key: "employeur_nom", label: "Raison sociale", example: "Setup Paris SAS" },
      { key: "employeur_signataire", label: "Signataire employeur", example: "Gabin — Setup Paris" },
      { key: "numero_contrat", label: "N° contrat", example: "C-2026-042" },
      { key: "convention_collective", label: "Convention collective", example: "CCN entreprises techniques de la création et de l'événement" },
      { key: "statut_contrat", label: "Statut contrat", example: "CDDU intermittent" },
    ],
  },
  {
    groupe: "Signature",
    items: [
      { key: "date_signature_employe", label: "Date signature employé", example: "10 mai 2026" },
      { key: "date_signature_employeur", label: "Date signature employeur", example: "11 mai 2026" },
    ],
  },
];

export const CONTRAT_TEMPLATE_PLACEHOLDERS = PLACEHOLDER_GROUPS.flatMap((g) => g.items.map((i) => i.key));

export const DEFAULT_CONTRAT_TEMPLATE_HTML = `<h2>Conditions générales</h2><p>Le présent contrat à durée déterminée d'usage (CDDU) est conclu en application des articles L.1242-2 3° et D.1242-1 du Code du Travail relatifs aux secteurs d'activité dans lesquels il est d'usage constant de ne pas recourir au contrat à durée indéterminée.</p><p>Le salarié reconnaît avoir pris connaissance des conditions générales d'emploi de Setup Paris et s'engage à respecter le règlement intérieur en vigueur.</p><p>La signature électronique apposée par les deux parties vaut consentement au sens de l'article 1367 du Code Civil. Un horodatage, une adresse IP, un user-agent et un hash cryptographique SHA-256 sont conservés à des fins probatoires.</p>`;

export const EXAMPLE_CONTRAT_TEMPLATE_VALUES: ContratTemplateVariables = Object.fromEntries(
  PLACEHOLDER_GROUPS.flatMap((g) => g.items.map((i) => [i.key, i.example])),
);

export function interpolateContratTemplate(html: string, values: ContratTemplateVariables): string {
  return html.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (match, key: string) => {
    const value = values[key];
    if (value === null || value === undefined || value === "") return match;
    return String(value);
  });
}

export async function listContratTemplates(): Promise<ContratTemplate[]> {
  const { data, error } = await supabase
    .from("contrat_templates")
    .select("id, nom, contenu_html, contenu_json, version_int, actif, notes, created_by, created_at, updated_at")
    .order("version_int", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ContratTemplate[];
}

export async function createContratTemplateVersion(input: {
  nom: string;
  contenuHtml: string;
  contenuJson?: unknown | null;
  notes?: string | null;
  actif: boolean;
}): Promise<string> {
  const { data, error } = await supabase.rpc("create_contrat_template_version", {
    p_nom: input.nom,
    p_contenu_html: input.contenuHtml,
    p_actif: input.actif,
    p_contenu_json: (input.contenuJson ?? null) as never,
    p_notes: (input.notes ?? null) as never,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function activateContratTemplate(templateId: string): Promise<void> {
  const { error } = await supabase.rpc("activate_contrat_template", { p_template_id: templateId });
  if (error) throw new Error(error.message);
}
