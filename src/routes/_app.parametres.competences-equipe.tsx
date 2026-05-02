// v0.35.x — Matrice compétences employés × métiers (admin/chef).
// Source : table employe_metiers (métiers secondaires). Le métier principal est
// affiché en lecture seule (badge primary) et toujours coché.
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Save, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useMetiers } from "@/hooks/use-metiers";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

function CompetencesEquipePage() {
  const { isAdminOrChef, rolesLoaded } = useAuth();
  const { metiers, loading: metiersLoading } = useMetiers();
  const [emps, setEmps] = useState<Emp[]>([]);
  const [matrix, setMatrix] = useState<Record<string, Set<number>>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");

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
        .select("employe_id, metier_id");
      if (cancelled) return;
      const m: Record<string, Set<number>> = {};
      for (const row of em ?? []) {
        const eid = row.employe_id as string;
        if (!m[eid]) m[eid] = new Set();
        m[eid].add(row.metier_id as number);
      }
      setEmps((e ?? []) as Emp[]);
      setMatrix(m);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (empId: string, metierId: number, checked: boolean) => {
    setMatrix((prev) => {
      const next = { ...prev };
      const s = new Set(next[empId] ?? []);
      if (checked) s.add(metierId);
      else s.delete(metierId);
      next[empId] = s;
      return next;
    });
    setDirty((d) => new Set(d).add(empId));
  };

  const save = async () => {
    if (dirty.size === 0) return;
    setSaving(true);
    try {
      const ids = Array.from(dirty);
      // Stratégie simple : delete + reinsert pour les employés modifiés
      const { error: delErr } = await supabase
        .from("employe_metiers")
        .delete()
        .in("employe_id", ids);
      if (delErr) throw delErr;
      const rows: { employe_id: string; metier_id: number }[] = [];
      for (const eid of ids) {
        const emp = emps.find((x) => x.id === eid);
        const set = matrix[eid] ?? new Set();
        for (const mid of set) {
          // ne pas dupliquer le métier principal (déjà géré ailleurs)
          if (emp && mid === emp.metier_principal_id) continue;
          rows.push({ employe_id: eid, metier_id: mid });
        }
      }
      if (rows.length > 0) {
        const { error: insErr } = await supabase.from("employe_metiers").insert(rows);
        if (insErr) throw insErr;
      }
      toast.success(`${dirty.size} employé${dirty.size > 1 ? "s" : ""} mis à jour`);
      setDirty(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur sauvegarde");
    } finally {
      setSaving(false);
    }
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
          Matrice employés × métiers secondaires. Le métier principal est en gras et
          toujours actif. Utilisé par l'auto-staffing pour le tier ranking (CDI &gt; CDD &gt; Intérim).
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base">Matrice</CardTitle>
            <CardDescription>
              {emps.length} employés actifs · {metiers.length} métiers
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
            <Button size="sm" onClick={save} disabled={saving || dirty.size === 0}>
              {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
              Enregistrer{dirty.size > 0 ? ` (${dirty.size})` : ""}
            </Button>
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
                {filtered.map((e) => {
                  const set = matrix[e.id] ?? new Set();
                  const isDirty = dirty.has(e.id);
                  return (
                    <TableRow key={e.id} className={isDirty ? "bg-amber-50 dark:bg-amber-950/20" : ""}>
                      <TableCell className="sticky left-0 bg-card font-medium">
                        {e.prenom} {e.nom}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{e.type_contrat}</Badge>
                      </TableCell>
                      {metiers.map((m) => {
                        const isPrincipal = m.id === e.metier_principal_id;
                        const checked = isPrincipal || set.has(m.id);
                        return (
                          <TableCell key={m.id} className="text-center">
                            <div className="flex items-center justify-center">
                              <Checkbox
                                checked={checked}
                                disabled={isPrincipal}
                                onCheckedChange={(v) => toggle(e.id, m.id, v === true)}
                                aria-label={`${e.prenom} ${e.nom} — ${m.libelle}`}
                              />
                              {isPrincipal && (
                                <span className="ml-1 text-[10px] font-bold text-primary">P</span>
                              )}
                            </div>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
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

      <p className="text-xs text-muted-foreground">
        Légende : <span className="font-bold text-primary">P</span> = métier principal (verrouillé,
        défini sur la fiche employé).
      </p>
    </div>
  );
}
