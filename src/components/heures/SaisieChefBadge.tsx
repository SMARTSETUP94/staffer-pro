/**
 * Bloc 1b v0.21 — Badge 👤 + popover historique
 *
 * Affiché sur les saisies créées par un chef (saisi_par_chef = true).
 * Au clic, ouvre un popover avec l'historique des actions sur cette saisie
 * (depuis heures_saisies_historique).
 */
import { useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Loader2, UserCog } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface HistoryRow {
  id: string;
  created_at: string;
  action_type: string | null;
  ancien_statut: string | null;
  nouveau_statut: string;
  commentaire: string | null;
  user: { full_name: string | null; email: string } | null;
}

const ACTION_LABEL: Record<string, string> = {
  creation_chef: "Créée par chef",
  creation_self: "Créée par employé",
  soumission: "Soumise",
  validation: "Validée",
  rejet: "Rejetée",
  acquittement: "Acquittement rejet",
  retour_brouillon: "Retour brouillon",
  edition: "Édition",
  changement_statut: "Changement statut",
};

interface Props {
  saisieId: string;
  className?: string;
}

export function SaisieChefBadge({ saisieId, className }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<HistoryRow[]>([]);

  const handleOpen = async (next: boolean) => {
    setOpen(next);
    if (next && rows.length === 0) {
      setLoading(true);
      const { data, error } = await supabase
        .from("heures_saisies_historique")
        .select(
          "id, created_at, action_type, ancien_statut, nouveau_statut, commentaire, user:profiles!heures_saisies_historique_user_id_fkey(full_name, email)",
        )
        .eq("heure_saisie_id", saisieId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (!error) setRows((data ?? []) as unknown as HistoryRow[]);
      setLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Saisie effectuée par un chef — voir historique"
          className={cn(
            "inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/20 transition-colors",
            className,
          )}
        >
          <UserCog className="h-3 w-3" />
          Chef
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96" align="start">
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Historique de la saisie</h4>
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">Aucun historique disponible.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto space-y-2">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="rounded-md border border-border bg-muted/30 p-2 text-xs space-y-0.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {ACTION_LABEL[r.action_type ?? ""] ?? r.action_type ?? "Action"}
                    </Badge>
                    <span className="text-muted-foreground">
                      {format(new Date(r.created_at), "dd/MM/yy HH:mm", { locale: fr })}
                    </span>
                  </div>
                  <p className="text-foreground">
                    Par <strong>{r.user?.full_name ?? r.user?.email ?? "Système"}</strong>
                  </p>
                  {r.ancien_statut && r.ancien_statut !== r.nouveau_statut && (
                    <p className="text-muted-foreground">
                      {r.ancien_statut} → {r.nouveau_statut}
                    </p>
                  )}
                  {r.commentaire && (
                    <p className="text-muted-foreground italic">« {r.commentaire} »</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
