/**
 * Template HTML — Reset de mot de passe Setup Paris
 * Branded cream / ink / indigo, cohérent avec invitation.ts.
 */

export interface PasswordResetEmailParams {
  fullName?: string;
  resetLink: string;
  expiresInMinutes?: number;
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

export function buildPasswordResetEmailHtml(params: PasswordResetEmailParams): string {
  const greeting = params.fullName ? `Bonjour ${escapeHtml(params.fullName)},` : "Bonjour,";
  const link = escapeHtml(params.resetLink);
  const minutes = params.expiresInMinutes ?? 60;

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>Réinitialisation — Setup Paris</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.cream};font-family:${FONT_STACK};color:${COLORS.ink};-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.cream};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:${COLORS.white};border:1px solid ${COLORS.border};border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background:${COLORS.creamDeep};padding:24px 32px;">
              <div style="font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${COLORS.indigo};">
                Setup Paris
              </div>
              <div style="font-size:12px;color:${COLORS.muted};margin-top:2px;">
                🔐 Réinitialisation de mot de passe
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px 8px 32px;">
              <h1 style="margin:0 0 6px;font-size:26px;line-height:1.2;font-weight:700;color:${COLORS.indigo};letter-spacing:-0.01em;">
                Réinitialisation de mot de passe
              </h1>
              <div style="font-size:14px;font-weight:600;color:${COLORS.ink};margin-bottom:24px;">
                Staffing by Setup.Paris
              </div>
              <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${COLORS.inkSoft};">
                ${greeting}
              </p>
              <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${COLORS.inkSoft};">
                Tu as demandé à réinitialiser ton mot de passe. Clique ci-dessous pour en choisir un nouveau.
                Ce lien est valable <strong style="color:${COLORS.ink};">${minutes} minutes</strong>.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 32px 32px;" align="center">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-radius:10px;background:${COLORS.indigo};">
                    <a href="${link}" target="_blank" rel="noopener"
                       style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:${COLORS.white};text-decoration:none;border-radius:10px;letter-spacing:0.01em;">
                      Réinitialiser mon mot de passe
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
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
          <tr>
            <td style="padding:0 32px;"><div style="height:1px;background:${COLORS.border};"></div></td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px 32px;">
              <p style="margin:0 0 8px;font-size:11px;color:${COLORS.muted};line-height:1.5;">
                Si tu n'es pas à l'origine de cette demande, ignore cet email — ton mot de passe actuel reste inchangé.
              </p>
              <p style="margin:0;font-size:11px;color:${COLORS.muted};line-height:1.5;">
                <strong style="color:${COLORS.ink};">Setup Paris</strong> — 🏗️ Constructeur d'imaginaire
              </p>
            </td>
          </tr>
        </table>
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
