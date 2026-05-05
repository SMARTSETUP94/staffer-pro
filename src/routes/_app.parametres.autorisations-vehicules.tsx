// Sprint 3b.1 — Page admin : matrice employés × autorisations véhicules
// - Lignes : employés actifs (recherche + filtre)
// - Colonnes : 7 types d'autorisation (4 permis + 3 CACES)
// - Cellule : badge statut (valide / expiration_proche / expire / manquant)
// - Click cellule : ouvre la modale d'édition
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AutorisationVehiculeDialog } from "@/components/autorisations/AutorisationVehiculeDialog";
import {
  ALL_AUTORISATIONS,
  AUTORISATION_LABELS,
  AUTORISATION_SHORT,
  STATUT_BADGE_CLASS,
  STATUT_LABELS,
  joursAvantExpiration,
  statutFromExpiration,
  type AutorisationType,
  type AutorisationVehicule,
} from "@/lib/autorisations-vehicules";

export const Route = createFileRoute("/_app/parametres/autorisations-vehicules")({
  head: () => ({ meta: [{ title: "Autorisations véhicules — Paramètres" }] }),
  component: AutorisationsVehiculesPage,
});

interface Emp {
  id: string;
  prenom: string;
  nom: string;
  actif: boolean;
}

function AutorisationsVehiculesPage() {
  const { isAdmin } = useAuth();
  const [employes, setEmployes] = useState<Emp[]>([]);
  const [autorisations, setAutorisations] = useState<AutorisationVehicule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEmployeId, setEditingEmployeId] = useState<string | null>(null);
  const [editingExisting, setEditingExisting] = useState<AutorisationVehicule | null>(null);
  const [initialType, setInitialType] = useState<AutorisationType | undefined>(undefined);

  async function reload() {
    setLoading(true);
    const [{ data: emps }, { data: auts }] = await Promise.all([
      supabase
        .from("employes")
        .select("id, prenom, nom, actif")
        .eq("actif", true)
        .order("nom"),
      supabase.from("employes_autorisations_vehicules").select("*"),
    ]);
    setEmployes((emps ?? []) as unknown as Emp[]);
    setAutorisations((auts ?? []) as unknown as AutorisationVehicule[]);
    setLoading(false);
  }

  useEffect(() => {
    void reload();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return employes;
    const q = search.toLowerCase();
    return employes.filter(
      (e) =>
        e.nom.toLowerCase().includes(q) || e.prenom.toLowerCase().includes(q),
    );
  }, [employes, search]);

  const byEmploye = useMemo(() => {
    const map = new Map<string, Map<AutorisationType, AutorisationVehicule>>();
    for (const a of autorisations) {
      let inner = map.get(a.employe_id);
      if (!inner) {
        inner = new Map();
        map.set(a.employe_id, inner);
      }
      inner.set(a.type_autorisation, a);
    }
    return map;
  }, [autorisations]);

  // Compteurs globaux pour le header
  const stats = useMemo(() => {
    let expire = 0;
    let proche = 0;
    let valide = 0;
    for (const a of autorisations) {
      const s = statutFromExpiration(a.date_expiration);
      if (s === "expire") expire++;
      else if (s === "expiration_proche") proche++;
      else valide++;
    }
    return { expire, proche, valide };
  }, [autorisations]);

  function handleClickCell(employeId: string, type: AutorisationType) {
    const existing = byEmploye.get(employeId)?.get(type) ?? null;
    setEditingEmployeId(employeId);
    setEditingExisting(existing);
    setInitialType(existing ? undefined : type);
    setDialogOpen(true);
  }

  if (!isAdmin) return <Navigate to="/dashboard" />;

  return (
    <div className="container mx-auto space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Autorisations véhicules</h1>
        <p className="text-sm text-muted-foreground">
          Permis de conduire et CACES de l'équipe avec dates d'expiration.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Valides</CardDescription>
            <CardTitle className="text-emerald-600">{stats.valide}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Expirent dans 30 jours</CardDescription>
            <CardTitle className="text-amber-600">{stats.proche}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Expirées</CardDescription>
            <CardTitle className="text-destructive">{stats.expire}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Matrice équipe</CardTitle>
          <CardDescription>
            Cliquez sur une cellule pour ajouter ou modifier l'autorisation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Rechercher un employé…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Aucun employé trouvé.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-background">Employé</TableHead>
                    {ALL_AUTORISATIONS.map((t) => (
                      <TableHead key={t} className="text-center" title={AUTORISATION_LABELS[t]}>
                        {AUTORISATION_SHORT[t]}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((emp) => {
                    const inner = byEmploye.get(emp.id);
                    return (
                      <TableRow key={emp.id}>
                        <TableCell className="sticky left-0 bg-background font-medium">
                          {emp.nom} {emp.prenom}
                        </TableCell>
                        {ALL_AUTORISATIONS.map((t) => {
                          const a = inner?.get(t);
                          const statut = a ? statutFromExpiration(a.date_expiration) : "manquant";
                          const jours = a ? joursAvantExpiration(a.date_expiration) : null;
                          return (
                            <TableCell key={t} className="text-center">
                              <button
                                type="button"
                                onClick={() => handleClickCell(emp.id, t)}
                                className="inline-flex items-center justify-center"
                                title={
                                  a
                                    ? `${AUTORISATION_LABELS[t]} — ${STATUT_LABELS[statut]}${
                                        jours !== null ? ` (${jours}j)` : ""
                                      }`
                                    : `Ajouter ${AUTORISATION_LABELS[t]}`
                                }
                              >
                                {a ? (
                                  <Badge
                                    variant="outline"
                                    className={STATUT_BADGE_CLASS[statut]}
                                  >
                                    {AUTORISATION_SHORT[t]}
                                  </Badge>
                                ) : (
                                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-dashed border-border/60 text-muted-foreground/40 hover:bg-accent">
                                    <Plus className="h-3 w-3" />
                                  </span>
                                )}
                              </button>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {editingEmployeId && (
        <AutorisationVehiculeDialog
          open={dialogOpen}
          onOpenChange={(o) => {
            setDialogOpen(o);
            if (!o) {
              setEditingExisting(null);
              setEditingEmployeId(null);
              setInitialType(undefined);
            }
          }}
          employeId={editingEmployeId}
          existing={editingExisting}
          initialType={initialType}
          onSaved={reload}
        />
      )}
    </div>
  );
}
