import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Loader2, KeyRound, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { markPasswordSet } from "@/lib/auth-actions";
import { withAuthRetry } from "@/lib/with-auth-retry";
import { toast } from "sonner";
import { BrandLogo } from "@/components/BrandLogo";

export const Route = createFileRoute("/auth/reset-password")({
  head: () => ({
    meta: [
      { title: "Nouveau mot de passe — Setup Paris" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState<boolean | null>(null);

  // Le lien recovery Supabase pose une session via l'event PASSWORD_RECOVERY
  useEffect(() => {
    let unsub: (() => void) | undefined;

    // 1. Listener pour PASSWORD_RECOVERY (lien fraîchement cliqué)
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (session && event === "SIGNED_IN")) {
        setHasRecoverySession(true);
      }
    });
    unsub = () => data.subscription.unsubscribe();

    // 2. Vérifie aussi la session existante (cas rafraîchissement de page)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setHasRecoverySession(true);
      else if (hasRecoverySession === null) setHasRecoverySession(false);
    });

    return () => unsub?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Lien expiré", { description: "Demande un nouveau lien depuis 'Mot de passe oublié'." });
        setHasRecoverySession(false);
        return;
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        console.error("[reset-password] updateUser error", error);
        toast.error("Impossible de mettre à jour le mot de passe", { description: error.message });
        return;
      }
      try {
        await withAuthRetry(() => markPasswordSet({ data: { skipped: false } }));
      } catch (err) {
        console.warn("[reset-password] markPasswordSet failed (non-blocking)", err);
      }
      toast.success("Mot de passe mis à jour");
      navigate({ to: "/" });
    } catch (err) {
      console.error("[reset-password] uncaught", err);
      toast.error("Erreur inattendue", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--cream)] px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <BrandLogo />
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-white p-7 shadow-sm">
          {hasRecoverySession === false ? (
            <>
              <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-warning/15 text-warning">
                <AlertCircle className="h-6 w-6" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--ink)]">Lien invalide ou expiré</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Ce lien de réinitialisation n'est plus valable. Demande-en un nouveau.
              </p>
              <Link to="/auth/forgot-password"
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[var(--indigo,#2A2A8C)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--indigo,#2A2A8C)]/90">
                Demander un nouveau lien
              </Link>
            </>
          ) : (
            <>
              <div className="mb-4 flex items-center gap-2">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--indigo,#2A2A8C)]/10 text-[var(--indigo,#2A2A8C)]">
                  <KeyRound className="h-5 w-5" />
                </div>
                <p className="overline">— Nouveau mot de passe</p>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--ink)]">
                Choisis un nouveau mot de passe
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Il sera utilisé à ta prochaine connexion.
              </p>

              <form onSubmit={onSubmit} className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="pwd" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Nouveau mot de passe
                  </Label>
                  <Input id="pwd" type="password" autoComplete="new-password" required minLength={8}
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    className="h-11 rounded-xl" />
                  <p className="text-xs text-muted-foreground">8 caractères minimum.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pwd2" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Confirmation
                  </Label>
                  <Input id="pwd2" type="password" autoComplete="new-password" required minLength={8}
                    value={confirm} onChange={(e) => setConfirm(e.target.value)}
                    className="h-11 rounded-xl" />
                </div>
                <Button type="submit" disabled={busy}
                  className="group h-11 w-full rounded-xl bg-[var(--indigo,#2A2A8C)] text-white hover:bg-[var(--indigo,#2A2A8C)]/90">
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Mettre à jour
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Button>
              </form>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Setup Paris — 🏗️ Constructeur d'imaginaire
        </p>
      </div>
    </div>
  );
}
