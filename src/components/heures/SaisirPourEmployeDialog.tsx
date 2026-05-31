/**
 * Bloc 1b v0.21 — Modale ponctuelle "Saisir pour un employé"
 *
 * Permet à un chef/admin de créer (ou mettre à jour si elle existe)
 * une saisie d'heures pour un employé donné, sur une date + une affaire.
 *
 * Comportement :
 * - Statut créé directement en 'valide' (Q2=A : la saisie chef vaut validation)
 * - saisi_par + saisi_par_chef sont remplis par les triggers DB
 * - Si une saisie existe déjà (même employé/date/affaire), on UPSERT (mise à jour)
 * - Auto-calcul des heures via heure_debut / heure_fin / pause
 */
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarIcon, ChevronDown, Hammer, Loader2, Moon, UserCog } from "lucide-react";
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
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { computeHeuresFromTimes } from "@/lib/heures-calculator";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  ETAPE_CHANTIER_OPTIONS,
  type EtapeChantierRow,
  type FabricationEtapeTypeRow,
} from "@/hooks/use-mes-heures";
import { useObjetsAffaireLight } from "@/hooks/use-objets-affaire-light";

const ETAPE_FAB_LABEL_MAP: Record<FabricationEtapeTypeRow, string> = {
  be: "BE (dessin)",
  usinage: "Usinage Numérique",
  respo_fab: "Respo Fab (construction)",
  finition: "Finition",
  manutention: "Manutention",
};
const ETAPE_FAB_OPTIONS: FabricationEtapeTypeRow[] = [
  "be",
  "usinage",
  "respo_fab",
  "finition",
  "manutention",
];

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
  /** Préfill optionnel */
  defaultEmployeId?: string;
  defaultDate?: Date;
  defaultAffaireId?: string;
  /** Callback après succès */
  onCreated?: () => void;
}

export function SaisirPourEmployeDialog({
  open,
  onOpenChange,
  defaultEmployeId,
  defaultDate,
  defaultAffaireId,
  onCreated,
}: Props) {
  const { user } = useAuth();
  const [employes, setEmployes] = useState<EmployeOpt[]>([]);
  const [affaires, setAffaires] = useState<AffaireOpt[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [employeId, setEmployeId] = useState<string>(defaultEmployeId ?? "");
  const [date, setDate] = useState<Date | undefined>(defaultDate ?? new Date());
  const [affaireId, setAffaireId] = useState<string>(defaultAffaireId ?? "");
  const [debut, setDebut] = useState<string>("08:00");
  const [fin, setFin] = useState<string>("17:00");
  const [pause, setPause] = useState<string>("60");
  const [commentaire, setCommentaire] = useState<string>("");

  // Reset à l'ouverture
  useEffect(() => {
    if (!open) return;
    setEmployeId(defaultEmployeId ?? "");
    setDate(defaultDate ?? new Date());
    setAffaireId(defaultAffaireId ?? "");
    setDebut("08:00");
    setFin("17:00");
    setPause("60");
    setCommentaire("");
  }, [open, defaultEmployeId, defaultDate, defaultAffaireId]);

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

  const computed = useMemo(
    () => computeHeuresFromTimes(debut, fin, Number(pause) || 0),
    [debut, fin, pause],
  );

  const dateStr = date ? format(date, "yyyy-MM-dd") : null;

  // Filtrage des affaires saisissables sur la date sélectionnée (Bloc 4)
  const affairesSelectables = useMemo(() => {
    if (!dateStr) return affaires;
    return affaires.filter((a) => {
      if (a.statut === "annule") return false;
      if (a.statut === "termine") {
        if (!a.date_demontage) return a.id === affaireId; // garde la sélection courante
        return dateStr <= a.date_demontage;
      }
      return true;
    });
  }, [affaires, dateStr, affaireId]);

  const canSubmit =
    !!employeId && !!dateStr && !!affaireId && !!computed && computed.heuresReelles > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !computed || !dateStr) return;
    setSubmitting(true);
    try {
      // Cherche une saisie existante pour upsert
      const { data: existing } = await supabase
        .from("heures_saisies")
        .select("id")
        .eq("employe_id", employeId)
        .eq("date", dateStr)
        .eq("affaire_id", affaireId)
        .maybeSingle();

      const payload = {
        employe_id: employeId,
        date: dateStr,
        affaire_id: affaireId,
        heure_debut: debut,
        heure_fin: fin,
        duree_pause_minutes: Number(pause) || 0,
        heures_reelles: computed.heuresReelles,
        heures_nuit: computed.heuresNuit,
        commentaire: commentaire.trim() || null,
        statut: "valide" as const,
        valide_par: user?.id ?? null,
        valide_le: new Date().toISOString(),
      };

      if (existing) {
        const { error } = await supabase
          .from("heures_saisies")
          .update(payload)
          .eq("id", existing.id);
        if (error) throw error;
        toast.success("Saisie mise à jour et validée");
      } else {
        const { error } = await supabase.from("heures_saisies").insert(payload);
        if (error) throw error;
        toast.success("Heures saisies et validées pour l'employé");
      }
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
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5 text-primary" />
            Saisir des heures pour un employé
          </DialogTitle>
          <DialogDescription>
            La saisie sera créée en statut <strong>validé</strong>. L'employé sera notifié.
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
                <Label className="text-xs">Employé</Label>
                <Select value={employeId} onValueChange={setEmployeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner…" />
                  </SelectTrigger>
                  <SelectContent>
                    {employes.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.prenom} {e.nom}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !date && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {date ? format(date, "EEEE d MMMM yyyy", { locale: fr }) : "Sélectionner"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      weekStartsOn={1}
                      selected={date}
                      onSelect={setDate}
                      locale={fr}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div>
              <Label className="text-xs">Affaire</Label>
              <Select value={affaireId} onValueChange={setAffaireId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner une affaire…" />
                </SelectTrigger>
                <SelectContent>
                  {affairesSelectables.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      <span className="font-mono text-xs font-semibold">{a.numero}</span> — {a.nom}
                      {a.statut === "termine" && (
                        <span className="ml-2 text-[10px] text-muted-foreground">(clôturée)</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {affairesSelectables.length === 0 && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Aucune affaire saisissable à cette date.
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Heure début</Label>
                <Input type="time" value={debut} onChange={(e) => setDebut(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Heure fin</Label>
                <Input type="time" value={fin} onChange={(e) => setFin(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Pause (min)</Label>
                <Input
                  type="number"
                  min="0"
                  step="5"
                  value={pause}
                  onChange={(e) => setPause(e.target.value)}
                />
              </div>
            </div>

            {computed && (
              <Alert>
                <AlertDescription className="text-sm">
                  Calcul auto : <strong>{computed.heuresReelles}h</strong> réalisées
                  {computed.heuresNuit > 0 && ` · ${computed.heuresNuit}h de nuit`}
                </AlertDescription>
              </Alert>
            )}

            <div>
              <Label className="text-xs">Commentaire (optionnel)</Label>
              <Textarea
                rows={2}
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
                placeholder="Ex : employé sans smartphone, saisie a posteriori"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Saisir et valider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
