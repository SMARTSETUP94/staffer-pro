// v0.48 Bloc 5 — Onglet Équipe : historique des personnes mobilisées sur l'affaire
// Lot 7.0b — gating via capability `affaire.equipe.view` (beforeLoad).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Users, Crown, AlertCircle, UserMinus, ArrowUpDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { requireCapability } from "@/lib/capability-guard";
import { cn } from "@/lib/utils";

interface Row {
  employe_id: string;
  chef_id: string;
  type_contrat: string | null;
  nb_demi_jours: number;
  nb_jours_distincts: number;
  premier_jour: string | null;
  dernier_jour: string | null;
  presence_pct_moyen: number;
  a_refuse: boolean;
  a_ete_absent: boolean;
  derniere_assignation_at: string | null;
  employe?: { id: string; nom: string; prenom: string; poste_principal: string | null };
  chef?: { id: string; nom: string; prenom: string };
}

export const Route = createFileRoute("/_app/affaires/$affaireId/equipe")({
  head: () => ({ meta: [{ title: "Équipe — Setup Paris" }] }),
  component: AffaireEquipePage,
});

function AffaireEquipePage() {
  const { affaireId } = Route.useParams();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"jours" | "recent" | "nom">("jours");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: histo } = await supabase
        .from("affaire_equipe_historique")
        .select(
          "employe_id, chef_id, type_contrat, nb_demi_jours, nb_jours_distincts, premier_jour, dernier_jour, presence_pct_moyen, a_refuse, a_ete_absent, derniere_assignation_at",
        )
        .eq("affaire_id", affaireId);
      const ids = Array.from(
        new Set([...(histo ?? []).map((r: any) => r.employe_id), ...(histo ?? []).map((r: any) => r.chef_id)]),
      );
      const { data: emps } = ids.length
        ? await supabase.from("employes").select("id, nom, prenom, poste_principal").in("id", ids)
        : { data: [] as any[] };
      const empMap = new Map((emps ?? []).map((e: any) => [e.id, e]));
      if (cancelled) return;
      setRows(
        ((histo ?? []) as any[]).map((r) => ({
          ...r,
          employe: empMap.get(r.employe_id),
          chef: empMap.get(r.chef_id),
        })) as Row[],
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [affaireId]);


  const sorted = useMemo(() => {
    const r = [...rows];
    if (sortBy === "jours") r.sort((a, b) => b.nb_demi_jours - a.nb_demi_jours);
    else if (sortBy === "recent")
      r.sort((a, b) => (b.derniere_assignation_at ?? "").localeCompare(a.derniere_assignation_at ?? ""));
    else
      r.sort((a, b) =>
        `${a.employe?.nom ?? ""} ${a.employe?.prenom ?? ""}`.localeCompare(
          `${b.employe?.nom ?? ""} ${b.employe?.prenom ?? ""}`,
        ),
      );
    return r;
  }, [rows, sortBy]);

  const chefsUniques = useMemo(() => {
    const map = new Map<string, { id: string; nom: string; prenom: string }>();
    for (const r of rows) if (r.chef) map.set(r.chef.id, r.chef);
    return Array.from(map.values());
  }, [rows]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
        <Users className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-2 text-sm font-semibold text-foreground">Aucune équipe encore mobilisée</p>
        <p className="mt-1 text-xs text-muted-foreground">
          L'historique se remplit automatiquement dès qu'une assignation est validée sur ce chantier.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* En-tête KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Personnes mobilisées" value={rows.length} icon={<Users className="h-4 w-4" />} />
        <Stat label="Chefs impliqués" value={chefsUniques.length} icon={<Crown className="h-4 w-4" />} />
        <Stat
          label="Refus"
          value={rows.filter((r) => r.a_refuse).length}
          icon={<AlertCircle className="h-4 w-4" />}
          tone={rows.some((r) => r.a_refuse) ? "warn" : "neutral"}
        />
        <Stat
          label="Absences"
          value={rows.filter((r) => r.a_ete_absent).length}
          icon={<UserMinus className="h-4 w-4" />}
          tone={rows.some((r) => r.a_ete_absent) ? "warn" : "neutral"}
        />
      </div>

      {/* Chefs */}
      {chefsUniques.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Chefs de chantier</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {chefsUniques.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
              >
                <Crown className="h-3 w-3" /> {c.prenom} {c.nom}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tri */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground">Équipe ({rows.length})</h3>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5">
          <SortBtn active={sortBy === "jours"} onClick={() => setSortBy("jours")}>
            <ArrowUpDown className="mr-1 h-3 w-3" /> Volume
          </SortBtn>
          <SortBtn active={sortBy === "recent"} onClick={() => setSortBy("recent")}>
            Récent
          </SortBtn>
          <SortBtn active={sortBy === "nom"} onClick={() => setSortBy("nom")}>
            Nom
          </SortBtn>
        </div>
      </div>

      {/* Liste */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Employé</th>
              <th className="px-3 py-2 text-left font-semibold">Poste</th>
              <th className="px-3 py-2 text-left font-semibold">Contrat</th>
              <th className="px-3 py-2 text-right font-semibold">½ jours</th>
              <th className="px-3 py-2 text-right font-semibold">Jours</th>
              <th className="px-3 py-2 text-right font-semibold">Présence</th>
              <th className="px-3 py-2 text-center font-semibold">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((r) => (
              <tr key={r.employe_id} className="hover:bg-muted/30">
                <td className="px-3 py-2">
                  <Link
                    to="/admin/employes-poste-principal"
                    className="font-semibold text-foreground hover:text-primary"
                  >
                    {r.employe?.prenom} {r.employe?.nom}
                  </Link>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {r.employe?.poste_principal ?? "—"}
                </td>
                <td className="px-3 py-2 text-xs">
                  {r.type_contrat ? (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 font-semibold",
                        r.type_contrat === "CDI" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
                        r.type_contrat === "CDD" && "bg-sky-500/15 text-sky-700 dark:text-sky-400",
                        r.type_contrat === "Intérim" && "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                      )}
                    >
                      {r.type_contrat}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{r.nb_demi_jours}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{r.nb_jours_distincts}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  {Math.round(Number(r.presence_pct_moyen))}%
                </td>
                <td className="px-3 py-2 text-center">
                  <div className="flex items-center justify-center gap-1">
                    {r.a_refuse && (
                      <span title="A refusé" className="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-bold text-destructive">
                        REFUS
                      </span>
                    )}
                    {r.a_ete_absent && (
                      <span title="A été absent" className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                        ABS
                      </span>
                    )}
                    {!r.a_refuse && !r.a_ete_absent && (
                      <span className="text-[10px] text-muted-foreground">OK</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: "neutral" | "warn";
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5">
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 text-xl font-bold tabular-nums",
          tone === "warn" && value > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function SortBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold transition",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
