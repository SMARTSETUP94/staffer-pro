import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Loader2, ShieldCheck, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { markPasswordSet } from "@/lib/auth-actions";
import { withAuthRetry } from "@/lib/with-auth-retry";
import { readServerFnError } from "@/lib/server-fn-error";
import { toast } from "sonner";
import { BrandLogo } from "@/components/BrandLogo";
import { parseHashTokens, validateSetPassword } from "@/lib/set-password-helpers";

export const Route = createFileRoute("/auth/set-password")({
  head: () => ({
    meta: [
      { title: "Créer ton mot de passe — Setup Paris" },
      { name: "description", content: "Crée ton mot de passe pour accéder au planning Setup Paris." },
    ],
  }),
  component: SetPasswordPage,
});

/**
 * Tente d'établir la session depuis le hash URL (#access_token=...&refresh_token=...)
 * Cas typique : lien d'invitation/recovery Supabase.
 * Retourne true si une session a été établie, false sinon.
 */
async function consumeHashSessionIfPresent(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const tokens = parseHashTokens(window.location.hash);
  if (!tokens) return false;
  try {
    const { error } = await supabase.auth.setSession(tokens);
    if (error) {
      console.error("[set-password] setSession from hash failed:", error);
      return false;
    }
    history.replaceState(null, "", window.location.pathname + window.location.search);
    console.info("[set-password] session set from hash");
    return true;
  } catch (e) {
    console.error("[set-password] hash setSession error:", e);
    return false;
  }
}

function SetPasswordPage() {
  const navigate = useNavigate();
  const { user, roles, loading, rolesLoaded, refreshRoles } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [hashChecked, setHashChecked] = useState(false);

  // Au mount : tenter de consommer le hash AVANT de décider de rediriger
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await consumeHashSessionIfPresent();
      if (!cancelled) setHashChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Si pas connecté APRÈS check hash → vers login (avec petit délai de grâce)
  useEffect(() => {
    if (!hashChecked || loading) return;
    if (user) return;
    // Grâce de 600ms : laisser onAuthStateChange propager si nécessaire
    const t = setTimeout(() => {
      console.warn("[set-password] no user after grace period → redirect /login");
      setSessionError("Lien expiré ou invalide. Demandez un nouveau lien d'invitation.");
      navigate({ to: "/login" });
    }, 600);
    return () => clearTimeout(t);
  }, [hashChecked, loading, user, navigate]);

  const isEmploye = rolesLoaded && roles.includes("employe") && !roles.includes("chef_chantier") && !roles.includes("admin");
  const canSkip = isEmploye;

  const validate = (): boolean => {
    const r = validateSetPassword(password, confirm);
    setPwdError(r.pwdError);
    setConfirmError(r.confirmError);
    return r.ok;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.info("[set-password] submit attempt");
    if (!validate()) {
      console.info("[set-password] validation failed", { pwdLen: password.length, match: password === confirm });
      return;
    }
    // Vérifier qu'on a bien une session avant updateUser
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.error("[set-password] no session before updateUser");
      setSessionError("Lien expiré. Demandez un nouveau lien d'invitation.");
      toast.error("Lien expiré", { description: "Demandez un nouveau lien d'invitation à un admin." });
      return;
    }
    setBusy(true);
    console.info("[set-password] submit start");
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        console.error("[set-password] updateUser error:", error);
        toast.error("Impossible de définir le mot de passe", { description: error.message });
        return;
      }
      console.info("[set-password] updateUser ok");
      try {
        const r = await withAuthRetry(() => markPasswordSet({ data: { skipped: false } }));
        if (!r.ok) throw new Error(r.error);
        console.info("[set-password] markPasswordSet ok");
      } catch (e) {
        const msg = await readServerFnError(e);
        console.warn("[set-password] markPasswordSet failed:", msg);
      }
      await refreshRoles();
      toast.success("Mot de passe créé", { description: "Bienvenue chez Setup Paris !" });
      const isChefOrAdmin = roles.includes("admin") || roles.includes("chef_chantier");
      navigate({ to: isChefOrAdmin ? "/dashboard" : "/mobile/aujourdhui" });
    } catch (e) {
      console.error("[set-password] uncaught:", e);
      toast.error("Une erreur inattendue est survenue", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  const onSkip = async () => {
    setBusy(true);
    try {
      const r = await withAuthRetry(() => markPasswordSet({ data: { skipped: true } }));
      if (!r.ok) throw new Error(r.error);
      await refreshRoles();
      toast.success("OK, tu utiliseras un lien magique à chaque connexion");
      navigate({ to: "/" });
    } catch (e) {
      const msg = await readServerFnError(e);
      toast.error("Erreur", { description: msg });
    } finally {
      setBusy(false);
    }
  };

  if (!hashChecked || loading || (!user && !sessionError)) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--cream)]">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--ink)]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--cream)] px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <BrandLogo />
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-white p-7 shadow-sm">
          <div className="mb-5 flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--indigo,#2A2A8C)]/10 text-[var(--indigo,#2A2A8C)]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <p className="overline">— Bienvenue</p>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-[var(--ink)]">
            Crée ton mot de passe
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {canSkip
              ? "Tu pourras te reconnecter avec ton mot de passe ou avec un lien magique."
              : "En tant que " +
                (roles.includes("admin") ? "administrateur" : "chef de chantier") +
                ", un mot de passe est obligatoire pour sécuriser ton accès."}
          </p>

          {sessionError && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {sessionError}
            </div>
          )}

          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="pwd" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Nouveau mot de passe
              </Label>
              <Input
                id="pwd" type="password" autoComplete="new-password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); if (pwdError) setPwdError(null); }}
                aria-invalid={!!pwdError}
                className="h-11 rounded-xl"
              />
              {pwdError ? (
                <p className="text-xs text-red-600">{pwdError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">8 caractères minimum.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pwd2" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Confirmation
              </Label>
              <Input
                id="pwd2" type="password" autoComplete="new-password"
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); if (confirmError) setConfirmError(null); }}
                aria-invalid={!!confirmError}
                className="h-11 rounded-xl"
              />
              {confirmError && <p className="text-xs text-red-600">{confirmError}</p>}
            </div>
            <Button
              type="submit"
              disabled={busy}
              className="group h-11 w-full rounded-xl bg-[var(--indigo,#2A2A8C)] text-white hover:bg-[var(--indigo,#2A2A8C)]/90"
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
              Créer mon compte
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Button>

            {canSkip && (
              <Button type="button" variant="ghost" onClick={onSkip} disabled={busy}
                className="h-10 w-full rounded-xl text-sm text-muted-foreground hover:text-[var(--ink)]">
                Passer (utiliser le lien magique uniquement)
              </Button>
            )}
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Setup Paris — 🏗️ Constructeur d'imaginaire
        </p>
      </div>
    </div>
  );
}
