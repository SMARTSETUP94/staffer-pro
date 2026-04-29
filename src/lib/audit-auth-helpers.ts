/**
 * v0.26.2 — Helpers Audit Auth admin (constantes + libellés + statuts).
 * Pas d'accès Supabase ici : pure logique testable.
 */

/** 10 actions auth exposées dans l'onglet Événements (liste large décidée v0.26.2). */
export const AUTH_EVENT_TYPES = [
  "login",
  "logout",
  "user_signedup",
  "user_confirmation_requested",
  "user_recovery_requested",
  "user_invited",
  "user_modified",
  "token_refreshed",
  "login_failed",
  "signup_failed",
] as const;

export type AuthEventType = (typeof AUTH_EVENT_TYPES)[number];

/** Libellé FR par type d'événement. Fallback sur la valeur brute si inconnu. */
const LABELS: Record<AuthEventType, string> = {
  login: "Connexion",
  logout: "Déconnexion",
  user_signedup: "Inscription",
  user_confirmation_requested: "Confirmation email demandée",
  user_recovery_requested: "Reset mot de passe",
  user_invited: "Invitation envoyée",
  user_modified: "Profil modifié",
  token_refreshed: "Session rafraîchie",
  login_failed: "Échec connexion",
  signup_failed: "Échec inscription",
};

export function authEventLabel(action: string | null | undefined): string {
  if (!action) return "—";
  if ((AUTH_EVENT_TYPES as readonly string[]).includes(action)) {
    return LABELS[action as AuthEventType];
  }
  return action;
}

/** Variante sémantique badge (pour mappage couleur via Badge variants). */
export type AuthEventTone = "success" | "info" | "warning" | "danger" | "neutral";

export function authEventTone(action: string | null | undefined): AuthEventTone {
  switch (action) {
    case "login":
    case "user_signedup":
      return "success";
    case "user_invited":
    case "user_confirmation_requested":
    case "user_recovery_requested":
      return "info";
    case "logout":
    case "user_modified":
    case "token_refreshed":
      return "neutral";
    case "login_failed":
    case "signup_failed":
      return "danger";
    default:
      return "neutral";
  }
}

/** Statut invitation calculé côté SQL ou recalculé en client si besoin. */
export type InvitationStatut = "envoye" | "accepte" | "expire";

export function computeInvitationStatut(input: {
  invitedAt: string | null;
  lastSignInAt: string | null;
  activatedAt?: string | null;
  status?: string | null;
  now?: Date;
}): InvitationStatut {
  const now = input.now ?? new Date();
  if (input.lastSignInAt || input.activatedAt || input.status === "actif") {
    return "accepte";
  }
  if (input.invitedAt) {
    const invited = new Date(input.invitedAt);
    const diffDays = (now.getTime() - invited.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > 7) return "expire";
  }
  return "envoye";
}

export function invitationStatutLabel(s: InvitationStatut): string {
  switch (s) {
    case "envoye":
      return "Envoyé";
    case "accepte":
      return "Accepté";
    case "expire":
      return "Expiré";
  }
}

/** Sérialise une ligne d'événement en CSV (échappement quotes). */
export function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function eventsToCsv(
  rows: Array<{
    created_at: string;
    action: string | null;
    actor_email: string | null;
    actor_name: string | null;
    ip_address: string | null;
    log_type: string | null;
  }>,
): string {
  const header = ["Date", "Action", "Email", "Nom", "IP", "Type"].join(",");
  const lines = rows.map((r) =>
    [
      csvEscape(r.created_at),
      csvEscape(authEventLabel(r.action)),
      csvEscape(r.actor_email),
      csvEscape(r.actor_name),
      csvEscape(r.ip_address),
      csvEscape(r.log_type),
    ].join(","),
  );
  return [header, ...lines].join("\n");
}

/** Plages de dates preset utilisées dans le filtre Événements. */
export type DatePreset = "today" | "7d" | "30d";

export function presetRange(preset: DatePreset, now: Date = new Date()): { from: Date; to: Date } {
  const to = new Date(now);
  const from = new Date(now);
  switch (preset) {
    case "today":
      from.setHours(0, 0, 0, 0);
      break;
    case "7d":
      from.setDate(from.getDate() - 7);
      break;
    case "30d":
      from.setDate(from.getDate() - 30);
      break;
  }
  return { from, to };
}
