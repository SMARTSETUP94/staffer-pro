// v0.35.x — Matrice compétences employés × métiers (admin/chef) — 4 niveaux
// Cellule : badge cliquable cyclant Aucun → Secondaire (S) → Dépannage (D) → Bloqué (X) → Aucun
// "Principal" (P) = lecture seule (verrouillé sur fiche employé : metier_principal_id).
// Sauvegarde immédiate au clic + toast.
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useMetiers } from "@/hooks/use-metiers";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/parametres/competences-equipe")({
  head: () => ({ meta: [{ title: "Compétences équipe — Paramètres" }] }),
  component: CompetencesEquipePage,
});

interface Emp {
  id: string;
  prenom: string;
  nom: string;
  type_contrat: string;
  metier_principal_id: number;
  actif: boolean;
  non_staffing: boolean;
}

type Niveau = "secondaire" | "depannage" | "bloque";
type Cell = Niveau | null; // null = aucun

const CYCLE: Cell[] = [null, "secondaire", "depannage", "bloque"];
function nextNiveau(cur: Cell): Cell {
  const i = CYCLE.indexOf(cur);
  return CYCLE[(i + 1) % CYCLE.length];
}

function CellBadge({ niveau, isPrincipal }: { niveau: Cell; isPrincipal: boolean }) {
  if (isPrincipal) {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">
        P
      </span>
    );
  }
  if (niveau === null) {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-dashed border-border/60 text-[11px] text-muted-foreground/50">
        ·
      </span>
    );
  }
  if (niveau === "secondaire") {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/15 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
        S
      </span>
    );
  }
  if (niveau === "depannage") {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/20 text-[11px] font-bold text-amber-700 dark:text-amber-300">
        D
      </span>
    );
  }
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-destructive/20 text-[11px] font-bold text-destructive">
      X
    </span>
  );
}

