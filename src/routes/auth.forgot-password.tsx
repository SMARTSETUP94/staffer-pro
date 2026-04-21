import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Loader2, Mail, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendPasswordReset } from "@/lib/auth-actions";
import { readServerFnError } from "@/lib/server-fn-error";
import { toast } from "sonner";
import { BrandLogo } from "@/components/BrandLogo";

export const Route = createFileRoute("/auth/forgot-password")({
  head: () => ({
    meta: [
      { title: "Mot de passe oublié — Setup Paris" },
      { name: "description", content: "Réinitialise ton mot de passe Setup Paris." },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await sendPasswordReset({
        data: {
          email: email.trim(),
          redirectOrigin: window.location.origin,
        },
      });
      if (!r.ok) throw new Error(r.error);
      setDone(true);
    } catch (e) {
      const msg = await readServerFnError(e);
      toast.error("Erreur", { description: msg });
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
          {done ? (
            <>
              <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--ink)]">Email envoyé</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Si <strong>{email}</strong> correspond à un compte, tu recevras un lien de réinitialisation
                d'ici quelques minutes. Le lien est valable 1 heure.
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                Pense à vérifier tes spams.
              </p>
              <Link to="/login"
                className="mt-6 inline-flex items-center gap-2 text-sm text-[var(--indigo,#2A2A8C)] hover:underline">
                <ArrowLeft className="h-4 w-4" /> Retour à la connexion
              </Link>
            </>
          ) : (
            <>
              <div className="mb-4 flex items-center gap-2">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--indigo,#2A2A8C)]/10 text-[var(--indigo,#2A2A8C)]">
                  <Mail className="h-5 w-5" />
                </div>
                <p className="overline">— Réinitialisation</p>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--ink)]">
                Mot de passe oublié ?
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Entre ton email — on t'envoie un lien pour en créer un nouveau.
              </p>

              <form onSubmit={onSubmit} className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Email
                  </Label>
                  <Input
                    id="email" type="email" required value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="prenom@setup.paris"
                    className="h-11 rounded-xl"
                  />
                </div>
                <Button type="submit" disabled={busy}
                  className="group h-11 w-full rounded-xl bg-[var(--indigo,#2A2A8C)] text-white hover:bg-[var(--indigo,#2A2A8C)]/90">
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Envoyer le lien
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Button>
              </form>

              <Link to="/login"
                className="mt-5 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-[var(--ink)]">
                <ArrowLeft className="h-4 w-4" /> Retour à la connexion
              </Link>
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
