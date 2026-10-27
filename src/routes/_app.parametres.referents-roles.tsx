import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { requireCapability } from "@/lib/capability-guard";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { PROJET_ROLE_LABELS, REFERENT_NIVEAU_LABELS, type ProjetRole, type ReferentNiveau } from "@/lib/labels";
import { PROJET_ROLES, nomComplet } from "@/lib/equipe-projet";
import { matchesOpportunityKeywords } from "@/lib/opportunite-search";
import { useEmployesActifs, useRoleReferents } from "@/hooks/use-equipe-projet";

export const Route = createFileRoute("/_app/parametres/referents-roles")({
  beforeLoad: () => requireCapability("section.admin"),
  head: () => ({
    meta: [
      { title: "Référents par rôle — Setup Paris" },
      { name: "description", content: "Matrice des référents principaux et secondaires pour chaque rôle de l'équipe projet." },
    ],
  }),
  component: ReferentsRolesPage,
});

type Valeur = ReferentNiveau | "aucun";
const CYCLE: Valeur[] = ["aucun", "principal", "secondaire"];

function ReferentsRolesPage() {
  const qc = useQueryClient();
  const { data: employes = [] } = useEmployesActifs();
  const { data: referents = [] } = useRoleReferents();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const map = useMemo(() => new Map(referents.map((r) => [`${r.employe_id}|${r.role}`, r])), [referents]);
  const lignes = useMemo(() => employes
    .filter((e) => matchesOpportunityKeywords([nomComplet(e)], q))
    .sort((a, b) => {
      const na = referents.filter((r) => r.employe_id === a.id).length, nb = referents.filter((r) => r.employe_id === b.id).length;
      return (nb > 0 ? 1 : 0) - (na > 0 ? 1 : 0) || nomComplet(a).localeCompare(nomComplet(b), "fr");
    }), [employes, referents, q]);

  async function set(employeId: string, role: ProjetRole, next: Valeur) {
    const key = `${employeId}|${role}`;
    setBusy(key);
    const existing = map.get(key);
    const res = next === "aucun"
      ? existing ? await supabase.from("role_referents").delete().eq("id", existing.id) : { error: null }
      : await supabase.from("role_referents").upsert({ employe_id: employeId, role, niveau: next }, { onConflict: "employe_id,role" });
    setBusy(null);
    if (res.error) { toast.error("Enregistrement impossible", { description: res.error.message }); return; }
    await qc.invalidateQueries({ queryKey: ["role-referents"] });
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader title="Référents par rôle" description="Principaux et secondaires proposés en premier dans les sélecteurs de l'équipe projet. Cliquer une case pour changer : aucun → principal → secondaire." />
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Rechercher une personne…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-48">Personne</TableHead>
              {PROJET_ROLES.map((r) => <TableHead key={r} className="text-center text-xs">{PROJET_ROLE_LABELS[r]}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lignes.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{nomComplet(e)}</TableCell>
                {PROJET_ROLES.map((role) => {
                  const key = `${e.id}|${role}`;
                  const v: Valeur = map.get(key)?.niveau ?? "aucun";
                  const next = CYCLE[(CYCLE.indexOf(v) + 1) % CYCLE.length];
                  return (
                    <TableCell key={role} className="text-center">
                      <button type="button" disabled={busy === key} onClick={() => void set(e.id, role, next)}
                        aria-label={`${nomComplet(e)} — ${PROJET_ROLE_LABELS[role]} : ${v === "aucun" ? "aucun" : REFERENT_NIVEAU_LABELS[v]}`}
                        className={cn("min-w-20 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                          v === "principal" && "border-primary bg-primary text-primary-foreground",
                          v === "secondaire" && "border-primary/40 bg-primary/10 text-primary",
                          v === "aucun" && "border-border text-muted-foreground hover:bg-muted")}>
                        {v === "aucun" ? "—" : REFERENT_NIVEAU_LABELS[v]}
                      </button>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
