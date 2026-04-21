import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LogOut, User } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { usePreview } from "@/lib/preview-context";
import { PreviewBanner } from "@/components/PreviewBanner";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/mobile/profil")({
  head: () => ({ meta: [{ title: "Profil — Setup Paris" }] }),
  component: MobileProfil,
});

function MobileProfil() {
  const { user, roles, signOut } = useAuth();
  const { isPreviewing, setPreviewRole } = usePreview();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <PreviewBanner />
      <header className="border-b border-border bg-card px-4 py-4">
        <div className="mx-auto max-w-md">
          <p className="overline">— Profil</p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-foreground">
            Mon compte
          </h1>
        </div>
      </header>
      <main className="mx-auto max-w-md space-y-4 px-4 py-6">
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {user?.email}
              </p>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                {roles[0] ?? "employe"}
              </p>
            </div>
          </div>
        </section>

        {isPreviewing ? (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setPreviewRole(null)}
          >
            Quitter le mode prévisualisation
          </Button>
        ) : (
          <Button
            variant="outline"
            className="w-full justify-center gap-2"
            onClick={() => signOut()}
          >
            <LogOut className="h-4 w-4" />
            Se déconnecter
          </Button>
        )}
      </main>
      <MobileBottomNav />
    </div>
  );
}
