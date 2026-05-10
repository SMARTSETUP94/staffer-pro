import { supabase } from "@/integrations/supabase/client";

export type ContratTemplate = {
  id: string;
  nom: string;
  contenu_html: string;
  version_int: number;
  actif: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ContratTemplateVariables = Record<string, string | number | null | undefined>;

export const CONTRAT_TEMPLATE_PLACEHOLDERS = [
  "employe_nom",
  "employe_prenom",
  "employe_adresse",
  "employe_email",
  "date_debut",
  "date_fin",
  "lieu_mission",
  "chantier_nom",
  "chantier_numero",
  "taux_horaire_brut",
  "nb_heures",
  "poste",
  "employeur_signataire",
  "numero_contrat",
  "convention_collective",
  "statut_contrat",
] as const;

export const DEFAULT_CONTRAT_TEMPLATE_HTML = `<h2>Conditions générales</h2><p>Le présent contrat à durée déterminée d'usage (CDDU) est conclu en application des articles L.1242-2 3° et D.1242-1 du Code du Travail relatifs aux secteurs d'activité dans lesquels il est d'usage constant de ne pas recourir au contrat à durée indéterminée.</p><p>Le salarié reconnaît avoir pris connaissance des conditions générales d'emploi de Setup Paris et s'engage à respecter le règlement intérieur en vigueur.</p><p>La signature électronique apposée par les deux parties vaut consentement au sens de l'article 1367 du Code Civil. Un horodatage, une adresse IP, un user-agent et un hash cryptographique SHA-256 sont conservés à des fins probatoires.</p>`;

export const EXAMPLE_CONTRAT_TEMPLATE_VALUES: ContratTemplateVariables = {
  employe_nom: "AUBERT",
  employe_prenom: "Valentin",
  employe_adresse: "12 rue de la Paix, 75002 Paris",
  employe_email: "valentin.aubert@example.com",
  date_debut: "12 mai 2026",
  date_fin: "16 mai 2026",
  lieu_mission: "Grand Palais Éphémère, Paris",
  chantier_nom: "Salon exemple",
  chantier_numero: "4123",
  taux_horaire_brut: "18,00 €",
  nb_heures: "35 h",
  poste: "Technicien montage",
  employeur_signataire: "Gabin — Setup Paris",
  numero_contrat: "C-2026-042",
  convention_collective: "Convention collective nationale des entreprises techniques au service de la création et de l'événement",
  statut_contrat: "CDDU intermittent",
};

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
    .select("id, nom, contenu_html, version_int, actif, created_by, created_at, updated_at")
    .order("version_int", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ContratTemplate[];
}

export async function createContratTemplateVersion(input: { nom: string; contenuHtml: string; actif: boolean }): Promise<string> {
  const { data, error } = await supabase.rpc("create_contrat_template_version", {
    p_nom: input.nom,
    p_contenu_html: input.contenuHtml,
    p_actif: input.actif,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function activateContratTemplate(templateId: string): Promise<void> {
  const { error } = await supabase.rpc("activate_contrat_template", { p_template_id: templateId });
  if (error) throw new Error(error.message);
}
