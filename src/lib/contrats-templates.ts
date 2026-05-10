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
  // Employé (6)
  | "employe_civilite" | "employe_nom" | "employe_prenom"
  | "employe_adresse_ligne1" | "employe_code_postal" | "employe_ville"
  // Mission (7)
  | "poste" | "nom_emission" | "categorie"
  | "date_debut" | "date_fin"
  | "duree_minimale_texte" | "duree_hebdomadaire_heures"
  // Tarif (1)
  | "taux_horaire_brut"
  // Signature (2)
  | "date_signature" | "lieu_signature";

export interface PlaceholderDef {
  key: PlaceholderKey;
  label: string;
  example: string;
  defaut?: string;
}

export const PLACEHOLDER_GROUPS: Array<{ groupe: string; items: PlaceholderDef[] }> = [
  {
    groupe: "Employé",
    items: [
      { key: "employe_civilite", label: "Civilité", example: "Monsieur" },
      { key: "employe_nom", label: "Nom", example: "DUPONT" },
      { key: "employe_prenom", label: "Prénom", example: "Jean" },
      { key: "employe_adresse_ligne1", label: "Adresse", example: "12 rue de la Paix" },
      { key: "employe_code_postal", label: "Code postal", example: "75002" },
      { key: "employe_ville", label: "Ville", example: "Paris" },
    ],
  },
  {
    groupe: "Mission",
    items: [
      { key: "poste", label: "Poste", example: "Technicien montage" },
      { key: "nom_emission", label: "Nom de l'émission", example: "THE VOICE", defaut: "non précisée" },
      { key: "categorie", label: "Catégorie", example: "Non-cadre", defaut: "Non-cadre" },
      { key: "date_debut", label: "Date de début (JJ/MM/AAAA)", example: "06/05/2026" },
      { key: "date_fin", label: "Date de fin (JJ/MM/AAAA)", example: "22/05/2026" },
      { key: "duree_minimale_texte", label: "Durée minimale", example: "1 jour", defaut: "1 jour" },
      { key: "duree_hebdomadaire_heures", label: "Durée hebdo (h)", example: "35", defaut: "35" },
    ],
  },
  {
    groupe: "Tarif",
    items: [
      { key: "taux_horaire_brut", label: "Taux horaire brut", example: "18,00 €" },
    ],
  },
  {
    groupe: "Signature",
    items: [
      { key: "date_signature", label: "Date de signature (JJ/MM/AAAA)", example: "10/05/2026" },
      { key: "lieu_signature", label: "Lieu de signature", example: "Vitry sur Seine", defaut: "Vitry sur Seine" },
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
