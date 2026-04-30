import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "chef_chantier" | "employe";

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
  rolesLoaded: boolean;
  isAdmin: boolean;
  isChef: boolean;
  isAdminOrChef: boolean;
  passwordSetDone: boolean | null;
  passwordSetAt: string | null;
  isInviteStatus: boolean;
  profileCompleted: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithMagicLink: (email: string, redirectTo?: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface RoleRow {
  role: AppRole;
  status: string | null;
}

async function fetchRoles(userId: string): Promise<RoleRow[]> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role, status")
    .eq("user_id", userId);
  if (error || !data) return [];
  return data.map((r) => ({ role: r.role as AppRole, status: r.status }));
}

interface ProfileFlags {
  passwordSetDone: boolean;
  passwordSetAt: string | null;
  profileCompleted: boolean;
}

async function fetchProfileFlags(userId: string): Promise<ProfileFlags> {
  const { data, error } = await supabase
    .from("profiles")
    .select("password_set_done, password_set_at, profile_completed_at")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) {
    return { passwordSetDone: false, passwordSetAt: null, profileCompleted: false };
  }
  return {
    passwordSetDone: Boolean(data.password_set_done),
    passwordSetAt: data.password_set_at ?? null,
    profileCompleted: Boolean(data.profile_completed_at),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roleRows, setRoleRows] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const [passwordSetDone, setPasswordSetDone] = useState<boolean | null>(null);
  const [passwordSetAt, setPasswordSetAt] = useState<string | null>(null);
  const [profileCompleted, setProfileCompleted] = useState(false);

  // Fonction stable de chargement des données utilisateur
  // Pas de setTimeout : on n'attend rien, mais on laisse onAuthStateChange retourner
  // immédiatement et on déclenche le fetch en parallèle (sans await dans le callback).
  const loadUserData = async (uid: string) => {
    try {
      const [r, pf] = await Promise.all([fetchRoles(uid), fetchProfileFlags(uid)]);
      setRoleRows(r);
      setPasswordSetDone(pf.passwordSetDone);
      setPasswordSetAt(pf.passwordSetAt);
      setProfileCompleted(pf.profileCompleted);
    } catch (err) {
      console.error("[auth] loadUserData failed", err);
    } finally {
      setRolesLoaded(true);
    }
  };

  useEffect(() => {
    // 1. Listener AVANT getSession (règle Supabase). Aucun await dans le callback.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      // FIX v0.27.1 : purge le preview admin (sessionStorage) à chaque login/logout
      // pour éviter qu'un admin reste coincé en "Preview : Employé mobile" après
      // s'être reconnecté (régression Gabin : redirigé sur /mobile/aujourdhui sans
      // possibilité de revenir).
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        try {
          window.sessionStorage.removeItem("setup_paris_preview_role");
          window.sessionStorage.removeItem("setup_paris_preview_employe_id");
        } catch {
          // ignore (SSR / private mode)
        }
      }
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        // Fire-and-forget : pas d'await pour éviter deadlock
        setRolesLoaded(false);
        void loadUserData(newSession.user.id);
      } else {
        setRoleRows([]);
        setPasswordSetDone(null);
        setPasswordSetAt(null);
        setProfileCompleted(false);
        setRolesLoaded(true);
      }
    });

    // 2. Récupération de la session existante
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        loadUserData(s.user.id).finally(() => setLoading(false));
      } else {
        setRolesLoaded(true);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
    } catch (err) {
      console.error("[auth] signIn threw", err);
      const message = err instanceof Error ? err.message : "Erreur réseau ou session corrompue. Réessaie.";
      return { error: message };
    }
  };

  const signInWithMagicLink = async (email: string, redirectTo?: string) => {
    try {
      const emailRedirectTo = redirectTo ?? `${window.location.origin}/auth/set-password`;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo, shouldCreateUser: false },
      });
      return { error: error?.message ?? null };
    } catch (err) {
      console.error("[auth] signInWithMagicLink threw", err);
      const message = err instanceof Error ? err.message : "Erreur réseau, réessaie.";
      return { error: message };
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const redirectUrl = `${window.location.origin}/`;
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: { full_name: fullName },
        },
      });
      return { error: error?.message ?? null };
    } catch (err) {
      console.error("[auth] signUp threw", err);
      const message = err instanceof Error ? err.message : "Erreur réseau, réessaie.";
      return { error: message };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refreshRoles = async () => {
    if (user) {
      await loadUserData(user.id);
    }
  };

  const roles = roleRows.map((r) => r.role);
  const isAdmin = roles.includes("admin");
  const isChef = roles.includes("chef_chantier");
  const isAdminOrChef = isAdmin || isChef;
  const isInviteStatus = roleRows.some((r) => r.status === "invite");

  return (
    <AuthContext.Provider
      value={{
        user, session, roles, loading, rolesLoaded,
        isAdmin, isChef, isAdminOrChef,
        passwordSetDone, passwordSetAt, isInviteStatus, profileCompleted,
        signIn, signInWithMagicLink, signUp, signOut, refreshRoles,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans AuthProvider");
  return ctx;
}
