import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Bug,
  Lightbulb,
  HelpCircle,
  Sparkles,
  Image as ImageIcon,
  Loader2,
  ExternalLink,
  Trash2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_app/admin/feedback")({
  component: FeedbackAdminPage,
});

type Feedback = Database["public"]["Tables"]["feedbacks"]["Row"] & {
  author?: { full_name: string | null; email: string } | null;
};

type Statut = Database["public"]["Enums"]["feedback_statut"];
type Priorite = Database["public"]["Enums"]["feedback_priorite"];
type Type = Database["public"]["Enums"]["feedback_type"];

const TYPE_META: Record<Type, { label: string; icon: typeof Bug; className: string }> = {
  bug: { label: "Bug", icon: Bug, className: "bg-destructive/15 text-destructive border-destructive/30" },
  idee: { label: "Idée", icon: Lightbulb, className: "bg-warning/15 text-warning border-warning/30" },
  amelioration: {
    label: "Amélioration",
    icon: Sparkles,
    className: "bg-success/15 text-success border-success/30",
  },
  question: { label: "Question", icon: HelpCircle, className: "bg-info/15 text-info border-info/30" },
};

const PRIO_META: Record<Priorite, { label: string; className: string }> = {
  critique: { label: "Critique", className: "bg-destructive text-destructive-foreground" },
  haute: { label: "Haute", className: "bg-destructive/15 text-destructive border-destructive/30" },
  moyenne: { label: "Moyenne", className: "bg-warning/15 text-warning border-warning/30" },
  basse: { label: "Basse", className: "bg-muted text-muted-foreground border-border" },
};

const STATUT_META: Record<Statut, { label: string; className: string }> = {
  nouveau: { label: "Nouveau", className: "bg-primary/15 text-primary border-primary/30" },
  en_cours: { label: "En cours", className: "bg-info/15 text-info border-info/30" },
  resolu: { label: "Résolu", className: "bg-success/15 text-success border-success/30" },
  ferme: { label: "Fermé", className: "bg-muted text-muted-foreground border-border" },
  rejete: { label: "Rejeté", className: "bg-destructive/15 text-destructive border-destructive/30" },
};

function FeedbackAdminPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatut, setFilterStatut] = useState<Statut | "tous">("tous");
  const [filterType, setFilterType] = useState<Type | "tous">("tous");
  const [selected, setSelected] = useState<Feedback | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      navigate({ to: "/dashboard" });
    }
  }, [isAdmin, navigate]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("feedbacks")
      .select("*, author:profiles!feedbacks_author_id_fkey(full_name, email)")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((data ?? []) as Feedback[]);
  };

  useEffect(() => {
    if (isAdmin) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filterStatut !== "tous" && r.statut !== filterStatut) return false;
      if (filterType !== "tous" && r.type !== filterType) return false;
      return true;
    });
  }, [rows, filterStatut, filterType]);

  const stats = useMemo(() => {
    return {
      total: rows.length,
      nouveau: rows.filter((r) => r.statut === "nouveau").length,
      en_cours: rows.filter((r) => r.statut === "en_cours").length,
      resolu: rows.filter((r) => r.statut === "resolu").length,
      critique: rows.filter((r) => r.priorite === "critique" && !["resolu", "ferme"].includes(r.statut)).length,
    };
  }, [rows]);

  if (!isAdmin) return null;

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Signalements & suggestions"
        description="Bugs, idées et améliorations remontés par les chefs de chantier."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Nouveaux" value={stats.nouveau} accent="primary" />
        <StatCard label="En cours" value={stats.en_cours} accent="blue" />
        <StatCard label="Résolus" value={stats.resolu} accent="emerald" />
        <StatCard label="Critiques ouverts" value={stats.critique} accent="destructive" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={filterStatut} onValueChange={(v) => setFilterStatut(v as Statut | "tous")}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tous">Tous les statuts</SelectItem>
            {(Object.keys(STATUT_META) as Statut[]).map((s) => (
              <SelectItem key={s} value={s}>
                {STATUT_META[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterType} onValueChange={(v) => setFilterType(v as Type | "tous")}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tous">Tous les types</SelectItem>
            {(Object.keys(TYPE_META) as Type[]).map((t) => (
              <SelectItem key={t} value={t}>
                {TYPE_META[t].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" onClick={load}>
          Rafraîchir
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement…
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Aucun signalement pour le moment.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((fb) => (
            <FeedbackCard key={fb.id} feedback={fb} onClick={() => setSelected(fb)} />
          ))}
        </div>
      )}

      <FeedbackDialog feedback={selected} onClose={() => setSelected(null)} onChanged={load} />
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "primary" | "destructive" | "blue" | "emerald";
}) {
  const accentMap: Record<string, string> = {
    primary: "text-primary",
    destructive: "text-destructive",
    blue: "text-blue-600",
    emerald: "text-emerald-600",
  };
  return (
    <Card>
      <CardContent className="p-4">
        <div className={cn("text-2xl font-bold leading-none", accent && accentMap[accent])}>{value}</div>
        <div className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}

function FeedbackCard({ feedback, onClick }: { feedback: Feedback; onClick: () => void }) {
  const TypeIcon = TYPE_META[feedback.type].icon;
  return (
    <Card
      className="cursor-pointer transition-colors hover:border-primary/50"
      onClick={onClick}
    >
      <CardContent className="flex flex-col gap-2 p-4 md:flex-row md:items-start">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <TypeIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={TYPE_META[feedback.type].className}>
              {TYPE_META[feedback.type].label}
            </Badge>
            <Badge variant="outline" className={PRIO_META[feedback.priorite].className}>
              {PRIO_META[feedback.priorite].label}
            </Badge>
            <Badge variant="outline" className={STATUT_META[feedback.statut].className}>
              {STATUT_META[feedback.statut].label}
            </Badge>
            {feedback.screenshot_path && (
              <Badge variant="outline" className="gap-1 text-xs">
                <ImageIcon className="h-3 w-3" />
                Capture
              </Badge>
            )}
          </div>
          <div className="mt-1.5 text-sm font-semibold">{feedback.titre}</div>
          <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{feedback.description}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span>
              {feedback.author?.full_name ?? feedback.author?.email ?? "—"}
            </span>
            <span>·</span>
            <span>{format(new Date(feedback.created_at), "d MMM yyyy 'à' HH:mm", { locale: fr })}</span>
            {feedback.page_url && (
              <>
                <span>·</span>
                <span className="font-mono">{feedback.page_url}</span>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FeedbackDialog({
  feedback,
  onClose,
  onChanged,
}: {
  feedback: Feedback | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [statut, setStatut] = useState<Statut>("nouveau");
  const [notesAdmin, setNotesAdmin] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!feedback) return;
    setStatut(feedback.statut);
    setNotesAdmin(feedback.notes_admin ?? "");
    setScreenshotUrl(null);

    if (feedback.screenshot_path) {
      supabase.storage
        .from("feedback-screenshots")
        .createSignedUrl(feedback.screenshot_path, 3600)
        .then(({ data, error }) => {
          if (error) {
            console.error("[feedback] signed url failed", error);
            return;
          }
          setScreenshotUrl(data.signedUrl);
        });
    }
  }, [feedback]);

  if (!feedback) return null;

  const save = async () => {
    setBusy(true);
    const { error } = await supabase
      .from("feedbacks")
      .update({ statut, notes_admin: notesAdmin || null })
      .eq("id", feedback.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Signalement mis à jour.");
    onChanged();
    onClose();
  };

  const remove = async () => {
    if (!confirm("Supprimer définitivement ce signalement ?")) return;
    setBusy(true);
    if (feedback.screenshot_path) {
      await supabase.storage.from("feedback-screenshots").remove([feedback.screenshot_path]);
    }
    const { error } = await supabase.from("feedbacks").delete().eq("id", feedback.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Supprimé.");
    onChanged();
    onClose();
  };

  return (
    <Dialog open={feedback !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {feedback.titre}
          </DialogTitle>
          <DialogDescription>
            Par {feedback.author?.full_name ?? feedback.author?.email ?? "—"} —{" "}
            {format(new Date(feedback.created_at), "d MMM yyyy 'à' HH:mm", { locale: fr })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className={TYPE_META[feedback.type].className}>
              {TYPE_META[feedback.type].label}
            </Badge>
            <Badge variant="outline" className={PRIO_META[feedback.priorite].className}>
              Priorité : {PRIO_META[feedback.priorite].label}
            </Badge>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
            {feedback.description}
          </div>

          {feedback.page_url && (
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold">Page concernée :</span>{" "}
              <a
                href={feedback.page_url}
                className="inline-flex items-center gap-1 font-mono text-primary hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                {feedback.page_url} <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

          {feedback.user_agent && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer font-semibold">Navigateur</summary>
              <p className="mt-1 font-mono">{feedback.user_agent}</p>
            </details>
          )}

          {feedback.screenshot_path && (
            <div>
              <div className="mb-1.5 text-xs font-semibold text-muted-foreground">Capture d'écran</div>
              {screenshotUrl ? (
                <a href={screenshotUrl} target="_blank" rel="noreferrer">
                  <img
                    src={screenshotUrl}
                    alt="Capture du signalement"
                    className="max-h-96 w-full rounded-lg border border-border object-contain"
                  />
                </a>
              ) : (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Chargement de la capture…
                </div>
              )}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Statut</label>
              <Select value={statut} onValueChange={(v) => setStatut(v as Statut)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUT_META) as Statut[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUT_META[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold">Notes admin (privées)</label>
            <Textarea
              rows={4}
              value={notesAdmin}
              onChange={(e) => setNotesAdmin(e.target.value)}
              placeholder="Décision, lien vers le ticket, etc."
            />
          </div>

          {feedback.statut === "resolu" && feedback.resolved_at && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-400">
              <AlertCircle className="h-4 w-4" />
              Résolu le {format(new Date(feedback.resolved_at), "d MMM yyyy", { locale: fr })}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="destructive" onClick={remove} disabled={busy} size="sm">
            <Trash2 className="mr-1 h-4 w-4" /> Supprimer
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Fermer
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Enregistrer
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
