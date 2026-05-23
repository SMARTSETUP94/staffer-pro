import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";


export type AppRole = "admin" | "chef_chantier" | "chef_metier_scoped" | "employe" | "rh";

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
  rolesLoaded: boolean;
  isAdmin: boolean;
  isChef: boolean;
  /** chef_chantier OU chef_metier_scoped (n'inclut pas admin seul) */
  isChefAny: boolean;
  /** admin + chef_chantier (vue globale, exclut chef_metier_scoped) */
  isChefGlobal: boolean;
  /** chef_metier_scoped uniquement (accès par-affaire) */
  isChefMetierScoped: boolean;
  /** Élargi v0.45 : admin + chef_chantier + chef_metier_scoped */
  isAdminOrChef: boolean;
  /** v0.48 Bloc 6 — rôle RH (accès module RH) */
  isRh: boolean;

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
  const loadUserData = useCallback(async (uid: string) => {
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
  }, []);

  useEffect(() => {
    // v0.39.0e — FIX boucle infinie spinner /dashboard
    // Avec @supabase/supabase-js >= 2.43, onAuthStateChange émet automatiquement
    // INITIAL_SESSION au montage. On l'utilise comme source de vérité unique pour
    // initialiser session/user ET pour passer loading=false. Plus d'appel parallèle
    // à getSession() qui créait une race condition (deux loadUserData concurrents +
    // setLoading(false) parfois jamais atteint si getSession renvoyait null pendant
    // un refresh token).
    //
    // Filet de sécurité : si INITIAL_SESSION ne tombe jamais (cas dégradé réseau),
    // on débloque loading après 8s pour ne JAMAIS laisser AppGuard sur le spinner
    // permanent. L'utilisateur sera redirigé sur /login plutôt que rester bloqué.
    let lastUserId: string | null = null;
    let initialised = false;
    const safetyTimer = window.setTimeout(() => {
      if (!initialised) {
        console.warn("[auth] INITIAL_SESSION timeout — débloque loading");
        initialised = true;
        setRolesLoaded(true);
        setLoading(false);
      }
    }, 8_000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        try {
          window.sessionStorage.removeItem("setup_paris_preview_role");
          window.sessionStorage.removeItem("setup_paris_preview_employe_id");
          window.sessionStorage.removeItem("onboarding_skipped_v1");
        } catch {
          // ignore (SSR / private mode)
        }
      }
      const newUserId = newSession?.user?.id ?? null;
      // v0.39.0f — N'écrase user/session QUE si l'identité change ou au 1er event.
      // Sinon SIGNED_IN/INITIAL_SESSION/TOKEN_REFRESHED émis au refocus d'onglet
      // ou au refresh token recréent une nouvelle référence `user` → tous les hooks
      // dépendants (useDashboardLayout, etc.) repassent en loading=true → spinner cyclique.
      const identityChanged = newUserId !== lastUserId;
      if (!initialised || identityChanged) {
        setSession(newSession);
        setUser(newSession?.user ?? null);
      } else if (newSession) {
        // v0.39.1 — Shallow-eq guard : si le token n'a PAS changé (cas refocus
        // d'onglet → SIGNED_IN/INITIAL_SESSION ré-émis avec la même session),
        // on garde la référence existante pour éviter de re-render tous les
        // hooks dépendants (dashboard clignotant, spinner permanent, modales
        // qui se ferment au changement d'onglet — cf. mem://constraints/auth-context-tab-refocus).
        setSession((prev) => {
          if (
            prev?.access_token === newSession.access_token &&
            prev?.refresh_token === newSession.refresh_token &&
            prev?.user?.id === newSession.user?.id
          ) {
            return prev;
          }
          return newSession;
        });
      }
      if (newUserId) {
        // Anti-régression v0.27.7 : ne reload les rôles que si l'userId change.
        if (newUserId !== lastUserId) {
          lastUserId = newUserId;
          setRolesLoaded(false);
          loadUserData(newUserId).finally(() => {
            if (!initialised) {
              initialised = true;
              setLoading(false);
            }
          });
        } else if (!initialised) {
          // Même user, mais c'est le 1er event (TOKEN_REFRESHED au boot par ex.)
          initialised = true;
          setLoading(false);
        }
      } else {
        lastUserId = null;
        setRoleRows([]);
        setPasswordSetDone(null);
        setPasswordSetAt(null);
        setProfileCompleted(false);
        setRolesLoaded(true);
        if (!initialised) {
          initialised = true;
          setLoading(false);
        }
      }
    });

    return () => {
      window.clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, [loadUserData]);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
    } catch (err) {
      console.error("[auth] signIn threw", err);
      const message = err instanceof Error ? err.message : "Erreur réseau ou session corrompue. Réessaie.";
      return { error: message };
    }
  }, []);

  const signInWithMagicLink = useCallback(async (email: string, redirectTo?: string) => {
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
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
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
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const refreshRoles = useCallback(async () => {
    if (user) {
      await loadUserData(user.id);
    }
  }, [loadUserData, user]);

  const roles = useMemo(() => roleRows.map((r) => r.role), [roleRows]);
  const isAdmin = roles.includes("admin");
  const isChef = roles.includes("chef_chantier");
  const isChefMetierScoped = roles.includes("chef_metier_scoped");
  const isChefAny = isChef || isChefMetierScoped;
  const isChefGlobal = isAdmin || isChef;
  const isAdminOrChef = isAdmin || isChef || isChefMetierScoped;
  const isRh = isAdmin || roles.includes("rh");
  const isInviteStatus = roleRows.some((r) => r.status === "invite");
  const value = useMemo<AuthContextValue>(() => ({
    user, session, roles, loading, rolesLoaded,
    isAdmin, isChef, isChefAny, isChefGlobal, isChefMetierScoped, isAdminOrChef, isRh,
    passwordSetDone, passwordSetAt, isInviteStatus, profileCompleted,
    signIn, signInWithMagicLink, signUp, signOut, refreshRoles,
  }), [
    user, session, roles, loading, rolesLoaded,
    isAdmin, isChef, isChefAny, isChefGlobal, isChefMetierScoped, isAdminOrChef, isRh,
    passwordSetDone, passwordSetAt, isInviteStatus, profileCompleted,
    signIn, signInWithMagicLink, signUp, signOut, refreshRoles,
  ]);


  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans AuthProvider");
  return ctx;
}
