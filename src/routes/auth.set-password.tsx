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

export const Route = createFileRoute("/auth/set-password")({
  head: () => ({
    meta: [
      { title: "Créer ton mot de passe — Setup Paris" },
      { name: "description", content: "Crée ton mot de passe pour accéder au planning Setup Paris." },
    ],
  }),
  component: SetPasswordPage,
});

function SetPasswordPage() {
  const navigate = useNavigate();
  const { user, roles, loading, rolesLoaded, refreshRoles } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  // Si pas connecté → vers login
  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  const isEmploye = rolesLoaded && roles.includes("employe") && !roles.includes("chef_chantier") && !roles.includes("admin");
  const canSkip = isEmploye;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Mot de passe trop court", { description: "8 caractères minimum." });
      return;
    }
    if (password !== confirm) {
      toast.error("Les mots de passe ne correspondent pas");
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
        // Pas bloquant pour l'UX (le password est posé)
      }
      await refreshRoles();
      toast.success("Mot de passe créé", { description: "Bienvenue chez Setup Paris !" });
      // Redirection explicite selon le rôle (évite de dépendre d'IndexRedirect + preview state)
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

  if (loading || !user) {
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

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pwd" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Nouveau mot de passe
              </Label>
              <Input
                id="pwd" type="password" autoComplete="new-password" required minLength={8}
                value={password} onChange={(e) => setPassword(e.target.value)}
                className="h-11 rounded-xl"
              />
              <p className="text-xs text-muted-foreground">8 caractères minimum.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pwd2" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Confirmation
              </Label>
              <Input
                id="pwd2" type="password" autoComplete="new-password" required minLength={8}
                value={confirm} onChange={(e) => setConfirm(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
            <Button
              type="submit"
              disabled={busy}
              onClick={(e) => {
                // Filet de sécurité : si pour une raison quelconque le submit du form
                // ne se déclenche pas (Slot/Radix, autoComplete bloqué…), on appelle
                // explicitement le handler.
                if (!busy) {
                  // Laisser le submit natif se faire ; ne rien faire ici.
                  // Mais on log le clic pour débogage.
                  console.info("[set-password] click create account");
                }
              }}
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
