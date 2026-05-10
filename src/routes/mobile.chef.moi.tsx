/**
 * v0.43.0 Sprint 1 — Onglet "Moi" du Hub chef mobile.
 * Composition de mes-heures-perso + profil + accès rapide contrats.
 * Réutilise les composants du hub employé (zéro duplication).
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { addDays, format, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, FileSignature, LogOut, User as UserIcon, Clock } from "lucide-react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { ChefMobileHeader } from "@/components/mobile-chef/ChefMobileHeader";
import { useAuth } from "@/lib/auth-context";
import { useResolvedEmploye } from "@/hooks/use-resolved-employe";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MesHeuresGrid } from "@/components/heures/MesHeuresGrid";

export const Route = createFileRoute("/mobile/chef/moi")({
  head: () => ({ meta: [{ title: "Hub chef — Moi" }] }),
  component: () => (
    <RoleGuard required="chef_or_admin">
      <ChefMoi />
    </RoleGuard>
  ),
});

function ChefMoi() {
  const { user, roles, signOut } = useAuth();
  const { employeId } = useResolvedEmploye();
  const navigate = useNavigate();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  return (
    <>
      <ChefMobileHeader title="Moi" />
      <div className="mx-auto max-w-xl space-y-4 p-4">
        {/* Profil compact */}
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <UserIcon className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{user?.email}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                {roles[0] ?? "chef_chantier"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Mes heures perso */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
              <Clock className="h-4 w-4" /> Mes heures
            </h2>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setWeekStart((w) => addDays(w, -7))}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs font-semibold tabular-nums">
                {format(weekStart, "d MMM", { locale: fr })}–{format(weekEnd, "d MMM", { locale: fr })}
              </span>
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setWeekStart((w) => addDays(w, 7))}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          {employeId ? (
            <MesHeuresGrid weekStart={weekStart} variant="mobile" employeIdOverride={employeId} />
          ) : (
            <Card><CardContent className="p-4 text-sm text-muted-foreground">Profil employé introuvable.</CardContent></Card>
          )}
        </section>

        {/* Accès rapide contrats */}
        <Link to="/mobile/chef/contrats" className="block">
          <Card className="hover:bg-accent transition-colors">
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <FileSignature className="h-4 w-4" /> Mes contrats
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>

        <Button variant="outline" className="w-full justify-center gap-2" onClick={handleSignOut}>
          <LogOut className="h-4 w-4" /> Se déconnecter
        </Button>
      </div>
    </>
  );
}
