import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
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
  const { user, loading, signIn, signUp } = useAuth();
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/" });
  }, [loading, user, navigate]);

  const onSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) toast.error("Connexion impossible", { description: error });
    else {
      toast.success("Connecté");
      navigate({ to: "/" });
    }
  };

  const onSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await signUp(email, password, fullName);
    setBusy(false);
    if (error) toast.error("Inscription impossible", { description: error });
    else {
      toast.success("Compte créé", { description: "Vous pouvez vous connecter." });
      setTab("signin");
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.2fr]">
      {/* Colonne gauche — identité outil, sobre */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[var(--ink)] p-8 text-[var(--cream)] lg:flex">
        <BrandLogo tone="cream" />

        <div className="space-y-3">
          <p className="overline text-primary/90">— 01 / Outil interne</p>
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-[var(--cream)]">
            Planning chantiers
          </h1>
          <p className="max-w-sm text-sm leading-relaxed text-[var(--cream)]/60">
            Staffing par demi-journée, suivi des heures devis, validation terrain.
          </p>
        </div>

        <p className="text-xs text-[var(--cream)]/40">
          Accès réservé aux équipes Setup Paris.
        </p>
      </aside>

      {/* Colonne droite — formulaire */}
      <main className="flex items-center justify-center bg-background p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-6 lg:hidden">
            <BrandLogo />
          </div>

          <p className="overline mb-2">— 02 / Accès</p>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            Connexion
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Identifiez-vous pour accéder au planning et aux affaires.
          </p>

          <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
            <Tabs value={tab} onValueChange={(v) => setTab(v as "signin" | "signup")}>
              <TabsList className="grid w-full grid-cols-2 rounded-xl bg-muted">
                <TabsTrigger value="signin" className="rounded-lg">Connexion</TabsTrigger>
                <TabsTrigger value="signup" className="rounded-lg">Créer un compte</TabsTrigger>
              </TabsList>

              <TabsContent value="signin" className="mt-6">
                <form onSubmit={onSignIn} className="space-y-4">
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
                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Mot de passe
                    </Label>
                    <Input
                      id="password" type="password" required value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-11 rounded-xl"
                    />
                  </div>
                  <Button type="submit" disabled={busy}
                    className="group h-11 w-full rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Se connecter
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-6">
                <form onSubmit={onSignUp} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="fullName" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Nom complet
                    </Label>
                    <Input
                      id="fullName" required value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Prénom Nom"
                      className="h-11 rounded-xl"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email-up" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Email
                    </Label>
                    <Input
                      id="email-up" type="email" required value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="prenom@setup.paris"
                      className="h-11 rounded-xl"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password-up" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Mot de passe
                    </Label>
                    <Input
                      id="password-up" type="password" required minLength={6} value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-11 rounded-xl"
                    />
                    <p className="text-xs text-muted-foreground">6 caractères minimum.</p>
                  </div>
                  <Button type="submit" disabled={busy}
                    className="group h-11 w-full rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
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
