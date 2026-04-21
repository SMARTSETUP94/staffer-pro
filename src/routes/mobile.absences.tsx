import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Plus, CalendarOff, Clock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { usePreview } from "@/lib/preview-context";
import { useResolvedEmploye } from "@/hooks/use-resolved-employe";
import { PreviewBanner } from "@/components/PreviewBanner";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ABSENCE_ICON, ABSENCE_LABEL } from "@/lib/absence-helpers";
import type { Database } from "@/integrations/supabase/types";

type AbsenceType = Database["public"]["Enums"]["absence_type"];
type DemiJournee = Database["public"]["Enums"]["demi_journee_type"];
type ContratType = Database["public"]["Enums"]["contrat_type"];

interface MyAbsence {
  id: string;
  type: AbsenceType;
  date_debut: string;
  date_fin: string;
  demi_journee: DemiJournee | null;
  motif: string | null;
  valide: boolean;
  created_at: string;
}

const ABSENCE_TYPES: AbsenceType[] = ["conges", "rtt", "formation", "arret_maladie", "autre"];
// Les intérimaires gèrent leurs absences via leur agence — pas via cette appli.
const ELIGIBLE_CONTRATS: ContratType[] = ["CDI", "CDD", "Independant"];

export const Route = createFileRoute("/mobile/absences")({
  head: () => ({ meta: [{ title: "Mes absences — Setup Paris" }] }),
  component: MobileAbsences,
});

