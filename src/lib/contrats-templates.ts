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

/**
 * Placeholders v2 — adaptés aux champs réels de la DB Staffer-Pro.
 * Les constantes employeur (raison sociale, adresse, SIRET, qualité, etc.) sont
 * hardcodées dans le template HTML et ne sont PAS des placeholders.
 */
export type PlaceholderKey =
  // Salarié (4)
  | "employe_nom_complet"
  | "employe_adresse_complete"
  | "employe_email"
  | "statut_contrat"
  // Mission (6)
  | "poste"
  | "chantier_numero"
  | "chantier_libelle"
  | "date_debut"
  | "date_fin"
  | "heures_estimees"
  // Rémunération (1)
  | "taux_horaire_brut"
  // Métadonnées (3)
  | "numero_contrat"
  | "date_signature_employe"
  | "date_signature_employeur";

export interface PlaceholderDef {
  key: PlaceholderKey;
  label: string;
  example: string;
}

export const PLACEHOLDER_GROUPS: Array<{ groupe: string; items: PlaceholderDef[] }> = [
  {
    groupe: "Salarié",
    items: [
      { key: "employe_nom_complet", label: "Nom complet", example: "SAVOYEN Hadrien" },
      { key: "employe_adresse_complete", label: "Adresse complète", example: "40 Rue Etienne Dolet, 75020 Paris" },
      { key: "employe_email", label: "Email", example: "hadrien@example.com" },
      { key: "statut_contrat", label: "Statut contrat (juridique)", example: "Intérim" },
    ],
  },
  {
    groupe: "Mission",
    items: [
      { key: "poste", label: "Poste / qualité", example: "Constructeur" },
      { key: "chantier_numero", label: "N° chantier", example: "9231" },
      { key: "chantier_libelle", label: "Libellé chantier", example: "13th maker" },
      { key: "date_debut", label: "Date de début (JJ/MM/AAAA)", example: "11/05/2026" },
      { key: "date_fin", label: "Date de fin (JJ/MM/AAAA)", example: "12/05/2026" },
      { key: "heures_estimees", label: "Heures estimées", example: "16" },
    ],
  },
  {
    groupe: "Rémunération",
    items: [
      { key: "taux_horaire_brut", label: "Taux horaire brut", example: "17,00 €" },
    ],
  },
  {
    groupe: "Métadonnées",
    items: [
      { key: "numero_contrat", label: "N° contrat (court)", example: "71D95622" },
      { key: "date_signature_employe", label: "Date signature salarié", example: "10/05/2026" },
      { key: "date_signature_employeur", label: "Date signature employeur", example: "10/05/2026" },
    ],
  },
];

export const CONTRAT_TEMPLATE_PLACEHOLDERS = PLACEHOLDER_GROUPS.flatMap((g) => g.items.map((i) => i.key));

/** Fallback minimal si aucun template actif en base. NE PAS utiliser comme source de vérité légale. */
export const DEFAULT_CONTRAT_TEMPLATE_HTML = `<p>Aucun template actif. Veuillez activer un template depuis l'éditeur Template contrat.</p>`;

export const EXAMPLE_CONTRAT_TEMPLATE_VALUES: ContratTemplateVariables = Object.fromEntries(
  PLACEHOLDER_GROUPS.flatMap((g) => g.items.map((i) => [i.key, i.example])),
);

/**
 * Interpolation : remplace {{key}} par la valeur fournie.
 * Si la valeur est null/undefined/"", le placeholder est remplacé par "—" (jamais affiché en raw au PDF final).
 */
export function interpolateContratTemplate(html: string, values: ContratTemplateVariables): string {
  return html.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key: string) => {
    const value = values[key];
    if (value === null || value === undefined || value === "") return "—";
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
