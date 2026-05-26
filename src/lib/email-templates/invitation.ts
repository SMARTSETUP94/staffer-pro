/**
 * Template HTML — Invitation Setup Paris
 * Branded cream / ink / indigo, responsive, Inter-like font stack.
 */

export type InvitationRoleLabel =
  | "admin"
  | "chef_chantier"
  | "chef_metier_scoped"
  | "employe"
  | "rh"
  | "commercial"
  | "bureau_etude"
  | "atelier_chef"
  | "atelier_metier"
  | "logistique"
  | "poseur"
  | "chef_pose";

export interface InvitationEmailParams {
  fullName?: string;
  roles: InvitationRoleLabel[];
  inviteLink: string;
}

const COLORS = {
  cream: "#F5F0E8",
  creamDeep: "#EDE6D8",
  ink: "#1A1A1A",
  inkSoft: "#3A3A3A",
  indigo: "#2A2A8C",
  indigoSoft: "#EEF2FF",
  white: "#ffffff",
  border: "#E5DED0",
  muted: "#7A7468",
};

const FONT_STACK =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

function rolesToLabel(roles: InvitationRoleLabel[]): string {
  if (roles.includes("admin")) return "Administrateur";
  if (roles.includes("chef_chantier")) return "Chef de Chantier";
  if (roles.includes("chef_metier_scoped")) return "Chef Métier";
  if (roles.includes("atelier_chef")) return "Chef d'atelier";
  if (roles.includes("chef_pose")) return "Chef pose";
  if (roles.includes("bureau_etude")) return "Bureau d'étude";
  if (roles.includes("commercial")) return "Commercial";
  if (roles.includes("logistique")) return "Logistique";
  if (roles.includes("poseur")) return "Poseur";
  if (roles.includes("atelier_metier")) return "Atelier";
  if (roles.includes("rh")) return "RH";
  return "Employé";
}


export function buildInvitationEmailHtml(params: InvitationEmailParams): string {
  const greeting = params.fullName ? `Bonjour ${escapeHtml(params.fullName)},` : "Bonjour,";
  const role = rolesToLabel(params.roles);
  const link = escapeHtml(params.inviteLink);

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>Invitation — Setup Paris</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.cream};font-family:${FONT_STACK};color:${COLORS.ink};-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.cream};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:${COLORS.white};border:1px solid ${COLORS.border};border-radius:16px;overflow:hidden;">
          <!-- Header band -->
          <tr>
            <td style="background:${COLORS.creamDeep};padding:24px 32px;text-align:left;">
              <div style="font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${COLORS.indigo};">
                Setup Paris
              </div>
              <div style="font-size:12px;color:${COLORS.muted};margin-top:2px;">
                🏗️ Constructeur d'imaginaire
              </div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 32px 8px 32px;">
              <h1 style="margin:0 0 6px;font-size:26px;line-height:1.2;font-weight:700;color:${COLORS.indigo};letter-spacing:-0.01em;">
                Bienvenue chez Setup Paris
              </h1>
              <div style="font-size:14px;font-weight:600;color:${COLORS.ink};margin-bottom:24px;">
                Staffing by Setup.Paris
              </div>

              <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${COLORS.inkSoft};">
                ${greeting}
              </p>
              <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${COLORS.inkSoft};">
                Tu as été invité(e) comme <strong style="color:${COLORS.ink};">${escapeHtml(role)}</strong> dans notre outil de planning.
                Clique ci-dessous pour créer ton compte et commencer à staffer tes équipes.
              </p>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:8px 32px 32px 32px;" align="center">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-radius:10px;background:${COLORS.indigo};">
                    <a href="${link}" target="_blank" rel="noopener"
                       style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:${COLORS.white};text-decoration:none;border-radius:10px;letter-spacing:0.01em;">
                      Créer mon compte
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Fallback link -->
          <tr>
            <td style="padding:0 32px 28px 32px;">
              <p style="margin:0 0 6px;font-size:12px;color:${COLORS.muted};line-height:1.5;">
                Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur :
              </p>
              <p style="margin:0;font-size:11px;color:${COLORS.indigo};word-break:break-all;background:${COLORS.indigoSoft};padding:10px 12px;border-radius:8px;">
                ${link}
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 32px;">
              <div style="height:1px;background:${COLORS.border};"></div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px 28px 32px;">
              <p style="margin:0 0 8px;font-size:11px;color:${COLORS.muted};line-height:1.5;">
                Si tu n'as pas demandé cette invitation, ignore cet email.
              </p>
              <p style="margin:0;font-size:11px;color:${COLORS.muted};line-height:1.5;">
                <strong style="color:${COLORS.ink};">Setup Paris</strong> — 🏗️ Constructeur d'imaginaire
              </p>
            </td>
          </tr>
        </table>

        <!-- Outer footer -->
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;margin-top:16px;">
          <tr>
            <td align="center" style="padding:0 16px;font-size:10px;color:${COLORS.muted};line-height:1.5;">
              Email envoyé par Setup Paris depuis l'outil Staffing.<br/>
              <a href="https://setup.paris" style="color:${COLORS.indigo};text-decoration:none;">setup.paris</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
