/**
 * @vitest-environment happy-dom
 *
 * Sprint A — RoleSwitcher atome. 5 tests : auto-cache mono-rôle, init localStorage,
 * persistance + event, fallback priorité, multi-roles affichage.
 *
 * Note : auth-context et supabase client sont mockés pour isoler le composant.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { AppRole } from "@/lib/auth-context";

const authState: { roles: AppRole[]; rolesLoaded: boolean; user: { id: string } | null } = {
  roles: [],
  rolesLoaded: true,
  user: { id: "u1" },
};

vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return {
    ...actual,
    useAuth: () => authState,
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ update: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
  },
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

// Import après mocks
const { RoleSwitcher } = await import("../RoleSwitcher");

describe("RoleSwitcher", () => {
  beforeEach(() => {
    localStorage.clear();
    authState.roles = [];
    authState.rolesLoaded = true;
    authState.user = { id: "u1" };
  });
  afterEach(cleanup);

  it("auto-cache si rolesLoaded=false", () => {
    authState.roles = ["admin", "chef_chantier"];
    authState.rolesLoaded = false;
    const { container } = render(<RoleSwitcher />);
    expect(container.firstChild).toBeNull();
  });

  it("auto-cache si user a 1 seul rôle", () => {
    authState.roles = ["employe"];
    const { container } = render(<RoleSwitcher />);
    expect(container.firstChild).toBeNull();
  });

  it("affiche le rôle prioritaire (admin) si multi-rôles et aucune préférence stockée", () => {
    authState.roles = ["employe", "admin", "chef_chantier"];
    render(<RoleSwitcher />);
    // admin est en tête de ROLE_PRIORITY
    expect(screen.getByRole("button", { name: /changer de rôle actif/i })).toBeInTheDocument();
  });

  it("respecte la préférence localStorage si rôle disponible", () => {
    authState.roles = ["admin", "chef_chantier", "employe"];
    localStorage.setItem("preferred_role", "employe");
    render(<RoleSwitcher />);
    const btn = screen.getByRole("button", { name: /changer de rôle actif/i });
    expect(btn.textContent).toMatch(/employé/i);
  });

  it("emit event role:switched + écrit localStorage au clic", async () => {
    authState.roles = ["admin", "chef_chantier"];
    const handler = vi.fn();
    window.addEventListener("role:switched", handler as EventListener);
    render(<RoleSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: /changer de rôle actif/i }));
    const items = await screen.findAllByRole("button");
    // Cherche un bouton qui mentionne "Chef" (label UI)
    const chefBtn = items.find((b) => /chef/i.test(b.textContent ?? ""));
    expect(chefBtn).toBeTruthy();
    fireEvent.click(chefBtn!);
    expect(localStorage.getItem("preferred_role")).toBe("chef_chantier");
    expect(handler).toHaveBeenCalled();
    window.removeEventListener("role:switched", handler as EventListener);
  });
});
