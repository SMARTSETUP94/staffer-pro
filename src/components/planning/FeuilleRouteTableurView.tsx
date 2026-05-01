/**
 * v0.33 — Vue Tableur Feuille de Route.
 *
 * Remplace FeuilleRouteView (cartes par jour) par un tableur 14 jours.
 * 10 colonnes éditables inline (pattern OpportunitesTableurView v0.28-29) :
 *   1. Date         (lecture seule)
 *   2. Code         (lecture seule, lien affaire)
 *   3. Typologie    (TypologieFutureSelect — UPDATE direct affaires.typologie_future)
 *   4. Nom chantier (lecture seule)
 *   5. Adresse      (override texte libre — fallback affaires.lieu en placeholder)
 *   6. Responsable  (lecture seule, calculé)
 *   7. Opération    (Select figé 8 valeurs)
 *   8. Horaire      (input HH:MM)
 *   9. Véhicules    (multi-select write-only + badge ⚠️ si discordance trajets)
 *  10. Commentaires (textarea inline)
 *
 * Auto-save 800ms (overlay optimistic dans use-feuille-route-tableur).
 * Filtre statut affaires = en_cours OR prospect (déjà appliqué côté hook).
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { addDays, format, startOfWeek, subDays } from "date-fns";
import { fr } from "date-fns/locale";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileDown,
  Loader2,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  TYPE_OPERATION_OPTIONS,
  applyFRTableurFilters,
  isValidHoraire,
  type FRTableurFilters,
} from "@/lib/feuille-route-tableur-helpers";
import { TypologieFutureSelect } from "@/components/typologie/TypologieFutureSelect";
import { useFeuilleRouteTableur } from "@/hooks/use-feuille-route-tableur";
import type { Employe } from "@/hooks/use-planning-data";
import type { Vehicule } from "@/hooks/use-vehicules";

interface Props {
  employes: Employe[];
  vehicules: Vehicule[];
  /** Date initiale (défaut = lundi de la semaine courante). */
  initialDate?: Date;
  /** Nombre de jours à afficher. Défaut 14. */
  nbDays?: number;
}

const DAY_LABELS = (d: string) => {
  const date = new Date(`${d}T00:00:00`);
  return format(date, "EEE dd MMM", { locale: fr });
};

