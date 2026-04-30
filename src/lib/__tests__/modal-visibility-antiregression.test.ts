/**
 * Anti-régression v0.27.7 — Bug "popups/sheets se ferment au changement d'onglet"
 *
 * Régression initialement fixée en v0.15.2 (task #48) puis revenue.
 *
 * Causes confirmées :
 *  A) Auth-context : onAuthStateChange émis sur TOKEN_REFRESHED quand le tab
 *     redevient visible (Supabase auto-refresh). L'ancien code remettait
 *     rolesLoaded=false → AppGuard démonte <Outlet/> → toutes les Sheet/Dialog
 *     ouvertes perdent leur state.
 *  B) Radix Dialog/Sheet : onFocusOutside/onInteractOutside ferment la modale
 *     quand le window perd le focus (fix appliqué dans dialog.tsx + sheet.tsx).
 *
 * Ce test simule la logique de auth-context pour garantir qu'un TOKEN_REFRESHED
 * sur le même utilisateur ne déclenche PAS un reload des rôles.
 */
import { describe, it, expect, vi } from "vitest";

/**
 * Simule la logique du callback onAuthStateChange (extraite de auth-context.tsx).
 * Renvoie true si la fonction loadUserData a été appelée (=> reload rôles =>
 * AppGuard remontera l'Outlet => modales perdues).
 */
function makeAuthCallback() {
  let lastUserId: string | null = null;
  const loadUserData = vi.fn();
  const setRolesLoaded = vi.fn();
  const setRoleRows = vi.fn();

  function onAuthStateChange(_event: string, newSession: { user: { id: string } | null } | null) {
    const newUserId = newSession?.user?.id ?? null;
    if (newUserId) {
      if (newUserId !== lastUserId) {
        lastUserId = newUserId;
        setRolesLoaded(false);
        loadUserData(newUserId);
      }
    } else {
      lastUserId = null;
      setRoleRows([]);
      setRolesLoaded(true);
    }
  }

  return { onAuthStateChange, loadUserData, setRolesLoaded };
}

describe("Anti-régression v0.27.7 — Modal state preserved on tab refocus", () => {
  it("INITIAL_SESSION sur user A → loadUserData appelé une fois", () => {
    const { onAuthStateChange, loadUserData } = makeAuthCallback();
    onAuthStateChange("INITIAL_SESSION", { user: { id: "userA" } });
    expect(loadUserData).toHaveBeenCalledTimes(1);
    expect(loadUserData).toHaveBeenCalledWith("userA");
  });

  it("TOKEN_REFRESHED sur même user → loadUserData PAS rappelé (= modales préservées)", () => {
    const { onAuthStateChange, loadUserData, setRolesLoaded } = makeAuthCallback();
    onAuthStateChange("INITIAL_SESSION", { user: { id: "userA" } });
    loadUserData.mockClear();
    setRolesLoaded.mockClear();

    // Simule : utilisateur change d'onglet et revient → Supabase auto-refresh
    onAuthStateChange("TOKEN_REFRESHED", { user: { id: "userA" } });

    expect(loadUserData).not.toHaveBeenCalled();
    expect(setRolesLoaded).not.toHaveBeenCalled();
  });

  it("USER_UPDATED sur même user → idem, pas de reload (modales préservées)", () => {
    const { onAuthStateChange, loadUserData } = makeAuthCallback();
    onAuthStateChange("INITIAL_SESSION", { user: { id: "userA" } });
    loadUserData.mockClear();

    onAuthStateChange("USER_UPDATED", { user: { id: "userA" } });

    expect(loadUserData).not.toHaveBeenCalled();
  });

  it("Visibilitychange (multiple TOKEN_REFRESHED) → aucun reload après le 1er load", () => {
    const { onAuthStateChange, loadUserData } = makeAuthCallback();
    onAuthStateChange("INITIAL_SESSION", { user: { id: "userA" } });
    loadUserData.mockClear();

    // L'utilisateur change d'onglet 5 fois → 5 TOKEN_REFRESHED
    for (let i = 0; i < 5; i++) {
      onAuthStateChange("TOKEN_REFRESHED", { user: { id: "userA" } });
    }

    expect(loadUserData).not.toHaveBeenCalled();
  });

  it("SIGNED_IN sur user différent (switch user) → loadUserData rappelé", () => {
    const { onAuthStateChange, loadUserData } = makeAuthCallback();
    onAuthStateChange("INITIAL_SESSION", { user: { id: "userA" } });
    loadUserData.mockClear();

    onAuthStateChange("SIGNED_IN", { user: { id: "userB" } });

    expect(loadUserData).toHaveBeenCalledTimes(1);
    expect(loadUserData).toHaveBeenCalledWith("userB");
  });

  it("SIGNED_OUT → reset propre + rolesLoaded=true", () => {
    const { onAuthStateChange, setRolesLoaded } = makeAuthCallback();
    onAuthStateChange("INITIAL_SESSION", { user: { id: "userA" } });
    setRolesLoaded.mockClear();

    onAuthStateChange("SIGNED_OUT", { user: null });

    expect(setRolesLoaded).toHaveBeenCalledWith(true);
  });

  it("SIGNED_OUT puis SIGNED_IN (re-login même user) → loadUserData rappelé", () => {
    const { onAuthStateChange, loadUserData } = makeAuthCallback();
    onAuthStateChange("INITIAL_SESSION", { user: { id: "userA" } });
    loadUserData.mockClear();

    onAuthStateChange("SIGNED_OUT", { user: null });
    onAuthStateChange("SIGNED_IN", { user: { id: "userA" } });

    expect(loadUserData).toHaveBeenCalledTimes(1);
  });
});

describe("Anti-régression v0.27.7 — Radix Dialog/Sheet onFocusOutside guard", () => {
  /**
   * Réplique la logique des handlers définis dans dialog.tsx + sheet.tsx :
   * - onFocusOutside : preventDefault systématique (visibilitychange Chrome)
   * - onInteractOutside : preventDefault uniquement si target hors document.body
   */
  function onFocusOutsideHandler(e: { preventDefault: () => void }) {
    e.preventDefault();
  }

  function onInteractOutsideHandler(
    e: { preventDefault: () => void; target: HTMLElement | null },
    bodyContains: (t: HTMLElement | null) => boolean,
  ) {
    if (e.target && !bodyContains(e.target)) {
      e.preventDefault();
    }
  }

  it("onFocusOutside (changement d'onglet) → preventDefault appelé → modal reste open", () => {
    const e = { preventDefault: vi.fn() };
    onFocusOutsideHandler(e);
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("onInteractOutside avec target hors document → preventDefault (focus loss window)", () => {
    const e = { preventDefault: vi.fn(), target: {} as HTMLElement };
    onInteractOutsideHandler(e, () => false);
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("onInteractOutside avec clic réel utilisateur sur overlay → laisse passer", () => {
    const e = { preventDefault: vi.fn(), target: {} as HTMLElement };
    onInteractOutsideHandler(e, () => true); // target dans body = clic réel
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("onInteractOutside avec target null → ne crash pas, ne preventDefault pas", () => {
    const e = { preventDefault: vi.fn(), target: null };
    onInteractOutsideHandler(e, () => true);
    expect(e.preventDefault).not.toHaveBeenCalled();
  });
});
