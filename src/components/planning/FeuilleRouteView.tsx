/**
 * v0.21.0 Bloc 5 — Vue "Feuille de route par jour".
 * Onglet 6 du /planning. Liste les chantiers staffés un jour donné avec :
 *   - responsable (chef du jour avec fallback chef_projet → manutention → chargé d'affaires)
 *   - type d'opération
 *   - adresse + horaire
 *   - équipe staffée
 * Boutons : navigation J-1/J/J+1 + export Excel/PDF.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, subDays } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, FileDown, Loader2, Calendar as CalendarIcon, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { Affaire, Assignation, Employe, Metier } from "@/hooks/use-planning-data";
import {
  resolveResponsable,
  type EmployeForResponsable,
} from "@/lib/feuille-route-helpers";
import { exportFeuilleRouteExcel } from "@/lib/feuille-route-excel";
import { exportPlanningToPDF } from "@/lib/planning-export";
import { AssignationDialog } from "./AssignationDialog";

// On augmente Affaire et Assignation côté local pour récupérer les nouveaux champs.
interface ExtAssignation extends Assignation {
  type_operation: string | null;
  est_chef_jour: boolean;
}
interface ExtAffaire extends Affaire {
  chef_projet_id: string | null;
  charge_affaires_id: string | null;
}

interface Props {
  affaires: Affaire[];
  employes: Employe[];
  metiers: Metier[];
  /** Le composant recharge ses propres données (assignations du jour) */
  initialDate?: Date;
}

interface ProfileLite {
  id: string;
  full_name: string | null;
  est_manutention: boolean;
}

