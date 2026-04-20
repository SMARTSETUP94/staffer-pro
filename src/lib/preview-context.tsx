import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AppRole } from "@/lib/auth-context";
import { useAuth } from "@/lib/auth-context";

export type PreviewRole = "admin" | "chef_chantier" | "employe_desktop" | "employe_mobile";

const STORAGE_KEY = "setup_paris_preview_role";
const STORAGE_KEY_EMP = "setup_paris_preview_employe_id";

interface PreviewContextValue {
  previewRole: PreviewRole | null;
  setPreviewRole: (role: PreviewRole | null) => void;
  /** En preview employé, l'admin peut choisir une fiche employé démo pour exercer les flows. */
  previewEmployeId: string | null;
  setPreviewEmployeId: (id: string | null) => void;
  /** Rôle effectif utilisé pour l'affichage (preview si défini, sinon vrai rôle) */
  effectiveRole: AppRole;
  /** True si on est en mode prévisualisation actif (preview différent du rôle réel) */
  isPreviewing: boolean;
  /** Variantes pratiques basées sur effectiveRole */
  effIsAdmin: boolean;
  effIsChef: boolean;
  effIsAdminOrChef: boolean;
  effIsMobile: boolean;
  /** True si on est en preview "Employé desktop" ou "Employé mobile" (utile pour afficher le sélecteur) */
  isEmployePreview: boolean;
}

const PreviewContext = createContext<PreviewContextValue | undefined>(undefined);

function readStored(): PreviewRole | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.sessionStorage.getItem(STORAGE_KEY);
    if (v === "admin" || v === "chef_chantier" || v === "employe_desktop" || v === "employe_mobile") {
      return v;
    }
  } catch {
    // ignore
  }
  return null;
}

function readStoredEmp(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(STORAGE_KEY_EMP);
  } catch {
    return null;
  }
}

export function PreviewProvider({ children }: { children: ReactNode }) {
  const { isAdmin, roles } = useAuth();
  const [previewRole, setPreviewRoleState] = useState<PreviewRole | null>(() => readStored());
  const [previewEmployeId, setPreviewEmployeIdState] = useState<string | null>(() => readStoredEmp());

  // Si l'utilisateur n'est plus admin (ou se déconnecte), on purge le preview.
  useEffect(() => {
    if (!isAdmin && (previewRole !== null || previewEmployeId !== null)) {
      setPreviewRoleState(null);
      setPreviewEmployeIdState(null);
      try {
        window.sessionStorage.removeItem(STORAGE_KEY);
        window.sessionStorage.removeItem(STORAGE_KEY_EMP);
      } catch {
        // ignore
      }
    }
  }, [isAdmin, previewRole, previewEmployeId]);

  const setPreviewRole = (role: PreviewRole | null) => {
    setPreviewRoleState(role);
    try {
      if (role) window.sessionStorage.setItem(STORAGE_KEY, role);
      else window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    // Si on quitte le mode employé, on vide aussi l'override
    if (!role || (role !== "employe_desktop" && role !== "employe_mobile")) {
      setPreviewEmployeIdState(null);
      try {
        window.sessionStorage.removeItem(STORAGE_KEY_EMP);
      } catch {
        // ignore
      }
    }
  };

  const setPreviewEmployeId = (id: string | null) => {
    setPreviewEmployeIdState(id);
    try {
      if (id) window.sessionStorage.setItem(STORAGE_KEY_EMP, id);
      else window.sessionStorage.removeItem(STORAGE_KEY_EMP);
    } catch {
      // ignore
    }
  };

  // Détermine le rôle réel canonique (admin > chef > employe)
  const realRole: AppRole = roles.includes("admin")
    ? "admin"
    : roles.includes("chef_chantier")
      ? "chef_chantier"
      : "employe";

  // Mappe le previewRole vers un AppRole pour la logique permissions UI
  const previewToAppRole = (p: PreviewRole | null): AppRole | null => {
    if (!p) return null;
    if (p === "admin") return "admin";
    if (p === "chef_chantier") return "chef_chantier";
    return "employe"; // employe_desktop ou employe_mobile
  };

  const effectiveRole: AppRole = isAdmin
    ? (previewToAppRole(previewRole) ?? realRole)
    : realRole;

  const isPreviewing = isAdmin && previewRole !== null && previewRole !== "admin";

  const effIsAdmin = effectiveRole === "admin";
  const effIsChef = effectiveRole === "chef_chantier";
  const effIsAdminOrChef = effIsAdmin || effIsChef;
  const effIsMobile = previewRole === "employe_mobile";
  const isEmployePreview =
    previewRole === "employe_desktop" || previewRole === "employe_mobile";

  return (
    <PreviewContext.Provider
      value={{
        previewRole,
        setPreviewRole,
        previewEmployeId,
        setPreviewEmployeId,
        effectiveRole,
        isPreviewing,
        effIsAdmin,
        effIsChef,
        effIsAdminOrChef,
        effIsMobile,
        isEmployePreview,
      }}
    >
      {children}
    </PreviewContext.Provider>
  );
}

export function usePreview() {
  const ctx = useContext(PreviewContext);
  if (!ctx) throw new Error("usePreview doit être utilisé dans PreviewProvider");
  return ctx;
}
