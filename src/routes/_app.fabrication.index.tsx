import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Hammer, Loader2, Box, Brush, Pencil, Wrench, Truck, AlertCircle, Send, Cog,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ETAPE_LABELS, ETAPES_ORDER } from "@/hooks/use-fabrication";
import type { FabricationEtapeType } from "@/hooks/use-fabrication";
import {
  useFabricationDashboard,
  computeChargeByAssignee,
  listUnassignedEtapes,
} from "@/hooks/use-fabrication-dashboard";
import { StafferVehiculeInterneDialog } from "@/components/fabrication/StafferVehiculeInterneDialog";

export const Route = createFileRoute("/_app/fabrication/")({
  head: () => ({ meta: [{ title: "Dashboard fabrication — Setup Paris" }] }),
  component: FabricationDashboardPage,
  errorComponent: ({ error }) => (
    <div className="rounded-xl border border-destructive bg-destructive/5 p-4">
      <p className="text-sm text-destructive">Erreur : {error.message}</p>
    </div>
  ),
});

const ETAPE_ICONS: Record<FabricationEtapeType, typeof Hammer> = {
  be: Pencil,
  usinage: Cog,
  respo_fab: Wrench,
  finition: Brush,
  manutention: Box,
};

function FabricationDashboardPage() {
  const { loading, objets, affaires, reload } = useFabricationDashboard();
  const [chefFilter, setChefFilter] = useState<string>("all");
  const [stafferAffaire, setStafferAffaire] = useState<{
    id: string;
    numero: string;
    nom: string;
    lieu: string | null;
    date_montage: string | null;
    objets_count: number;
  } | null>(null);

  // Filtrage par chef projet
  const objetsFiltres = useMemo(() => {
    if (chefFilter === "all") return objets;
    if (chefFilter === "none") return objets.filter((o) => !o.chef_projet_id);
    return objets.filter((o) => o.chef_projet_id === chefFilter);
  }, [objets, chefFilter]);

  const affairesFiltres = useMemo(() => {
    if (chefFilter === "all") return affaires;
    if (chefFilter === "none") return affaires.filter((a) => !a.chef_projet_id);
    return affaires.filter((a) => a.chef_projet_id === chefFilter);
  }, [affaires, chefFilter]);

  // KPIs
  const allEtapes = objetsFiltres.flatMap((o) => o.etapes);
  const kpis = {
    total: objetsFiltres.length,
    enCours: objetsFiltres.filter((o) =>
      o.etapes.some((e) => e.statut === "en_cours"),
    ).length,
    termines: objetsFiltres.filter((o) =>
      o.etapes
        .filter((e) => e.statut !== "non_applicable")
        .every((e) => e.statut === "termine"),
    ).length,
    nonAssignes: allEtapes.filter((e) => e.statut === "a_faire" && !e.assignee_id).length,
    affairesActives: affairesFiltres.length,
    pretsLivrer: affairesFiltres.filter((a) => a.pret_a_livrer).length,
  };

  const unassigned = useMemo(() => listUnassignedEtapes(objetsFiltres), [objetsFiltres]);

  const types: FabricationEtapeType[] = ETAPES_ORDER;

  // Liste des chefs projet pour le filtre (déduit des affaires)
  const chefsList = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of affaires) {
      if (a.chef_projet_id && a.chef_projet_name) {
        map.set(a.chef_projet_id, a.chef_projet_name);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [affaires]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête + filtres */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Hammer className="h-5 w-5 text-primary" /> Dashboard fabrication
          </h1>
          <p className="text-sm text-muted-foreground">
            Vue globale des objets en fabrication, charges par pôle, et prochaines livraisons.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Chef de projet
            </label>
            <Select value={chefFilter} onValueChange={setChefFilter}>
              <SelectTrigger className="h-9 w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les chefs</SelectItem>
                <SelectItem value="none">— Non désigné —</SelectItem>
                {chefsList.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Objets" value={kpis.total} />
        <KpiCard label="En cours" value={kpis.enCours} />
        <KpiCard label="Terminés" value={kpis.termines} />
        <KpiCard label="Non assignés" value={kpis.nonAssignes} highlight={kpis.nonAssignes > 0} />
        <KpiCard label="Affaires actives" value={kpis.affairesActives} />
        <KpiCard label="Prêtes à livrer" value={kpis.pretsLivrer} highlight={kpis.pretsLivrer > 0} />
      </div>

      {/* Vue par pôle */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Charge par pôle
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {types.map((t) => {
            const Icon = ETAPE_ICONS[t];
            const charge = computeChargeByAssignee(objetsFiltres, t);
            return (
              <Card key={t} className="rounded-xl">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Icon className="h-4 w-4 text-primary" />
                    {ETAPE_LABELS[t]}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 pt-0">
                  {charge.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Aucune charge active</p>
                  ) : (
                    charge.map((c) => (
                      <div
                        key={c.assignee_id}
                        className="flex items-center justify-between rounded-md bg-muted/40 px-2 py-1 text-xs"
                      >
                        <span className="truncate">{c.assignee_name}</span>
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          {c.count}
                        </Badge>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Objets non assignés */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          Étapes non assignées ({kpis.nonAssignes})
        </h2>
        {kpis.nonAssignes === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/50 p-4 text-center">
            <p className="text-xs text-muted-foreground">
              Toutes les étapes en cours sont assignées 🎉
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {types.map((t) => {
              const items = unassigned[t];
              if (items.length === 0) return null;
              const Icon = ETAPE_ICONS[t];
              return (
                <Card key={t} className="rounded-xl">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-primary" />
                        {ETAPE_LABELS[t]}
                      </span>
                      <Badge variant="outline">{items.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 pt-0">
                    {items.slice(0, 6).map((it) => (
                      <Link
                        key={it.etape_id}
                        to="/affaires/$affaireId/fabrication"
                        params={{ affaireId: it.affaire_id }}
                        className="block truncate rounded-md px-2 py-1 text-xs hover:bg-muted"
                        title={`${it.objet_ref} — ${it.objet_nom} (${it.affaire_label})`}
                      >
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {it.objet_ref}
                        </span>{" "}
                        — {it.objet_nom}
                      </Link>
                    ))}
                    {items.length > 6 && (
                      <p className="px-2 text-[10px] text-muted-foreground">
                        + {items.length - 6} autres
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Affaires prêtes à livrer */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
          <Truck className="h-4 w-4 text-emerald-600" />
          Affaires prêtes à livrer ({kpis.pretsLivrer})
        </h2>
        {kpis.pretsLivrer === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/50 p-4 text-center">
            <p className="text-xs text-muted-foreground">
              Aucune affaire prête à livrer pour l'instant.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {affairesFiltres
              .filter((a) => a.pret_a_livrer)
              .map((a) => (
                <div
                  key={a.id}
                  className="flex flex-col gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {a.numero} — {a.nom}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {a.objets_count} objet{a.objets_count > 1 ? "s" : ""}
                      {a.date_demontage && (
                        <> · Démontage {new Date(a.date_demontage).toLocaleDateString("fr-FR")}</>
                      )}
                      {a.chef_projet_name && <> · CP : {a.chef_projet_name}</>}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl"
                      onClick={() =>
                        setStafferAffaire({
                          id: a.id,
                          numero: a.numero,
                          nom: a.nom,
                          lieu: null,
                          date_montage: a.date_demontage,
                          objets_count: a.objets_count,
                        })
                      }
                    >
                      <Truck className="mr-1 h-3 w-3" /> Staffer véhicule
                    </Button>
                    <Button asChild size="sm" variant="outline" className="rounded-xl">
                      <Link to="/export/demandes-devis">
                        <Send className="mr-1 h-3 w-3" /> Sous-traiter
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>

      {stafferAffaire && (
        <StafferVehiculeInterneDialog
          open={!!stafferAffaire}
          onOpenChange={(o) => !o && setStafferAffaire(null)}
          affaireId={stafferAffaire.id}
          affaireNumero={stafferAffaire.numero}
          affaireNom={stafferAffaire.nom}
          affaireLieu={stafferAffaire.lieu}
          dateMontage={stafferAffaire.date_montage}
          objetsCount={stafferAffaire.objets_count}
          onCreated={reload}
        />
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 text-center ${
        highlight ? "border-primary/40 bg-primary/5" : "border-border bg-card"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold ${highlight ? "text-primary" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}

