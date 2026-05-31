/**
 * Bloc 1b v0.21 — Modale "Saisir en bulk"
 *
 * Permet à un chef de saisir des heures pour plusieurs employés × plusieurs jours
 * sur une même affaire, avec valeurs par défaut (8h-17h pause 60min).
 *
 * Comportement :
 * - Sélection multi-employés + multi-jours via cases à cocher
 * - Aperçu avant validation : nb cellules à créer, nb skippées (déjà saisies)
 * - Skip automatique des cellules où une saisie existe déjà (employé/date/affaire)
 * - Statut créé en 'valide' (Q2=A)
 */
import { useEffect, useMemo, useState } from "react";
import { addDays, format, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatBusinessError } from "@/lib/business-errors";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { computeHeuresFromTimes } from "@/lib/heures-calculator";
import { useAuth } from "@/lib/auth-context";
import { insertHeuresSaisieBatch, type HeuresUpsertInput } from "@/lib/heures-upsert";

interface EmployeOpt {
  id: string;
  prenom: string;
  nom: string;
}

interface AffaireOpt {
  id: string;
  numero: string;
  nom: string;
  statut: string;
  date_demontage: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultWeekStart?: Date;
  /** Préfill optionnel depuis le contexte */
  defaultEmployeIds?: string[];
  defaultAffaireId?: string;
  onCreated?: () => void;
}

