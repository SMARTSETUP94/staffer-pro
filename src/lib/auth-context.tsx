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
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithMagicLink: (email: string, redirectTo?: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchRoles(userId: string): Promise<AppRole[]> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error || !data) return [];
  return data.map((r) => r.role as AppRole);
}

async function fetchPasswordSetDone(userId: string): Promise<boolean | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("password_set_done")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return Boolean(data.password_set_done);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const [passwordSetDone, setPasswordSetDone] = useState<boolean | null>(null);

  useEffect(() => {
    // 1. Listener AVANT getSession (règle Supabase)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        setRolesLoaded(false);
        const uid = newSession.user.id;
        // Defer pour éviter deadlock
        setTimeout(() => {
          Promise.all([fetchRoles(uid), fetchPasswordSetDone(uid)]).then(([r, p]) => {
            setRoles(r);
            setPasswordSetDone(p);
            setRolesLoaded(true);
          });
        }, 0);
      } else {
        setRoles([]);
        setPasswordSetDone(null);
        setRolesLoaded(true);
      }
    });

    // 2. Récupération de la session existante
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        const uid = s.user.id;
        Promise.all([fetchRoles(uid), fetchPasswordSetDone(uid)]).then(([r, p]) => {
          setRoles(r);
          setPasswordSetDone(p);
          setRolesLoaded(true);
          setLoading(false);
        });
      } else {
        setRolesLoaded(true);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signInWithMagicLink = async (email: string, redirectTo?: string) => {
    const emailRedirectTo = redirectTo ?? `${window.location.origin}/auth/set-password`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo, shouldCreateUser: false },
    });
    return { error: error?.message ?? null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
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
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refreshRoles = async () => {
    if (user) {
      const [r, p] = await Promise.all([fetchRoles(user.id), fetchPasswordSetDone(user.id)]);
      setRoles(r);
      setPasswordSetDone(p);
      setRolesLoaded(true);
    }
  };

  const isAdmin = roles.includes("admin");
  const isChef = roles.includes("chef_chantier");
  const isAdminOrChef = isAdmin || isChef;

  return (
    <AuthContext.Provider
      value={{
        user, session, roles, loading, rolesLoaded,
        isAdmin, isChef, isAdminOrChef, passwordSetDone,
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