function MobileAbsences() {
  const { user } = useAuth();
  const { isPreviewing } = usePreview();
  const { employeId, loading: loadingEmploye, resolved } = useResolvedEmploye();

  const [contratType, setContratType] = useState<ContratType | null>(null);
  const [contratLoaded, setContratLoaded] = useState(false);
  const [absences, setAbsences] = useState<MyAbsence[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const today = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);
  const [form, setForm] = useState({
    type: "conges" as AbsenceType,
    date_debut: today,
    date_fin: today,
    demi_journee: "JOURNEE" as DemiJournee | "FULL_PERIOD",
    motif: "",
  });

  // Récupère le type_contrat (non exposé par useResolvedEmploye)
  useEffect(() => {
    let cancelled = false;
    if (!employeId) {
      setContratType(null);
      setContratLoaded(resolved);
      return;
    }
    setContratLoaded(false);
    supabase
      .from("employes")
      .select("type_contrat")
      .eq("id", employeId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setContratType((data?.type_contrat as ContratType) ?? null);
        setContratLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [employeId, resolved]);

  const isInterim = contratType === "Interim";
  const eligible = contratType !== null && ELIGIBLE_CONTRATS.includes(contratType);

  async function loadAbsences() {
    if (!employeId) {
      setAbsences([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("absences")
      .select("id, type, date_debut, date_fin, demi_journee, motif, valide, created_at")
      .eq("employe_id", employeId)
      .order("date_debut", { ascending: false })
      .limit(100);
    if (error) {
      toast.error("Impossible de charger vos absences");
    } else {
      setAbsences((data ?? []) as MyAbsence[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (resolved && employeId) loadAbsences();
    if (resolved && !employeId) setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeId, resolved]);

  function resetForm() {
    setForm({
      type: "conges",
      date_debut: today,
      date_fin: today,
      demi_journee: "JOURNEE",
      motif: "",
    });
  }

  function openNew() {
    resetForm();
    setOpen(true);
  }

  async function handleSubmit() {
    if (!employeId) return;
    if (form.date_fin < form.date_debut) {
      toast.error("La date de fin doit être ≥ date de début");
      return;
    }
    setSaving(true);
    const demi: DemiJournee | null =
      form.demi_journee === "FULL_PERIOD" ? null : (form.demi_journee as DemiJournee);
    const { error } = await supabase.from("absences").insert({
      employe_id: employeId,
      type: form.type,
      date_debut: form.date_debut,
      date_fin: form.date_fin,
      demi_journee: demi,
      motif: form.motif.trim() || null,
      valide: false, // demande employé → en attente de validation chef
      created_by: user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Demande envoyée — en attente de validation");
    setOpen(false);
    resetForm();
    loadAbsences();
  }

  // États de chargement / inéligibilité
  if (loadingEmploye || !contratLoaded) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </Shell>
    );
  }

  if (!employeId) {
    return (
      <Shell>
        <EmptyState
          title="Aucune fiche employé liée"
          message="Votre compte n'est pas encore lié à une fiche employé. Contactez votre administrateur."
        />
      </Shell>
    );
  }

  if (isInterim) {
    return (
      <Shell>
        <EmptyState
          title="Absences gérées par votre agence"
          message="En tant qu'intérimaire, vos absences sont gérées par votre agence d'intérim. Cette fonctionnalité n'est pas disponible ici."
        />
      </Shell>
    );
  }

  if (!eligible) {
    return (
      <Shell>
        <EmptyState
          title="Module non disponible"
          message="Aucun type de contrat éligible pour la demande d'absence."
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {absences.length} absence{absences.length > 1 ? "s" : ""}
        </p>
        <Button size="sm" onClick={openNew} disabled={isPreviewing} className="gap-1">
          <Plus className="h-4 w-4" />
          Demander
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : absences.length === 0 ? (
        <EmptyState
          title="Aucune absence"
          message="Vous n'avez pas encore déclaré d'absence. Touchez « Demander » pour commencer."
          icon={<CalendarOff className="h-8 w-8 text-muted-foreground" />}
        />
      ) : (
        <ul className="space-y-2">
          {absences.map((a) => (
            <AbsenceCard key={a.id} absence={a} />
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Demander une absence</DialogTitle>
            <DialogDescription>
              Votre demande sera envoyée à votre chef pour validation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm((f) => ({ ...f, type: v as AbsenceType }))}
              >
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ABSENCE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ABSENCE_ICON[t]} {ABSENCE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="date_debut">Du</Label>
                <Input
                  id="date_debut"
                  type="date"
                  value={form.date_debut}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      date_debut: e.target.value,
                      date_fin: f.date_fin < e.target.value ? e.target.value : f.date_fin,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date_fin">Au</Label>
                <Input
                  id="date_fin"
                  type="date"
                  min={form.date_debut}
                  value={form.date_fin}
                  onChange={(e) => setForm((f) => ({ ...f, date_fin: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="demi">Période</Label>
              <Select
                value={form.demi_journee}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, demi_journee: v as DemiJournee | "FULL_PERIOD" }))
                }
              >
                <SelectTrigger id="demi">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FULL_PERIOD">Toute la période</SelectItem>
                  <SelectItem value="JOURNEE">Journée complète</SelectItem>
                  <SelectItem value="AM">Matin uniquement</SelectItem>
                  <SelectItem value="PM">Après-midi uniquement</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="motif">
                Motif {form.type === "autre" ? "(obligatoire)" : "(optionnel)"}
              </Label>
              <Textarea
                id="motif"
                value={form.motif}
                maxLength={500}
                placeholder="Précisez si nécessaire…"
                onChange={(e) => setForm((f) => ({ ...f, motif: e.target.value }))}
              />
              <p className="text-[10px] text-muted-foreground text-right">
                {form.motif.length}/500
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Annuler
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={saving || (form.type === "autre" && !form.motif.trim())}
            >
              {saving ? "Envoi…" : "Envoyer la demande"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background pb-20">
      <PreviewBanner />
      <header className="border-b border-border bg-card px-4 py-4">
        <div className="mx-auto max-w-md">
          <p className="overline">— Mes absences</p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-foreground">
            Congés & arrêts
          </h1>
        </div>
      </header>
      <main className="mx-auto max-w-md space-y-4 px-4 py-6">{children}</main>
      <MobileBottomNav />
    </div>
  );
}

function EmptyState({
  title,
  message,
  icon,
}: {
  title: string;
  message: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/50 p-6 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        {icon ?? <CalendarOff className="h-6 w-6 text-muted-foreground" />}
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

function AbsenceCard({ absence }: { absence: MyAbsence }) {
  const debut = parseISO(absence.date_debut);
  const fin = parseISO(absence.date_fin);
  const sameDay = absence.date_debut === absence.date_fin;
  const periodeLabel =
    absence.demi_journee === "AM"
      ? "Matin"
      : absence.demi_journee === "PM"
        ? "Après-midi"
        : absence.demi_journee === "JOURNEE"
          ? "Journée"
          : "Toute la période";

  return (
    <li className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-lg leading-none">{ABSENCE_ICON[absence.type]}</span>
            <p className="text-sm font-semibold text-foreground">
              {ABSENCE_LABEL[absence.type]}
            </p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {sameDay
              ? format(debut, "EEEE d MMMM yyyy", { locale: fr })
              : `Du ${format(debut, "d MMM", { locale: fr })} au ${format(fin, "d MMM yyyy", { locale: fr })}`}
            {" · "}
            {periodeLabel}
          </p>
          {absence.motif && (
            <p className="mt-2 text-xs text-foreground/80 italic">« {absence.motif} »</p>
          )}
        </div>
        {absence.valide ? (
          <Badge variant="default" className="gap-1 shrink-0">
            <CheckCircle2 className="h-3 w-3" />
            Validée
          </Badge>
        ) : (
          <Badge variant="secondary" className="gap-1 shrink-0">
            <Clock className="h-3 w-3" />
            En attente
          </Badge>
        )}
      </div>
    </li>
  );
}