export function FeuilleRouteView({ affaires, employes, metiers, initialDate }: Props) {
  const [date, setDate] = useState<Date>(initialDate ?? new Date());
  const [filterAdresse, setFilterAdresse] = useState("");
  const [filterRespo, setFilterRespo] = useState("");
  const [exportPdfBusy, setExportPdfBusy] = useState(false);
  const [exportRangeOpen, setExportRangeOpen] = useState(false);
  const [exportDays, setExportDays] = useState(1);

  // Données enrichies : on recharge les nouveaux champs (type_operation, est_chef_jour, chef_projet_id, etc.)
  const [asgsJour, setAsgsJour] = useState<ExtAssignation[]>([]);
  const [affsExt, setAffsExt] = useState<ExtAffaire[]>([]);
  const [profiles, setProfiles] = useState<Map<string, ProfileLite>>(new Map());
  const [loading, setLoading] = useState(false);

  // Modale édition
  const [editAsg, setEditAsg] = useState<{ employe: Employe; date: Date } | null>(null);

  const dateISO = format(date, "yyyy-MM-dd");

  const reload = async () => {
    setLoading(true);
    const [asgsRes, affsRes, profsRes] = await Promise.all([
      supabase
        .from("assignations")
        .select("id, date, demi_journee, heures, affaire_id, employe_id, metier_id, devis_id, notes, statut_confirmation, type_operation, est_chef_jour")
        .eq("date", dateISO),
      supabase
        .from("affaires")
        .select("id, numero, nom, lieu, client, chef_chantier_id, date_montage, date_demontage, phase, statut, chef_projet_id, charge_affaires_id"),
      supabase.from("profiles").select("id, full_name, est_manutention"),
    ]);
    setAsgsJour((asgsRes.data ?? []) as unknown as ExtAssignation[]);
    setAffsExt((affsRes.data ?? []) as unknown as ExtAffaire[]);
    const pmap = new Map<string, ProfileLite>();
    (profsRes.data ?? []).forEach((p) => pmap.set(p.id, p as ProfileLite));
    setProfiles(pmap);
    setLoading(false);
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateISO]);

  // Map employes augmentée avec est_manutention via profile
  const employesParId = useMemo(() => {
    const m = new Map<string, EmployeForResponsable>();
    employes.forEach((e) => {
      const p = (e as Employe & { profile_id?: string | null }).profile_id ?? null;
      const prof = p ? profiles.get(p) : null;
      m.set(e.id, {
        id: e.id,
        profile_id: p,
        est_manutention: prof?.est_manutention ?? false,
      });
    });
    return m;
  }, [employes, profiles]);

  // Affaires staffées ce jour
  const blocs = useMemo(() => {
    const ids = Array.from(new Set(asgsJour.map((a) => a.affaire_id)));
    return ids
      .map((id) => affsExt.find((a) => a.id === id))
      .filter((a): a is ExtAffaire => Boolean(a))
      .map((aff) => {
        const asgs = asgsJour.filter((a) => a.affaire_id === aff.id);
        const resp = resolveResponsable(
          aff,
          dateISO,
          asgs.map((a) => ({
            affaire_id: a.affaire_id,
            date: a.date,
            employe_id: a.employe_id,
            est_chef_jour: a.est_chef_jour,
          })),
          employesParId,
        );
        const respLabel = (() => {
          if (!resp.id) return "—";
          if (resp.source === "chef_du_jour" || resp.source === "manutention") {
            const e = employes.find((x) => x.id === resp.id);
            return e ? `${e.prenom} ${e.nom}` : "—";
          }
          // chef_projet / charge_affaires : id = profile_id
          const p = profiles.get(resp.id);
          return p?.full_name ?? "—";
        })();
        const operations = Array.from(
          new Set(asgs.map((a) => a.type_operation).filter((v): v is string => Boolean(v))),
        );
        return { aff, asgs, resp, respLabel, operations };
      })
      .filter((b) => {
        if (filterAdresse && !(b.aff.lieu ?? "").toLowerCase().includes(filterAdresse.toLowerCase())) {
          return false;
        }
        if (filterRespo && !b.respLabel.toLowerCase().includes(filterRespo.toLowerCase())) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.aff.numero.localeCompare(b.aff.numero, "fr", { numeric: true }));
  }, [asgsJour, affsExt, employesParId, employes, profiles, filterAdresse, filterRespo, dateISO]);

  const exportRef = useRef<HTMLDivElement>(null);

  async function handleExportExcel(days: number) {
    // On charge sur la plage demandée
    const dates = Array.from({ length: days }, (_, i) => addDays(date, i));
    const startISO = format(dates[0], "yyyy-MM-dd");
    const endISO = format(dates[dates.length - 1], "yyyy-MM-dd");
    const { data: asgsRange } = await supabase
      .from("assignations")
      .select("affaire_id, date, employe_id, metier_id, type_operation, est_chef_jour")
      .gte("date", startISO)
      .lte("date", endISO);

    const responsables = new Map<string, string>();
    const list = (asgsRange ?? []) as unknown as ExtAssignation[];
    for (const d of dates) {
      const dISO = format(d, "yyyy-MM-dd");
      const ids = Array.from(new Set(list.filter((a) => a.date === dISO).map((a) => a.affaire_id)));
      for (const id of ids) {
        const aff = affsExt.find((a) => a.id === id);
        if (!aff) continue;
        const r = resolveResponsable(
          aff,
          dISO,
          list
            .filter((a) => a.date === dISO)
            .map((a) => ({
              affaire_id: a.affaire_id,
              date: a.date,
              employe_id: a.employe_id,
              est_chef_jour: a.est_chef_jour,
            })),
          employesParId,
        );
        let label = "—";
        if (r.id) {
          if (r.source === "chef_du_jour" || r.source === "manutention") {
            const e = employes.find((x) => x.id === r.id);
            if (e) label = `${e.prenom} ${e.nom}`;
          } else {
            const p = profiles.get(r.id);
            if (p?.full_name) label = p.full_name;
          }
        }
        responsables.set(`${id}|${dISO}`, label);
      }
    }

    exportFeuilleRouteExcel({
      dates,
      affaires: affsExt.map((a) => ({ id: a.id, numero: a.numero, nom: a.nom, lieu: a.lieu })),
      employes: employes.map((e) => ({ id: e.id, prenom: e.prenom, nom: e.nom })),
      metiers: metiers.map((m) => ({ id: m.id, libelle: m.libelle })),
      assignations: list.map((a) => ({
        affaire_id: a.affaire_id,
        date: a.date,
        employe_id: a.employe_id,
        metier_id: a.metier_id,
        type_operation: a.type_operation,
      })),
      responsables,
    });
    toast.success(`Excel généré pour ${days} jour(s)`);
    setExportRangeOpen(false);
  }

  async function handleExportPDF() {
    if (!exportRef.current) return;
    setExportPdfBusy(true);
    try {
      await exportPlanningToPDF(exportRef.current, {
        weekStart: date,
        tabLabel: `Feuille de route — ${format(date, "EEEE d MMM yyyy", { locale: fr })}`,
      });
      toast.success("PDF généré");
    } catch (e) {
      console.error(e);
      toast.error("Échec export PDF");
    } finally {
      setExportPdfBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Barre de contrôle */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setDate((d) => subDays(d, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="gap-2 font-normal">
                <CalendarIcon className="h-3.5 w-3.5" />
                {format(date, "EEEE d MMMM yyyy", { locale: fr })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => d && setDate(d)}
                weekStartsOn={1}
                locale={fr}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
          <Button size="sm" variant="outline" onClick={() => setDate((d) => addDays(d, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDate(new Date())}>
            Aujourd'hui
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setExportRangeOpen(true)}>
            <FileDown className="mr-1.5 h-3.5 w-3.5" />
            Exporter Excel
          </Button>
          <Button size="sm" variant="outline" onClick={handleExportPDF} disabled={exportPdfBusy}>
            {exportPdfBusy ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileText className="mr-1.5 h-3.5 w-3.5" />
            )}
            Exporter PDF
          </Button>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid gap-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Filtre adresse
          </Label>
          <Input
            value={filterAdresse}
            onChange={(e) => setFilterAdresse(e.target.value)}
            placeholder="ex: Paris Expo…"
            className="h-8 w-[220px]"
          />
        </div>
        <div className="grid gap-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Filtre responsable
          </Label>
          <Input
            value={filterRespo}
            onChange={(e) => setFilterRespo(e.target.value)}
            placeholder="ex: Dupont…"
            className="h-8 w-[200px]"
          />
        </div>
      </div>

      {/* Cartes chantier */}
      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : blocs.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          Aucun chantier staffé ce jour.
        </div>
      ) : (
        <div ref={exportRef} className="grid gap-3">
          {blocs.map((b) => (
            <div
              key={b.aff.id}
              className="rounded-lg border bg-card p-4 shadow-sm transition-colors hover:bg-accent/30"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-mono text-sm font-bold text-primary">
                      {b.aff.numero}
                    </span>
                    <span className="text-base font-semibold">{b.aff.nom}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    📍 {b.aff.lieu ?? "Adresse non renseignée"}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {b.operations.map((op) => (
                    <span
                      key={op}
                      className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-secondary-foreground"
                    >
                      {op}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2 text-sm">
                <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
                  Chef
                </span>
                <span className="font-medium">{b.respLabel}</span>
                {b.resp.source && (
                  <span className="text-[10px] text-muted-foreground">
                    ({b.resp.source.replace(/_/g, " ")})
                  </span>
                )}
              </div>

              <div className="mt-3 border-t pt-3">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Équipe ({new Set(b.asgs.map((a) => a.employe_id)).size})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from(new Set(b.asgs.map((a) => a.employe_id))).map((empId) => {
                    const e = employes.find((x) => x.id === empId);
                    if (!e) return null;
                    const asg = b.asgs.find((a) => a.employe_id === empId)!;
                    const m = metiers.find((mm) => mm.id === asg.metier_id);
                    return (
                      <button
                        key={empId}
                        type="button"
                        onClick={() => setEditAsg({ employe: e, date })}
                        className="flex items-center gap-1.5 rounded border bg-background px-2 py-1 text-xs transition-colors hover:bg-accent"
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: m?.couleur ?? "#94a3b8" }}
                        />
                        <span className="font-medium">
                          {e.prenom} {e.nom.toUpperCase()}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          · {m?.libelle ?? ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialog plage export Excel */}
      <Dialog open={exportRangeOpen} onOpenChange={setExportRangeOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Exporter la feuille de route</DialogTitle>
            <DialogDescription>
              Plage de jours à exporter (à partir du {format(date, "d MMM yyyy", { locale: fr })}).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label>Nombre de jours (1 à 7)</Label>
            <Input
              type="number"
              min={1}
              max={7}
              value={exportDays}
              onChange={(e) =>
                setExportDays(Math.max(1, Math.min(7, Number(e.target.value) || 1)))
              }
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportRangeOpen(false)}>
              Annuler
            </Button>
            <Button onClick={() => handleExportExcel(exportDays)}>Exporter</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modale édition assignation */}
      {editAsg && (
        <AssignationDialog
          open={!!editAsg}
          onOpenChange={(o) => !o && setEditAsg(null)}
          date={editAsg.date}
          employe={editAsg.employe}
          existing={asgsJour
            .filter((a) => a.employe_id === editAsg.employe.id)
            .map((a) => ({ ...a } as Assignation))}
          affaires={affaires}
          metiers={metiers}
          consommation={[]}
          onSaved={() => {
            setEditAsg(null);
            void reload();
          }}
        />
      )}
    </div>
  );
}
