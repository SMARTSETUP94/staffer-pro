/**
 * Helpers extraits de auth.set-password.tsx pour testabilité.
 */

export interface SetPasswordValidation {
  ok: boolean;
  pwdError: string | null;
  confirmError: string | null;
}

export function validateSetPassword(password: string, confirm: string): SetPasswordValidation {
  let ok = true;
  let pwdError: string | null = null;
  let confirmError: string | null = null;
  if (password.length < 8) {
    pwdError = "8 caractères minimum.";
    ok = false;
  }
  if (password !== confirm) {
    confirmError = "Les mots de passe ne correspondent pas.";
    ok = false;
  }
  return { ok, pwdError, confirmError };
}

export interface HashTokens {
  access_token: string;
  refresh_token: string;
}

/**
 * Parse le hash URL d'un lien d'invitation Supabase.
 * Format : #access_token=xxx&refresh_token=yyy&type=invite&...
 */
export function parseHashTokens(hash: string): HashTokens | null {
  if (!hash || !hash.includes("access_token=")) return null;
  try {
    const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (!access_token || !refresh_token) return null;
    return { access_token, refresh_token };
  } catch {
    return null;
  }
}
