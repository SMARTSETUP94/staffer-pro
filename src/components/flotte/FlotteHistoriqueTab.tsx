/**
 * v0.41.0b — Sprint 3b.3 : Historique trajets avec filtres avancés.
 */
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVehicules } from "@/hooks/use-vehicules";
import { useTrajetsRange, useAffairesLite } from "@/hooks/use-trajets-range";
import {
  filterTrajets, CATEGORIE_LABEL, STATUT_LABEL, type TrajetFilters,
} from "@/lib/trajets-stats";

const TODAY = new Date().toISOString().slice(0, 10);
const SIX_MONTHS_AGO = (() => {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return d.toISOString().slice(0, 10);
})();

export function FlotteHistoriqueTab() {
  const [dateFrom, setDateFrom] = useState<string>(SIX_MONTHS_AGO);
  const [dateTo, setDateTo] = useState<string>(TODAY);
  const { trajets, isLoading } = useTrajetsRange(dateFrom, dateTo);
  const { vehicules } = useVehicules();
  const affaires = useAffairesLite();

  const [filters, setFilters] = useState<TrajetFilters>({});

  const vehById = useMemo(() => new Map(vehicules.map((v) => [v.id, v])), [vehicules]);
  const affById = useMemo(() => new Map(affaires.map((a) => [a.id, a])), [affaires]);

  const filtered = useMemo(
    () => filterTrajets(trajets, filters),
    [trajets, filters],
  );

  const reset = () => setFilters({});
  const hasFilters = Object.values(filters).some((v) => v !== null && v !== undefined && v !== "");

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <div>
              <Label className="text-xs">Du</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Au</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Véhicule</Label>
              <Select
                value={filters.vehiculeId ?? "all"}
                onValueChange={(v) => setFilters((f) => ({ ...f, vehiculeId: v === "all" ? null : v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  {vehicules.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Statut</Label>
              <Select
                value={filters.statut ?? "all"}
                onValueChange={(v) =>
                  setFilters((f) => ({ ...f, statut: v === "all" ? null : (v as TrajetFilters["statut"]) }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  {(["non", "a_sous_traiter", "devis_envoye", "confirme"] as const).map((s) => (
                    <SelectItem key={s} value={s}>{STATUT_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Catégorie</Label>
              <Select
                value={filters.categorie ?? "all"}
                onValueChange={(v) =>
                  setFilters((f) => ({ ...f, categorie: v === "all" ? null : (v as TrajetFilters["categorie"]) }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
                  {(["pose", "depose", "livraison_fourniture", "recuperation_materiel", "autre"] as const).map((c) => (
                    <SelectItem key={c} value={c}>{CATEGORIE_LABEL[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Prestataire</Label>
              <Input
                placeholder="Nom transporteur…"
                value={filters.prestataire ?? ""}
                onChange={(e) => setFilters((f) => ({ ...f, prestataire: e.target.value || null }))}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Recherche libre (adresse, référence, notes)…"
              value={filters.query ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value || null }))}
              className="max-w-md"
            />
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={reset}>
                <X className="h-4 w-4 mr-1" /> Réinitialiser
              </Button>
            )}
            <div className="ml-auto text-sm text-muted-foreground">
              {filtered.length} / {trajets.length} trajet{trajets.length > 1 ? "s" : ""}
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Aucun trajet ne correspond aux filtres.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Trajet</TableHead>
                  <TableHead>Affaire</TableHead>
                  <TableHead>Véhicule</TableHead>
                  <TableHead>Prestataire</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Km</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 500).map((t) => {
                  const aff = t.affaire_id ? affById.get(t.affaire_id) : null;
                  const veh = t.vehicule_id ? vehById.get(t.vehicule_id) : null;
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(t.date + "T00:00:00").toLocaleDateString("fr-FR")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{CATEGORIE_LABEL[t.categorie]}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="truncate max-w-[280px]" title={`${t.adresse_depart} → ${t.adresse_arrivee}`}>
                          {t.adresse_depart} → {t.adresse_arrivee}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {aff ? <span className="font-mono">{aff.numero}</span> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-xs">
                        {veh?.nom ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-xs">
                        {t.prestataire ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={t.statut_soustraitance === "confirme" ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {STATUT_LABEL[t.statut_soustraitance]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs font-mono">
                        {t.kilometrage ? `${t.kilometrage} km` : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {filtered.length > 500 && (
              <div className="px-4 py-2 text-xs text-muted-foreground border-t">
                Affichage limité aux 500 premiers résultats. Affine les filtres pour voir le reste.
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
