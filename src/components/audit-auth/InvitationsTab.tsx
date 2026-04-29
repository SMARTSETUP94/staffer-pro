import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { useInvitationsList, type InvitationRow } from "@/hooks/use-audit-auth";
import { resendInvitation } from "@/lib/admin-actions";
import { invitationStatutLabel } from "@/lib/audit-auth-helpers";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

const STATUT_CLASS: Record<string, string> = {
  envoye: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  accepte: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  expire: "bg-rose-500/15 text-rose-700 border-rose-500/30",
};

export function InvitationsTab() {
  const { data, isLoading, error } = useInvitationsList();
  const [statutFilter, setStatutFilter] = useState<string>("all");
  const qc = useQueryClient();

  const resendMut = useMutation({
    mutationFn: async (userId: string) => {
      const siteUrl = typeof window !== "undefined" ? window.location.origin : undefined;
      return resendInvitation({ data: { targetUserId: userId, siteUrl } });
    },
    onSuccess: (res) => {
      toast.success(`Invitation renvoyée à ${res.email}`);
      qc.invalidateQueries({ queryKey: ["admin", "auth-invitations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const all = data ?? [];
    if (statutFilter === "all") return all;
    return all.filter((r) => r.statut === statutFilter);
  }, [data, statutFilter]);

  if (error) {
    return <div className="text-destructive text-sm">Erreur : {(error as Error).message}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={statutFilter} onValueChange={setStatutFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            <SelectItem value="envoye">Envoyé</SelectItem>
            <SelectItem value="accepte">Accepté</SelectItem>
            <SelectItem value="expire">Expiré</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{rows.length} invitation(s)</span>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="p-3 font-medium">Email</th>
                <th className="p-3 font-medium">Nom</th>
                <th className="p-3 font-medium">Rôle</th>
                <th className="p-3 font-medium">Invité le</th>
                <th className="p-3 font-medium">Invité par</th>
                <th className="p-3 font-medium">Statut</th>
                <th className="p-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={7} className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></td></tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Aucune invitation</td></tr>
              )}
              {rows.map((r: InvitationRow) => (
                <tr key={r.user_id} className="border-t hover:bg-muted/30">
                  <td className="p-3">{r.email ?? "—"}</td>
                  <td className="p-3">{r.full_name ?? "—"}</td>
                  <td className="p-3">{r.role ?? "—"}</td>
                  <td className="p-3">{fmtDate(r.invited_at)}</td>
                  <td className="p-3">{r.invited_by_name ?? "—"}</td>
                  <td className="p-3">
                    <Badge variant="outline" className={STATUT_CLASS[r.statut]}>
                      {invitationStatutLabel(r.statut)}
                    </Badge>
                  </td>
                  <td className="p-3 text-right">
                    {(r.statut === "envoye" || r.statut === "expire") && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resendMut.mutate(r.user_id)}
                        disabled={resendMut.isPending}
                      >
                        <Send className="h-3.5 w-3.5 mr-1" /> Renvoyer
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
