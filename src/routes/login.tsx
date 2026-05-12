import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Loader2, Mail, KeyRound, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { BrandLogo } from "@/components/BrandLogo";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Connexion — Setup Paris" },
      { name: "description", content: "Accès à l'outil interne de planning chantiers Setup Paris." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { user, loading, signIn, signInWithMagicLink } = useAuth();
  const [tab, setTab] = useState<"signin" | "magic">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [magicSent, setMagicSent] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/" });
  }, [loading, user, navigate]);

  // Nettoyage automatique des tokens Supabase expirés au mount de la page login.
  // Évite que des refresh tokens corrompus/périmés bloquent silencieusement le signIn.
  useEffect(() => {
    try {
      const now = Math.floor(Date.now() / 1000);
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw);
          const expiresAt = typeof parsed?.expires_at === "number" ? parsed.expires_at : null;
          if (expiresAt !== null && expiresAt < now) {
            localStorage.removeItem(key);
            console.warn("[login] cleared expired auth token:", key);
          }
        } catch {
          // token corrompu : on l'efface aussi
          localStorage.removeItem(key);
        }
      }
    } catch (err) {
      console.warn("[login] token cleanup failed", err);
    }
  }, []);

  const onSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await signIn(email, password);
      if (error) {
        toast.error("Connexion impossible", { description: error });
      } else {
        toast.success("Connecté");
        navigate({ to: "/" });
      }
    } catch (err) {
      console.error("[login] signIn threw", err);
      const message = err instanceof Error ? err.message : "Erreur inconnue, réessaie.";
      toast.error("Connexion impossible", { description: message });
    } finally {
      setBusy(false);
    }
  };

  const onMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await signInWithMagicLink(email);
      if (error) toast.error("Envoi impossible", { description: error });
      else setMagicSent(true);
    } catch (err) {
      console.error("[login] magic link threw", err);
      const message = err instanceof Error ? err.message : "Erreur inconnue, réessaie.";
      toast.error("Envoi impossible", { description: message });
    } finally {
      setBusy(false);
    }
  };

  // Self-signup désactivé : seuls les admins peuvent inviter (chef d'équipe par défaut),
  // les employés sont créés via leur fiche employé et invités séparément.


  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.2fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[var(--ink)] p-8 text-[var(--cream)] lg:flex">
        <BrandLogo tone="cream" />
        <div className="space-y-3">
          <p className="overline text-primary/90">— 01 / Outil interne</p>
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-[var(--cream)]">Planning chantiers</h1>
          <p className="max-w-sm text-sm leading-relaxed text-[var(--cream)]/60">
            Staffing par demi-journée, suivi des heures devis, validation terrain.
          </p>
        </div>
        <p className="text-xs text-[var(--cream)]/40">Accès réservé aux équipes Setup Paris.</p>
      </aside>

      <main className="flex items-center justify-center bg-background p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-6 lg:hidden"><BrandLogo /></div>
          <p className="overline mb-2">— 02 / Accès</p>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Connexion</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Identifiez-vous pour accéder au planning et aux affaires.
          </p>

          <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
            <Tabs value={tab} onValueChange={(v) => { setMagicSent(false); setTab(v as "signin" | "magic"); }}>
              <TabsList className="grid w-full grid-cols-2 rounded-xl bg-muted">
                <TabsTrigger value="signin" className="rounded-lg text-xs"><KeyRound className="mr-1 h-3.5 w-3.5" />Mot de passe</TabsTrigger>
                <TabsTrigger value="magic" className="rounded-lg text-xs"><Mail className="mr-1 h-3.5 w-3.5" />Lien magique</TabsTrigger>
              </TabsList>

              <TabsContent value="signin" className="mt-6">
                <form onSubmit={onSignIn} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</Label>
                    <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom@setup.paris" className="h-11 rounded-xl" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mot de passe</Label>
                      <Link to="/auth/forgot-password" className="text-xs text-[var(--indigo,#2A2A8C)] hover:underline">Oublié ?</Link>
                    </div>
                    <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 rounded-xl" />
                  </div>
                  <Button type="submit" disabled={busy} className="group h-11 w-full rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Se connecter
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="magic" className="mt-6">
                {magicSent ? (
                  <div className="flex flex-col items-center text-center py-4">
                    <div className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-6 w-6" /></div>
                    <p className="text-sm font-medium text-foreground">Email envoyé</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Un lien de connexion a été envoyé à <strong>{email}</strong>. Pense à vérifier tes spams.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={onMagicLink} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="email-magic" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</Label>
                      <Input id="email-magic" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom@setup.paris" className="h-11 rounded-xl" />
                      <p className="text-xs text-muted-foreground">Tu recevras un lien de connexion par email — pas besoin de mot de passe.</p>
                    </div>
                    <Button type="submit" disabled={busy} className="group h-11 w-full rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
                      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                      Envoyer le lien magique
                    </Button>
                  </form>
                )}
              </TabsContent>

              <TabsContent value="signup" className="mt-6">
                <form onSubmit={onSignUp} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="fullName" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nom complet</Label>
                    <Input id="fullName" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Prénom Nom" className="h-11 rounded-xl" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email-up" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</Label>
                    <Input id="email-up" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom@setup.paris" className="h-11 rounded-xl" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password-up" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mot de passe</Label>
                    <Input id="password-up" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 rounded-xl" />
                    <p className="text-xs text-muted-foreground">8 caractères minimum.</p>
                  </div>
                  <Button type="submit" disabled={busy} className="group h-11 w-full rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Créer le compte
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Rôle par défaut : employé. L'admin assigne ensuite chef de chantier ou admin.
                  </p>
                </form>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
    </div>
  );
}
