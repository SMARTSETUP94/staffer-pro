import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2 } from "lucide-react";
import { useUserConnectionStats, type ConnectionStatRow } from "@/hooks/use-audit-auth";
import { fuzzyMatch } from "@/lib/string-normalize";
import { roleLabel } from "@/lib/labels";

const ROLE_LABEL: Record<string, string> = {
  admin: roleLabel("admin"),
  chef_chantier: roleLabel("chef_chantier"),
  charge_affaires: "Chargé d'affaires",
  employe: roleLabel("employe"),
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

function isInactif(iso: string | null): boolean {
  if (!iso) return false;
  const days = (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
  return days > 30;
}

export function ConnexionsTab() {
  const { data, isLoading, error } = useUserConnectionStats();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const rows = useMemo(() => {
    const all = data ?? [];
    return all.filter((r) => {
      if (roleFilter !== "all" && r.role !== roleFilter) return false;
      if (search) {
        const haystack = `${r.full_name ?? ""} ${r.email ?? ""}`;
        if (!fuzzyMatch(haystack, search)) return false;
      }
      return true;
    });
  }, [data, roleFilter, search]);

  if (error) {
    return <div className="text-destructive text-sm">Erreur : {(error as Error).message}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Rechercher nom ou email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les rôles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="chef_chantier">{roleLabel("chef_chantier")}</SelectItem>
            <SelectItem value="charge_affaires">Chargé d'affaires</SelectItem>
            <SelectItem value="employe">Employé</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{rows.length} utilisateur(s)</span>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="p-3 font-medium">Utilisateur</th>
                <th className="p-3 font-medium">Rôle</th>
                <th className="p-3 font-medium">Dernière connexion</th>
                <th className="p-3 font-medium">Sessions 30j</th>
                <th className="p-3 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={5} className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></td></tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Aucun utilisateur</td></tr>
              )}
              {rows.map((r: ConnectionStatRow) => (
                <tr key={r.user_id} className="border-t hover:bg-muted/30">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={r.avatar_url ?? undefined} />
                        <AvatarFallback className="text-xs">
                          {(r.full_name ?? r.email ?? "?").slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">{r.full_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{r.email ?? "—"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-3">{ROLE_LABEL[r.role ?? ""] ?? r.role ?? "—"}</td>
                  <td className="p-3">{fmtDate(r.last_sign_in_at)}</td>
                  <td className="p-3 tabular-nums">{r.sessions_30d}</td>
                  <td className="p-3">
                    {!r.last_sign_in_at && <Badge variant="secondary">Jamais connecté</Badge>}
                    {r.last_sign_in_at && isInactif(r.last_sign_in_at) && (
                      <Badge variant="outline" className="bg-amber-500/15 text-amber-700 border-amber-500/30">
                        Inactif &gt;30j
                      </Badge>
                    )}
                    {r.status === "desactive" && <Badge variant="destructive">Désactivé</Badge>}
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
