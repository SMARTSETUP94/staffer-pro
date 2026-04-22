import { useEffect, useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Loader2, FileDown, FileSpreadsheet, Truck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  buildExportFilename,
  downloadBlob,
  exportTrajetsSoustraitanceCSV,
  exportTrajetsSoustraitanceXLSX,
  type TrajetExportRow,
} from "@/lib/trajets-soustraitance-export";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUTS = [
  { id: "a_sous_traiter", label: "À sous-traiter" },
  { id: "devis_envoye", label: "Devis envoyé" },
  { id: "confirme", label: "Confirmé" },
] as const;

type StatutId = (typeof STATUTS)[number]["id"];

/**
 * v0.18.1 — Dialog d'export des trajets sous-traités.
 * Filtres : plage dates, statut, prestataire (texte libre), affaire.
 * Sortie : CSV UTF-8 BOM + XLSX.
 */
export function ExportTrajetsSoustraitanceDialog({ open, onOpenChange }: Props) {
  const today = new Date();
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(today), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(endOfMonth(today), "yyyy-MM-dd"));
  const [statuts, setStatuts] = useState<Set<StatutId>>(
    new Set(["a_sous_traiter", "devis_envoye", "confirme"]),
  );
  const [prestataireFilter, setPrestataireFilter] = useState<string>("__all__");
  const [affaireFilter, setAffaireFilter] = useState<string>("__all__");
  const [affaires, setAffaires] = useState<{ id: string; numero: string; nom: string }[]>([]);
  const [prestataires, setPrestataires] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewCount, setPreviewCount] = useState<number | null>(null);

  // Charge les listes affaires + prestataires distincts (pour les filtres dropdown)
  useEffect(() => {
    if (!open) return;
    void (async () => {
      const [{ data: aff }, { data: tr }] = await Promise.all([
        supabase
          .from("affaires")
          .select("id, numero, nom")
          .order("numero", { ascending: false })
          .limit(500),
        supabase
          .from("trajets")
          .select("prestataire")
          .neq("statut_soustraitance", "non")
          .not("prestataire", "is", null)
          .limit(2000),
      ]);
      setAffaires((aff ?? []) as { id: string; numero: string; nom: string }[]);
      // v0.19 — on utilise désormais la vraie colonne `prestataire`.
      const setP = new Set<string>();
      ((tr ?? []) as { prestataire: string | null }[]).forEach((t) => {
        const p = t.prestataire?.trim();
        if (p) setP.add(p);
      });
      setPrestataires(Array.from(setP).sort().slice(0, 100));
    })();
  }, [open]);

  const toggleStatut = (id: StatutId, checked: boolean) => {
    setStatuts((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const filtersDescription = useMemo(() => {
    const parts: string[] = [];
    parts.push(`du ${format(new Date(dateFrom), "dd/MM/yyyy")} au ${format(new Date(dateTo), "dd/MM/yyyy")}`);
    if (statuts.size > 0 && statuts.size < 3) {
      parts.push(`statuts : ${Array.from(statuts).map((s) => STATUTS.find((x) => x.id === s)?.label).join(", ")}`);
    }
    if (affaireFilter !== "__all__") {
      const aff = affaires.find((a) => a.id === affaireFilter);
      if (aff) parts.push(`affaire ${aff.numero}`);
    }
    if (prestataireFilter !== "__all__") parts.push(`prestataire « ${prestataireFilter} »`);
    return parts.join(" · ");
  }, [dateFrom, dateTo, statuts, affaireFilter, prestataireFilter, affaires]);

  async function fetchRows(): Promise<TrajetExportRow[]> {
    let q = supabase
      .from("trajets")
      .select(
        "id, reference, date, heure_depart, heure_arrivee, adresse_depart, adresse_arrivee, aller_retour, parent_trajet_id, kilometrage, categorie, statut_soustraitance, notes, prestataire, vehicule_id, affaire_id, vehicules(nom, immatriculation, type), affaires(numero, nom)",
      )
      .neq("statut_soustraitance", "non")
      .gte("date", dateFrom)
      .lte("date", dateTo)
      .order("date", { ascending: true })
      .order("heure_depart", { ascending: true, nullsFirst: false });

    if (statuts.size > 0 && statuts.size < 3) {
      q = q.in("statut_soustraitance", Array.from(statuts));
    }
    if (affaireFilter !== "__all__") {
      q = q.eq("affaire_id", affaireFilter);
    }
    if (prestataireFilter !== "__all__") {
      q = q.eq("prestataire", prestataireFilter);
    }
    const { data, error } = await q;
    if (error) throw error;
    type Row = {
      id: string;
      reference: string | null;
      date: string;
      heure_depart: string | null;
      heure_arrivee: string | null;
      adresse_depart: string;
      adresse_arrivee: string;
      aller_retour: boolean;
      parent_trajet_id: string | null;
      kilometrage: number | null;
      categorie: string;
      statut_soustraitance: "non" | "a_sous_traiter" | "devis_envoye" | "confirme";
      notes: string | null;
      prestataire: string | null;
      vehicules: { nom: string | null; immatriculation: string | null; type: string | null } | null;
      affaires: { numero: string | null; nom: string | null } | null;
    };
    const mapped: TrajetExportRow[] = ((data ?? []) as unknown as Row[]).map((r) => ({
      id: r.id,
      reference: r.reference,
      date: r.date,
      heure_depart: r.heure_depart,
      heure_arrivee: r.heure_arrivee,
      adresse_depart: r.adresse_depart,
      adresse_arrivee: r.adresse_arrivee,
      aller_retour: r.aller_retour,
      parent_trajet_id: r.parent_trajet_id,
      vehicule_label: r.vehicules?.nom
        ? `${r.vehicules.nom}${r.vehicules.immatriculation ? ` (${r.vehicules.immatriculation})` : ""}`
        : null,
      vehicule_type: r.vehicules?.type ?? null,
      kilometrage: r.kilometrage,
      affaire_numero: r.affaires?.numero ?? null,
      affaire_nom: r.affaires?.nom ?? null,
      categorie: r.categorie,
      prestataire: r.prestataire,
      statut_soustraitance: r.statut_soustraitance,
      notes: r.notes,
    }));

    return mapped;
  }

  async function handlePreview() {
    setLoading(true);
    try {
      const rows = await fetchRows();
      setPreviewCount(rows.length);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Échec du chargement", { description: msg });
    } finally {
      setLoading(false);
    }
  }

  async function handleExport(kind: "csv" | "xlsx") {
    setLoading(true);
    try {
      const rows = await fetchRows();
      if (rows.length === 0) {
        toast.warning("Aucun trajet sous-traité ne correspond aux filtres.");
        return;
      }
      const filters = {
        dateFrom,
        dateTo,
        statuts: Array.from(statuts),
        prestataire: prestataireFilter === "__all__" ? null : prestataireFilter,
        affaireId: affaireFilter === "__all__" ? null : affaireFilter,
      };
      const filename = buildExportFilename(kind, filters);
      const blob =
        kind === "csv"
          ? exportTrajetsSoustraitanceCSV(rows)
          : exportTrajetsSoustraitanceXLSX(rows);
      downloadBlob(blob, filename);
      toast.success(`Export ${kind.toUpperCase()} généré`, {
        description: `${rows.length} trajet${rows.length > 1 ? "s" : ""} exporté${rows.length > 1 ? "s" : ""}.`,
      });
      onOpenChange(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Échec de l'export", { description: msg });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            Exporter les trajets sous-traités
          </DialogTitle>
          <DialogDescription>
            Génère un fichier (CSV ou Excel) à transmettre à un transporteur ou pour le suivi
            interne. Distinct de l'export SILAE des heures salariés.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="date-from">Du</Label>
              <Input
                id="date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPreviewCount(null);
                }}
              />
            </div>
            <div>
              <Label htmlFor="date-to">Au</Label>
              <Input
                id="date-to"
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPreviewCount(null);
                }}
              />
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Statuts sous-traitance</Label>
            <div className="flex flex-wrap gap-3">
              {STATUTS.map((s) => (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-sm"
                >
                  <Checkbox
                    checked={statuts.has(s.id)}
                    onCheckedChange={(c) => {
                      toggleStatut(s.id, !!c);
                      setPreviewCount(null);
                    }}
                  />
                  {s.label}
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Affaire</Label>
              <Select
                value={affaireFilter}
                onValueChange={(v) => {
                  setAffaireFilter(v);
                  setPreviewCount(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <SelectItem value="__all__">Toutes les affaires</SelectItem>
                  {affaires.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.numero} — {a.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prestataire</Label>
              <Select
                value={prestataireFilter}
                onValueChange={(v) => {
                  setPrestataireFilter(v);
                  setPreviewCount(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Tous les prestataires</SelectItem>
                  {prestataires.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {filtersDescription && (
            <div className="rounded-md border border-border bg-muted/30 p-2.5 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Filtres actifs : </span>
              {filtersDescription}
              {previewCount !== null && (
                <div className="mt-1 font-semibold text-foreground">
                  → {previewCount} trajet{previewCount > 1 ? "s" : ""} correspondant{previewCount > 1 ? "s" : ""}.
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreview}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            Compter les lignes
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => handleExport("csv")}
              disabled={loading || statuts.size === 0}
            >
              <FileDown className="mr-1.5 h-4 w-4" />
              Export CSV
            </Button>
            <Button
              onClick={() => handleExport("xlsx")}
              disabled={loading || statuts.size === 0}
            >
              <FileSpreadsheet className="mr-1.5 h-4 w-4" />
              Export Excel
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
