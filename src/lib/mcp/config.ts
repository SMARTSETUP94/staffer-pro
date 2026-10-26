export const CLAUDE_REDIRECT_URIS = [
  "https://claude.ai/api/mcp/auth_callback",
  "https://claude.com/api/mcp/auth_callback",
] as const;
export const MAX_RESPONSE_BYTES = 200_000;
export const PAGE_DEFAULT = 25;
export const PAGE_MAX = 100;
export const TOOL_CAPS = {
  rechercher_affaires: "section.affaires", fiche_affaire: "section.affaires",
  pipeline_opportunites: "section.pipeline_opportunites", qui_est_ou: "planning.view",
  charge_atelier: "section.fabrication", heures_affaire: "heures.audit",
  echeances: "section.affaires", demandes_clients: "demandes_clients.view", mon_profil: "api.mcp",
} as const;
export type ToolName = keyof typeof TOOL_CAPS;