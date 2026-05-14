import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chantierId: string;
  chantierLabel: string;
  metierId: number;
  metierLabel: string;
  weekStart: Date;
  weekEnd: Date;
}

interface Row {
  employe_id: string;
  prenom: string | null;
  nom: string | null;
  type_contrat: string | null;
  nb_demi_jours: number;
  total_heures: number;
}

export function PoleDrilldownDialog({
  open,
  onOpenChange,
  chantierId,
  chantierLabel,
  metierId,
  metierLabel,
  weekStart,
  weekEnd,
}: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("assignations")
        .select("employe_id, metier_id, employes!inner(id, prenom, nom, type_contrat, metier_principal_id)")
        .eq("affaire_id", chantierId)
        .gte("date", format(weekStart, "yyyy-MM-dd"))
        .lte("date", format(weekEnd, "yyyy-MM-dd"));
      if (cancelled) return;
      if (error || !data) {
        setRows([]);
        setLoading(false);
        return;
      }
      const map = new Map<string, Row>();
      for (const r of data as Array<{
        employe_id: string;
        metier_id: number | null;
        employes: { id: string; prenom: string | null; nom: string | null; type_contrat: string | null; metier_principal_id: number | null };
      }>) {
        const effectiveMetier = r.metier_id ?? r.employes?.metier_principal_id;
        if (effectiveMetier !== metierId) continue;
        const cur = map.get(r.employe_id) ?? {
          employe_id: r.employe_id,
          prenom: r.employes.prenom,
          nom: r.employes.nom,
          type_contrat: r.employes.type_contrat,
          nb_demi_jours: 0,
          total_heures: 0,
        };
        cur.nb_demi_jours += 1;
        cur.total_heures += 4;
        map.set(r.employe_id, cur);
      }
      setRows(Array.from(map.values()).sort((a, b) => (a.nom ?? "").localeCompare(b.nom ?? "")));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, chantierId, metierId, weekStart, weekEnd]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{metierLabel}</DialogTitle>
          <DialogDescription>{chantierLabel}</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Aucun staffing trouvé.</div>
        ) : (
          <div className="max-h-[50vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 text-left font-medium">Personne</th>
                  <th className="py-2 text-left font-medium">Contrat</th>
                  <th className="py-2 text-right font-medium">½j</th>
                  <th className="py-2 text-right font-medium">Heures</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.employe_id} className="border-b last:border-0">
                    <td className="py-2">{r.prenom} {r.nom}</td>
                    <td className="py-2 text-muted-foreground">{r.type_contrat ?? "—"}</td>
                    <td className="py-2 text-right tabular-nums">{r.nb_demi_jours}</td>
                    <td className="py-2 text-right tabular-nums">{r.total_heures}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