function CompetencesEquipePage() {
  const { isAdminOrChef, rolesLoaded } = useAuth();
  const { metiers, loading: metiersLoading } = useMetiers();
  const [emps, setEmps] = useState<Emp[]>([]);
  /** matrix[empId][metierId] = niveau (omis si null) */
  const [matrix, setMatrix] = useState<Record<string, Record<number, Niveau>>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [dropdownMode, setDropdownMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("competencesEquipe.dropdownMode") === "1";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("competencesEquipe.dropdownMode", dropdownMode ? "1" : "0");
    }
  }, [dropdownMode]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: e } = await supabase
        .from("employes")
        .select("id, prenom, nom, type_contrat, metier_principal_id, actif, non_staffing")
        .eq("actif", true)
        .eq("non_staffing", false)
        .order("nom", { ascending: true });
      const { data: em } = await supabase
        .from("employe_metiers")
        .select("employe_id, metier_id, niveau");
      if (cancelled) return;
      const m: Record<string, Record<number, Niveau>> = {};
      for (const row of em ?? []) {
        const eid = row.employe_id as string;
        const mid = row.metier_id as number;
        const niv = ((row as { niveau?: Niveau }).niveau ?? "secondaire") as Niveau;
        if (!m[eid]) m[eid] = {};
        m[eid][mid] = niv;
      }
      setEmps((e ?? []) as Emp[]);
      setMatrix(m);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setNiveauCell = async (empId: string, metierId: number, nxt: Cell) => {
    const cur = matrix[empId]?.[metierId] ?? null;
    if (cur === nxt) return;
    const key = `${empId}:${metierId}`;
    setSavingKey(key);

    // Optimistic update
    setMatrix((prev) => {
      const next = { ...prev };
      const row = { ...(next[empId] ?? {}) };
      if (nxt === null) delete row[metierId];
      else row[metierId] = nxt;
      next[empId] = row;
      return next;
    });

    try {
      const { error: delErr } = await supabase
        .from("employe_metiers")
        .delete()
        .eq("employe_id", empId)
        .eq("metier_id", metierId);
      if (delErr) throw delErr;
      if (nxt !== null) {
        const { error: insErr } = await supabase
          .from("employe_metiers")
          .insert({ employe_id: empId, metier_id: metierId, niveau: nxt });
        if (insErr) throw insErr;
      }
    } catch (err) {
      // Rollback
      setMatrix((prev) => {
        const next = { ...prev };
        const row = { ...(next[empId] ?? {}) };
        if (cur === null) delete row[metierId];
        else row[metierId] = cur;
        next[empId] = row;
        return next;
      });
      toast.error(err instanceof Error ? err.message : "Erreur sauvegarde");
    } finally {
      setSavingKey(null);
    }
  };

  const cycleCell = (empId: string, metierId: number) => {
    const cur = matrix[empId]?.[metierId] ?? null;
    return setNiveauCell(empId, metierId, nextNiveau(cur));
  };

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return emps;
    return emps.filter((e) => `${e.prenom} ${e.nom}`.toLowerCase().includes(q));
  }, [emps, filter]);

  if (!rolesLoaded) return null;
  if (!isAdminOrChef) return <Navigate to="/dashboard" />;

  return (
    <div className="space-y-4 px-2 py-4 md:px-6">
      <div>
        <p className="overline">— Paramétrage</p>
        <h1 className="text-2xl font-bold text-foreground">Compétences équipe</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Matrice 4 niveaux par cellule. Le métier principal (<span className="font-bold text-primary">P</span>) est défini sur la fiche employé. Cliquez une cellule pour cycler :
          <span className="mx-1 inline-flex items-center gap-1">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-emerald-500/15 text-[9px] font-bold text-emerald-700">S</span> Secondaire
          </span>
          →
          <span className="mx-1 inline-flex items-center gap-1">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-amber-500/20 text-[9px] font-bold text-amber-700">D</span> Dépannage
          </span>
          →
          <span className="mx-1 inline-flex items-center gap-1">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-destructive/20 text-[9px] font-bold text-destructive">X</span> Bloqué
          </span>
          → vide.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base">Matrice</CardTitle>
            <CardDescription>
              {emps.length} employés actifs · {metiers.length} métiers — sauvegarde immédiate
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Rechercher…"
                className="pl-7 h-8 w-48"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {loading || metiersLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <Loader2 className="inline h-4 w-4 animate-spin mr-1" /> Chargement…
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-card z-10 min-w-[180px]">Employé</TableHead>
                  <TableHead className="text-xs">Contrat</TableHead>
                  {metiers.map((m) => (
                    <TableHead key={m.id} className="text-center text-xs">
                      {m.libelle}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="sticky left-0 bg-card font-medium">
                      {e.prenom} {e.nom}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{e.type_contrat}</Badge>
                    </TableCell>
                    {metiers.map((m) => {
                      const isPrincipal = m.id === e.metier_principal_id;
                      const niveau: Cell = matrix[e.id]?.[m.id] ?? null;
                      const key = `${e.id}:${m.id}`;
                      const isSaving = savingKey === key;
                      return (
                        <TableCell key={m.id} className="text-center">
                          <button
                            type="button"
                            disabled={isPrincipal || isSaving}
                            onClick={() => cycleCell(e.id, m.id)}
                            className="inline-flex items-center justify-center disabled:cursor-not-allowed"
                            aria-label={`${e.prenom} ${e.nom} — ${m.libelle} — ${
                              isPrincipal ? "Principal" : niveau ?? "Aucun"
                            }`}
                            title={
                              isPrincipal
                                ? "Métier principal (verrouillé)"
                                : `Cliquer pour changer (actuel : ${niveau ?? "aucun"})`
                            }
                          >
                            {isSaving ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                            ) : (
                              <CellBadge niveau={niveau} isPrincipal={isPrincipal} />
                            )}
                          </button>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={metiers.length + 2} className="text-center text-sm text-muted-foreground py-6">
                      Aucun employé trouvé
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="rounded-2xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
        <p className="font-semibold text-foreground">Impact auto-staffing :</p>
        <ul className="list-disc pl-5 space-y-0.5">
          <li><span className="font-bold text-primary">P</span> Principal CDI/CDD → Tier 1 (score 100)</li>
          <li><span className="font-bold text-emerald-600">S</span> Secondaire CDI/CDD → Tier 2 (score 70)</li>
          <li>Intérim Principal/Secondaire → Tier 3 (score 30)</li>
          <li><span className="font-bold text-amber-600">D</span> Dépannage CDI/CDD → Tier 4 (score 10, dernier recours pour pic de charge)</li>
          <li><span className="font-bold text-destructive">X</span> Bloqué → exclu du staffing pour ce métier</li>
        </ul>
      </div>
    </div>
  );
}
