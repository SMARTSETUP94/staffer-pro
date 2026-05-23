import { useEffect, useState, useCallback } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Loader2, AlertTriangle, PlayCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface DivergenceRow {
  id: string;
  run_id: string;
  detected_at: string;
  code: string;
  severity: "info" | "warning" | "error";
  affaire_id: string | null;
  plan_id: string | null;
  employe_id: string | null;
  date: string | null;
  metier_id: number | null;
  details: Record<string, unknown>;
  resolved_at: string | null;
}

const CODE_LABEL: Record<string, string> = {
  MISSING_ASSIGNATION: "Assignation manquante",
  ORPHAN_ASSIGNATION: "Assignation orpheline",
  PRESENCE_MISMATCH: "Écart de présence",
  OBJET_LINK_MISSING: "Lien objet manquant",
};

const SEV_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  info: "secondary",
  warning: "default",
  error: "destructive",
};

export function StaffingDivergenceTab({ enabled }: { enabled: boolean }) {
  const [rows, setRows] = useState<DivergenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [showResolved, setShowResolved] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("staffing_divergence_log")
      .select("*")
      .order("detected_at", { ascending: false })
      .limit(200);
    if (!showResolved) q = q.is("resolved_at", null);
    const { data, error } = await q;
    if (error) toast.error("Erreur chargement", { description: error.message });
    setRows((data as DivergenceRow[] | null) ?? []);
    setLoading(false);
  }, [showResolved]);

  useEffect(() => {
    if (enabled) void fetchRows();
  }, [enabled, fetchRows]);

  const runAudit = async () => {
    setRunning(true);
    const { data, error } = await supabase.rpc("run_staffing_divergence_audit");
    setRunning(false);
    if (error) {
      toast.error("Audit échoué", { description: error.message });
      return;
    }
    const total = (data as { total_findings?: number }[] | null)?.[0]?.total_findings ?? 0;
    toast.success(`Audit terminé — ${total} écart(s) détecté(s)`);
    await fetchRows();
  };

  const markResolved = async (id: string) => {
    const { error } = await supabase
      .from("staffing_divergence_log")
      .update({ resolved_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast.error("Erreur", { description: error.message });
      return;
    }
    await fetchRows();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4" />
          Divergence Plan ↔ Planning
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowResolved((v) => !v)}
          >
            {showResolved ? "Masquer résolus" : "Afficher résolus"}
          </Button>
          <Button size="sm" onClick={runAudit} disabled={running}>
            {running ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <PlayCircle className="mr-1.5 h-4 w-4" />
            )}
            Lancer un audit
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground">
          Audit automatique chaque nuit (3h UTC). Compare les plans de
          staffing publiés au planning opérationnel pour détecter les
          assignations manquantes, orphelines ou divergentes.
        </p>
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            Aucun écart détecté.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Détecté</TableHead>
                <TableHead>Sévérité</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Détails</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className={r.resolved_at ? "opacity-50" : ""}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {format(parseISO(r.detected_at), "dd/MM HH:mm", { locale: fr })}
                  </TableCell>
                  <TableCell>
                    <Badge variant={SEV_VARIANT[r.severity] ?? "default"}>
                      {r.severity}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {CODE_LABEL[r.code] ?? r.code}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.date ? format(parseISO(r.date), "dd/MM/yyyy") : "—"}
                  </TableCell>
                  <TableCell className="max-w-md truncate text-xs text-muted-foreground">
                    {JSON.stringify(r.details)}
                  </TableCell>
                  <TableCell>
                    {!r.resolved_at && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => markResolved(r.id)}
                      >
                        Résolu
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