export function FeuilleRouteTableurView({
  employes,
  vehicules,
  initialDate,
  nbDays = 14,
}: Props) {
  const [weekStart, setWeekStart] = useState<Date>(
    initialDate ?? startOfWeek(new Date(), { weekStartsOn: 1 }),
  );
  const [search, setSearch] = useState("");

  const {
    loading,
    error,
    rows,
    patchRow,
    patchTypologieFuture,
    savingIds,
  } = useFeuilleRouteTableur({ weekStart, nbDays, employes });

  const filters: FRTableurFilters = useMemo(
    () => ({ search, typologies: [], affaireIds: null }),
    [search],
  );
  const visibleRows = useMemo(
    () => applyFRTableurFilters(rows, filters),
    [rows, filters],
  );

  const periodLabel = `${format(weekStart, "dd MMM", { locale: fr })} → ${format(
    addDays(weekStart, nbDays - 1),
    "dd MMM yyyy",
    { locale: fr },
  )}`;

  const vehiculeById = useMemo(() => {
    const m = new Map<string, Vehicule>();
    vehicules.forEach((v) => m.set(v.id, v));
    return m;
  }, [vehicules]);

  const [exportBusy, setExportBusy] = useState(false);
  async function handleExport() {
    if (visibleRows.length === 0) {
      toast.info("Aucune ligne à exporter sur cette période.");
      return;
    }
    setExportBusy(true);
    try {
      // Lazy-load xlsx-js-style (~400KB) au clic uniquement.
      const mod = await import("@/lib/feuille-route-tableur-excel");
      const out = mod.exportFRTableurExcel({
        rows: visibleRows,
        vehicules: vehicules.map((v) => ({ id: v.id, nom: v.nom })),
        periodStart: weekStart,
        periodEnd: addDays(weekStart, nbDays - 1),
      });
      toast.success(`Export OK : ${out.rowsCount} ligne(s) → ${out.filename}`);
    } catch (e) {
      console.error("[FR Tableur] export error", e);
      toast.error("Erreur à l'export Excel");
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <div className="space-y-3" data-testid="fr-tableur">
      {/* Toolbar : navigation + search */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setWeekStart((d) => subDays(d, 7))}
          aria-label="Semaine précédente"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-[200px] text-center font-medium">
          {periodLabel}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setWeekStart((d) => addDays(d, 7))}
          aria-label="Semaine suivante"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))
          }
        >
          Aujourd'hui
        </Button>

        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher (code, nom, adresse, commentaire…)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[320px] pl-8"
            data-testid="fr-tableur-search"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
            <tr className="text-left">
              <th className="w-[110px] px-2 py-2">Date</th>
              <th className="w-[80px] px-2 py-2">Code</th>
              <th className="w-[140px] px-2 py-2">Typologie</th>
              <th className="w-[200px] px-2 py-2">Nom chantier</th>
              <th className="w-[220px] px-2 py-2">Adresse</th>
              <th className="w-[140px] px-2 py-2">Responsable</th>
              <th className="w-[140px] px-2 py-2">Opération</th>
              <th className="w-[90px] px-2 py-2">Horaire</th>
              <th className="w-[180px] px-2 py-2">Véhicules</th>
              <th className="px-2 py-2">Commentaires</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </td>
              </tr>
            )}
            {!loading && visibleRows.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  Aucune ligne sur cette période.
                </td>
              </tr>
            )}
            {!loading &&
              visibleRows.map((row) => {
                const saving = savingIds.has(row.id);
                return (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-t align-top hover:bg-muted/30",
                      !row.staffe && "italic text-muted-foreground",
                    )}
                    data-testid={`fr-row-${row.id}`}
                  >
                    {/* 1. Date */}
                    <td className="px-2 py-1 whitespace-nowrap">
                      {DAY_LABELS(row.date)}
                    </td>

                    {/* 2. Code */}
                    <td className="px-2 py-1">
                      <Link
                        to="/affaires/$affaireId"
                        params={{ affaireId: row.affaire_id }}
                        className="inline-flex items-center gap-1 font-mono text-primary hover:underline"
                      >
                        {row.affaire_numero}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>

                    {/* 3. Typologie future */}
                    <td className="px-2 py-1">
                      <TypologieFutureSelect
                        value={row.typologie_future}
                        onChange={(v) => {
                          void patchTypologieFuture(row.affaire_id, v);
                        }}
                        ariaLabel="Typologie"
                        className="h-8"
                      />
                    </td>

                    {/* 4. Nom chantier */}
                    <td className="px-2 py-1">{row.affaire_nom}</td>

                    {/* 5. Adresse override */}
                    <td className="px-2 py-1">
                      <Input
                        defaultValue={row.adresse_override ?? ""}
                        placeholder={row.affaire_lieu ?? "—"}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v === (row.adresse_override ?? "")) return;
                          patchRow(row.id, {
                            adresse_override: v === "" ? null : v,
                          });
                        }}
                        className="h-8"
                        data-testid={`fr-cell-adresse-${row.id}`}
                      />
                    </td>

                    {/* 6. Responsable */}
                    <td className="px-2 py-1">
                      <span title={`Source : ${row.responsable_source}`}>
                        {row.responsable_label}
                      </span>
                    </td>

                    {/* 7. Type opération */}
                    <td className="px-2 py-1">
                      <Select
                        value={row.type_operation ?? "__none__"}
                        onValueChange={(v) =>
                          patchRow(row.id, {
                            type_operation: v === "__none__" ? null : v,
                          })
                        }
                      >
                        <SelectTrigger
                          className="h-8"
                          aria-label="Type opération"
                        >
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">—</SelectItem>
                          {TYPE_OPERATION_OPTIONS.map((op) => (
                            <SelectItem key={op} value={op}>
                              {op}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>

                    {/* 8. Horaire RDV */}
                    <td className="px-2 py-1">
                      <Input
                        type="time"
                        defaultValue={row.horaire_rdv ?? ""}
                        onBlur={(e) => {
                          const v = e.target.value;
                          if (!isValidHoraire(v)) return;
                          if ((v || null) === (row.horaire_rdv ?? null)) return;
                          patchRow(row.id, { horaire_rdv: v === "" ? null : v });
                        }}
                        className="h-8"
                        data-testid={`fr-cell-horaire-${row.id}`}
                      />
                    </td>

                    {/* 9. Véhicules (multi-select + badge discordance) */}
                    <td className="px-2 py-1">
                      <VehiculesPicker
                        selected={row.vehicules_ids}
                        vehicules={vehicules}
                        vehiculeById={vehiculeById}
                        onChange={(ids) =>
                          patchRow(row.id, { vehicules_ids: ids })
                        }
                      />
                      {row.vehicules_discordance && (
                        <div className="mt-1 flex items-start gap-1 text-xs text-amber-600">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                          <span>
                            Réel :{" "}
                            {row.vehicules_reels_ids.length === 0
                              ? "aucun"
                              : row.vehicules_reels_ids
                                  .map(
                                    (id) =>
                                      vehiculeById.get(id)?.nom ?? id.slice(0, 6),
                                  )
                                  .join(", ")}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* 10. Commentaires */}
                    <td className="px-2 py-1">
                      <div className="flex items-start gap-2">
                        <Textarea
                          defaultValue={row.commentaires ?? ""}
                          rows={1}
                          onBlur={(e) => {
                            const v = e.target.value;
                            if ((v || "") === (row.commentaires ?? "")) return;
                            patchRow(row.id, {
                              commentaires: v === "" ? null : v,
                            });
                          }}
                          className="min-h-[32px] resize-y"
                          data-testid={`fr-cell-comm-${row.id}`}
                        />
                        {saving && (
                          <Loader2 className="mt-1 h-3 w-3 animate-spin text-muted-foreground" />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-muted-foreground">
        {visibleRows.length} ligne(s) — Période : {nbDays} jours — Auto-save 800
        ms.
      </div>
    </div>
  );
}

/* ============================================================
 * VehiculesPicker : multi-select compact via Popover + Checkbox
 * ============================================================ */
interface VehiculesPickerProps {
  selected: string[];
  vehicules: Vehicule[];
  vehiculeById: Map<string, Vehicule>;
  onChange: (ids: string[]) => void;
}

function VehiculesPicker({
  selected,
  vehicules,
  vehiculeById,
  onChange,
}: VehiculesPickerProps) {
  const [open, setOpen] = useState(false);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const label =
    selected.length === 0
      ? "—"
      : selected
          .map((id) => vehiculeById.get(id)?.nom ?? id.slice(0, 6))
          .join(", ");

  function toggle(id: string) {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-full justify-start truncate font-normal"
        >
          <span className="truncate">{label}</span>
          {selected.length > 0 && (
            <Badge variant="secondary" className="ml-auto">
              {selected.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <div className="max-h-[320px] overflow-auto p-1">
          {vehicules.length === 0 && (
            <div className="px-2 py-3 text-center text-sm text-muted-foreground">
              Aucun véhicule
            </div>
          )}
          {vehicules.map((v) => {
            const checked = selectedSet.has(v.id);
            return (
              <label
                key={v.id}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-muted"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggle(v.id)}
                />
                <span className="truncate text-sm">{v.nom}</span>
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
