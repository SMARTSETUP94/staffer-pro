/**
 * Lot 8.4 MVP — Timeline du journal d'un objet de fabrication.
 *
 * Lit `objet_journal_events` via le SF `getObjetJournal` et affiche les
 * événements les plus récents (étapes validées, photos uploadées, commentaires,
 * republications de plan, etc.) avec icône, label humain et timestamp.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  XCircle,
  Circle,
  Camera,
  MessageSquare,
  Pencil,
  RefreshCw,
  Flag,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getObjetJournal } from "@/server/objet-journal.functions";

interface Props {
  objetId: string;
}

type EventType =
  | "journal_started"
  | "etape_validee"
  | "etape_invalidee"
  | "etape_statut_change"
  | "photo_uploaded"
  | "photo_supprimee"
  | "commentaire"
  | "commentaire_supprime"
  | "identite_modifiee"
  | "plan_republie";

const META: Record<EventType, { label: string; icon: React.ElementType; color: string }> = {
  journal_started: { label: "Journal ouvert", icon: Flag, color: "text-muted-foreground" },
  etape_validee: { label: "Étape validée", icon: CheckCircle2, color: "text-emerald-600" },
  etape_invalidee: { label: "Étape invalidée", icon: XCircle, color: "text-amber-600" },
  etape_statut_change: { label: "Statut étape", icon: Circle, color: "text-sky-600" },
  photo_uploaded: { label: "Photo ajoutée", icon: Camera, color: "text-indigo-600" },
  photo_supprimee: { label: "Photo retirée", icon: Trash2, color: "text-rose-600" },
  commentaire: { label: "Commentaire", icon: MessageSquare, color: "text-sky-700" },
  commentaire_supprime: { label: "Commentaire retiré", icon: Trash2, color: "text-rose-600" },
  identite_modifiee: { label: "Identité modifiée", icon: Pencil, color: "text-muted-foreground" },
  plan_republie: { label: "Plan républié", icon: RefreshCw, color: "text-amber-700" },
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function ObjetJournalTimeline({ objetId }: Props) {
  const fetchJournal = useServerFn(getObjetJournal);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["objet-journal", objetId],
    queryFn: () => fetchJournal({ data: { objetId, limit: 100 } }),
    staleTime: 30_000,
  });

  return (
    <Card data-testid="objet-journal-timeline">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : isError ? (
          <p className="text-xs text-destructive">Erreur de chargement du journal.</p>
        ) : !data || data.events.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aucun événement pour le moment.</p>
        ) : (
          <ol className="space-y-3">
            {data.events.map((e) => {
              const meta = META[e.event_type as EventType] ?? META.journal_started;
              const Icon = meta.icon;
              return (
                <li key={e.id} className="flex gap-3">
                  <div className={`mt-0.5 ${meta.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">{meta.label}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {fmtDate(e.occurred_at)}
                      </span>
                    </div>
                    {e.actor_label && (
                      <span className="text-xs text-muted-foreground">{e.actor_label}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
