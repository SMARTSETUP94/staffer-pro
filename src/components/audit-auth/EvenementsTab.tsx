import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Download } from "lucide-react";
import { useAuthEvents } from "@/hooks/use-audit-auth";
import { AuthEventBadge } from "./AuthEventBadge";
import {
  AUTH_EVENT_TYPES,
  authEventLabel,
  eventsToCsv,
  type DatePreset,
} from "@/lib/audit-auth-helpers";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium" });
}

export function EvenementsTab() {
  const [preset, setPreset] = useState<DatePreset>("7d");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const types = typeFilter === "all" ? undefined : [typeFilter];
  const { data, isLoading, error } = useAuthEvents({ types, preset, limit: 500 });

  const rows = useMemo(() => data ?? [], [data]);

  const handleExport = () => {
    const csv = eventsToCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `auth-events-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (error) {
    return <div className="text-destructive text-sm">Erreur : {(error as Error).message}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={preset} onValueChange={(v) => setPreset(v as DatePreset)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Aujourd'hui</SelectItem>
            <SelectItem value="7d">7 derniers jours</SelectItem>
            <SelectItem value="30d">30 derniers jours</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            {AUTH_EVENT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{authEventLabel(t)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{rows.length} événement(s)</span>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={rows.length === 0} className="ml-auto">
          <Download className="h-3.5 w-3.5 mr-1" /> Exporter CSV
        </Button>
      </div>

      {rows.length >= 500 && (
        <div className="text-xs text-muted-foreground rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
          Affichage limité aux 500 derniers événements. Affinez les filtres ou exportez en CSV pour archivage.
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="p-3 font-medium">Horodatage</th>
                <th className="p-3 font-medium">Type</th>
                <th className="p-3 font-medium">Utilisateur</th>
                <th className="p-3 font-medium">IP</th>
                <th className="p-3 font-medium">Catégorie</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={5} className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></td></tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Aucun événement</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="p-3 tabular-nums whitespace-nowrap">{fmtDate(r.created_at)}</td>
                  <td className="p-3"><AuthEventBadge action={r.action} /></td>
                  <td className="p-3">
                    <div className="font-medium">{r.actor_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.actor_email ?? "—"}</div>
                  </td>
                  <td className="p-3 tabular-nums text-xs">{r.ip_address ?? "—"}</td>
                  <td className="p-3 text-xs text-muted-foreground">{r.log_type ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