export function BulkSaisieDialog({
  open,
  onOpenChange,
  defaultWeekStart,
  defaultEmployeIds,
  defaultAffaireId,
  onCreated,
}: Props) {
  const { user } = useAuth();
  const [loadingRefs, setLoadingRefs] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [employes, setEmployes] = useState<EmployeOpt[]>([]);
  const [affaires, setAffaires] = useState<AffaireOpt[]>([]);

  const [weekStart, setWeekStart] = useState<Date>(
    defaultWeekStart ?? startOfWeek(new Date(), { weekStartsOn: 1 }),
  );
  const [selectedEmployes, setSelectedEmployes] = useState<Set<string>>(
    new Set(defaultEmployeIds ?? []),
  );
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
  const [affaireId, setAffaireId] = useState<string>(defaultAffaireId ?? "");
  const [debut, setDebut] = useState<string>("08:00");
  const [fin, setFin] = useState<string>("17:00");
  const [pause, setPause] = useState<string>("60");

  const [preview, setPreview] = useState<{
    toCreate: number;
    toSkip: number;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedEmployes(new Set(defaultEmployeIds ?? []));
    setAffaireId(defaultAffaireId ?? "");
    setWeekStart(defaultWeekStart ?? startOfWeek(new Date(), { weekStartsOn: 1 }));
    // Par défaut : Lun-Ven cochés
    const ws = defaultWeekStart ?? startOfWeek(new Date(), { weekStartsOn: 1 });
    const defaults = new Set<string>();
    for (let i = 0; i < 5; i++) defaults.add(format(addDays(ws, i), "yyyy-MM-dd"));
    setSelectedDays(defaults);
    setDebut("08:00");
    setFin("17:00");
    setPause("60");
    setPreview(null);
  }, [open, defaultWeekStart, defaultEmployeIds, defaultAffaireId]);

  useEffect(() => {
    if (!open) return;
    setLoadingRefs(true);
    Promise.all([
      supabase
        .from("employes")
        .select("id, prenom, nom")
        .eq("actif", true)
        .order("nom")
        .limit(1000),
      supabase
        .from("affaires")
        .select("id, numero, nom, statut, date_demontage")
        .in("statut", ["en_cours", "prospect", "termine"])
        .order("numero", { ascending: false })
        .limit(1000),
    ]).then(([eRes, aRes]) => {
      setEmployes((eRes.data ?? []) as EmployeOpt[]);
      setAffaires((aRes.data ?? []) as AffaireOpt[]);
      setLoadingRefs(false);
    });
  }, [open]);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const computed = useMemo(
    () => computeHeuresFromTimes(debut, fin, Number(pause) || 0),
    [debut, fin, pause],
  );

  const toggleEmploye = (id: string) => {
    setSelectedEmployes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPreview(null);
  };

  const toggleDay = (d: string) => {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
    setPreview(null);
  };

  const totalCells = selectedEmployes.size * selectedDays.size;
  const selectedAffaire = affaires.find((a) => a.id === affaireId);

  // Filtre dates impossibles si l'affaire est terminée
  const validDays = useMemo(() => {
    if (!selectedAffaire) return Array.from(selectedDays);
    if (selectedAffaire.statut === "annule") return [];
    if (selectedAffaire.statut === "termine") {
      if (!selectedAffaire.date_demontage) return [];
      return Array.from(selectedDays).filter((d) => d <= selectedAffaire.date_demontage!);
    }
    return Array.from(selectedDays);
  }, [selectedDays, selectedAffaire]);

  const handlePreview = async () => {
    if (!affaireId || selectedEmployes.size === 0 || selectedDays.size === 0) return;
    const empIds = Array.from(selectedEmployes);
    const { data, error } = await supabase
      .from("heures_saisies")
      .select("employe_id, date")
      .eq("affaire_id", affaireId)
      .in("employe_id", empIds)
      .in("date", validDays);
    if (error) {
      toast.error(...formatBusinessError(error));
      return;
    }
    const existing = new Set((data ?? []).map((r) => `${r.employe_id}|${r.date}`));
    let toCreate = 0;
    let toSkip = 0;
    for (const empId of empIds) {
      for (const d of validDays) {
        if (existing.has(`${empId}|${d}`)) toSkip++;
        else toCreate++;
      }
    }
    // Compte aussi les jours filtrés par lock affaire comme skip (informatif)
    const lockedDays = selectedDays.size - validDays.length;
    toSkip += lockedDays * empIds.length;
    setPreview({ toCreate, toSkip });
  };

  const handleSubmit = async () => {
    if (!preview || !computed || !affaireId) return;
    setSubmitting(true);
    try {
      const empIds = Array.from(selectedEmployes);
      // Re-fetch existants pour éviter race condition
      const { data: existingRows } = await supabase
        .from("heures_saisies")
        .select("employe_id, date")
        .eq("affaire_id", affaireId)
        .in("employe_id", empIds)
        .in("date", validDays);
      const existing = new Set((existingRows ?? []).map((r) => `${r.employe_id}|${r.date}`));

      const inputs: HeuresUpsertInput[] = [];
      for (const empId of empIds) {
        for (const d of validDays) {
          if (existing.has(`${empId}|${d}`)) continue;
          inputs.push({
            employe_id: empId,
            date: d,
            affaire_id: affaireId,
            heure_debut: debut,
            heure_fin: fin,
            duree_pause_minutes: Number(pause) || 0,
            heures_reelles: computed.heuresReelles,
            heures_nuit: computed.heuresNuit,
            statut: "valide",
            valide_par: user?.id ?? null,
          });
        }
      }
      if (inputs.length === 0) {
        toast.warning("Rien à créer (toutes les cellules existent déjà).");
        setSubmitting(false);
        return;
      }
      // Insert par batch de 200 pour éviter payloads trop gros
      const BATCH = 200;
      let inserted = 0;
      for (let i = 0; i < inputs.length; i += BATCH) {
        const slice = inputs.slice(i, i + BATCH);
        const { error } = await insertHeuresSaisieBatch(supabase, slice);
        if (error) throw error;
        inserted += slice.length;
      }
      toast.success(`${inserted} saisie(s) créée(s) et validée(s)`);
      onCreated?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(...formatBusinessError(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Saisir en bulk
          </DialogTitle>
          <DialogDescription>
            Crée des saisies pour plusieurs employés sur plusieurs jours.
            Les cellules déjà saisies sont ignorées automatiquement.
          </DialogDescription>
        </DialogHeader>

        {loadingRefs ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Chargement…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Affaire</Label>
                <Select value={affaireId} onValueChange={(v) => { setAffaireId(v); setPreview(null); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner…" />
                  </SelectTrigger>
                  <SelectContent>
                    {affaires
                      .filter((a) => a.statut !== "annule")
                      .map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          <span className="font-mono text-xs">{a.numero}</span> — {a.nom}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Début</Label>
                  <Input type="time" value={debut} onChange={(e) => { setDebut(e.target.value); setPreview(null); }} />
                </div>
                <div>
                  <Label className="text-xs">Fin</Label>
                  <Input type="time" value={fin} onChange={(e) => { setFin(e.target.value); setPreview(null); }} />
                </div>
                <div>
                  <Label className="text-xs">Pause</Label>
                  <Input type="number" min="0" step="5" value={pause} onChange={(e) => { setPause(e.target.value); setPreview(null); }} />
                </div>
              </div>
            </div>

            {computed && (
              <p className="text-xs text-muted-foreground">
                Par cellule : <strong>{computed.heuresReelles}h</strong>
                {computed.heuresNuit > 0 && ` (dont ${computed.heuresNuit}h nuit)`}
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1.5 block">Jours</Label>
                <div className="flex flex-wrap gap-1.5">
                  {days.map((d) => {
                    const dStr = format(d, "yyyy-MM-dd");
                    const checked = selectedDays.has(dStr);
                    return (
                      <button
                        key={dStr}
                        type="button"
                        onClick={() => toggleDay(dStr)}
                        className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                          checked
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background hover:bg-muted"
                        }`}
                      >
                        {format(d, "EEE d", { locale: fr })}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label className="text-xs mb-1.5 block">
                  Employés ({selectedEmployes.size}/{employes.length})
                </Label>
                <ScrollArea className="h-44 rounded-md border border-border p-2">
                  <div className="space-y-1">
                    {employes.map((e) => (
                      <label
                        key={e.id}
                        className="flex items-center gap-2 cursor-pointer rounded px-1 py-0.5 hover:bg-muted text-sm"
                      >
                        <Checkbox
                          checked={selectedEmployes.has(e.id)}
                          onCheckedChange={() => toggleEmploye(e.id)}
                        />
                        <span>
                          {e.prenom} {e.nom}
                        </span>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
              <div className="text-sm">
                Total potentiel : <strong>{totalCells}</strong> cellule(s)
              </div>
              <Button size="sm" variant="outline" onClick={handlePreview} disabled={!affaireId || totalCells === 0}>
                Aperçu
              </Button>
            </div>

            {preview && (
              <Alert>
                <AlertDescription className="flex items-center gap-3 text-sm">
                  <Badge className="bg-emerald-500/15 text-emerald-700">{preview.toCreate} à créer</Badge>
                  {preview.toSkip > 0 && (
                    <Badge variant="outline">{preview.toSkip} ignorée(s) (déjà saisies ou affaire fermée)</Badge>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!preview || preview.toCreate === 0 || submitting}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Créer {preview?.toCreate ?? 0} saisie(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
