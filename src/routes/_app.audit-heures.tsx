import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format, parseISO, subDays } from "date-fns";
import { fr } from "date-fns/locale";
import {
import { requireCapability } from "@/lib/capability-guard";
  Loader2,
  User as UserIcon,
  ShieldCheck,
  Filter,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCapability } from "@/hooks/use-capability";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * /audit-heures — Admin uniquement (RoleGuard required="admin").
 * Les chef_chantier sont redirigés vers /. (L5-A-bis : rôle chef_metier_scoped
 * supprimé du code applicatif, plus de cas particulier.)
 */
export const Route = createFileRoute("/_app/audit-heures")({
  beforeLoad: () => requireCapability("heures.audit"),
  component: AuditHeuresPage,
});

interface AuditRow {
  id: string;
  created_at: string;
  user_id: string | null;
  ancien_statut: string | null;
  nouveau_statut: string;
  commentaire: string | null;
  action_type: string | null;
  pour_compte_de: string | null;
  heure_saisie_id: string;
  // joined
  acteur?: { full_name: string | null; email: string } | null;
  employe?: { prenom: string; nom: string; profile_id: string | null } | null;
  saisie?: { date: string; heures_reelles: number | null; affaire_id: string } | null;
  affaire?: { numero: string; nom: string } | null;
}

const ACTION_META: Record<string, { label: string; tone: string }> = {
  creation_self: { label: "Création (employé)", tone: "bg-muted text-muted-foreground" },
  creation_chef: {
    label: "Création par chef",
    tone: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  },
  edition: { label: "Édition", tone: "bg-blue-500/15 text-blue-600 border-blue-500/30" },
  soumission: { label: "Soumission", tone: "bg-indigo-500/15 text-indigo-600 border-indigo-500/30" },
  validation: { label: "Validation", tone: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  rejet: { label: "Rejet", tone: "bg-destructive/15 text-destructive border-destructive/30" },
  acquittement: { label: "Acquittement rejet", tone: "bg-muted text-muted-foreground" },
  retour_brouillon: { label: "Retour brouillon", tone: "bg-muted text-muted-foreground" },
  changement_statut: { label: "Changement statut", tone: "bg-muted text-muted-foreground" },
};

function AuditHeuresPage() {
  const { loading: authLoading } = useAuth();
  const canAudit = useCapability("heures.audit");
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(format(subDays(new Date(), 14), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [employeQuery, setEmployeQuery] = useState("");

  useEffect(() => {
    if (!canAudit) return;
    let cancelled = false;
    setLoading(true);

    void (async () => {
      const fromIso = `${from}T00:00:00`;
      const toIso = `${to}T23:59:59`;

      const { data: hist, error } = await supabase
        .from("heures_saisies_historique")
        .select(
          "id, created_at, user_id, ancien_statut, nouveau_statut, commentaire, action_type, pour_compte_de, heure_saisie_id",
        )
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .order("created_at", { ascending: false })
        .limit(500);

      if (cancelled) return;
      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }

      const list = (hist ?? []) as AuditRow[];
      const acteurIds = Array.from(
        new Set(list.map((r) => r.user_id).filter((v): v is string => !!v)),
      );
      const employeIds = Array.from(
        new Set(list.map((r) => r.pour_compte_de).filter((v): v is string => !!v)),
      );
      const saisieIds = Array.from(new Set(list.map((r) => r.heure_saisie_id)));

      const [profilesRes, employesRes, saisiesRes] = await Promise.all([
        acteurIds.length
          ? supabase.from("profiles").select("id, full_name, email").in("id", acteurIds)
          : Promise.resolve({ data: [], error: null }),
        employeIds.length
          ? supabase
              .from("employes")
              .select("id, prenom, nom, profile_id")
              .in("id", employeIds)
          : Promise.resolve({ data: [], error: null }),
        saisieIds.length
          ? supabase
              .from("heures_saisies")
              .select("id, date, heures_reelles, affaire_id")
              .in("id", saisieIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const profMap = new Map<string, AuditRow["acteur"]>();
      (profilesRes.data ?? []).forEach((p) =>
        profMap.set(p.id, { full_name: p.full_name, email: p.email }),
      );
      const empMap = new Map<string, AuditRow["employe"]>();
      (employesRes.data ?? []).forEach((e) =>
        empMap.set(e.id, { prenom: e.prenom, nom: e.nom, profile_id: e.profile_id }),
      );
      const saisieMap = new Map<string, AuditRow["saisie"]>();
      (saisiesRes.data ?? []).forEach((s) =>
        saisieMap.set(s.id, {
          date: s.date,
          heures_reelles: s.heures_reelles,
          affaire_id: s.affaire_id,
        }),
      );

      const affaireIds = Array.from(
        new Set(
          Array.from(saisieMap.values())
            .map((s) => s?.affaire_id)
            .filter((v): v is string => !!v),
        ),
      );
      const affRes = affaireIds.length
        ? await supabase.from("affaires").select("id, numero, nom").in("id", affaireIds)
        : { data: [] as { id: string; numero: string; nom: string }[] };
      const affMap = new Map<string, AuditRow["affaire"]>();
      (affRes.data ?? []).forEach((a) => affMap.set(a.id, { numero: a.numero, nom: a.nom }));

      const enriched: AuditRow[] = list.map((r) => ({
        ...r,
        acteur: r.user_id ? profMap.get(r.user_id) ?? null : null,
        employe: r.pour_compte_de ? empMap.get(r.pour_compte_de) ?? null : null,
        saisie: saisieMap.get(r.heure_saisie_id) ?? null,
        affaire: (() => {
          const s = saisieMap.get(r.heure_saisie_id);
          return s?.affaire_id ? affMap.get(s.affaire_id) ?? null : null;
        })(),
      }));

      if (!cancelled) {
        setRows(enriched);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canAudit, from, to]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (actionFilter !== "all" && r.action_type !== actionFilter) return false;
      if (employeQuery.trim()) {
        const q = employeQuery.toLowerCase();
        const empName = r.employe ? `${r.employe.prenom} ${r.employe.nom}`.toLowerCase() : "";
        const acteurName = (r.acteur?.full_name ?? r.acteur?.email ?? "").toLowerCase();
        if (!empName.includes(q) && !acteurName.includes(q)) return false;
      }
      return true;
    });
  }, [rows, actionFilter, employeQuery]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const byChef = filtered.filter((r) => r.action_type === "creation_chef").length;
    const validations = filtered.filter((r) => r.action_type === "validation").length;
    const rejets = filtered.filter((r) => r.action_type === "rejet").length;
    return { total, byChef, validations, rejets };
  }, [filtered]);

  function exportCsv() {
    const header = [
      "Date",
      "Heure",
      "Action",
      "Acteur",
      "Pour compte de",
      "Affaire",
      "Date saisie",
      "Heures",
      "Statut avant",
      "Statut après",
      "Commentaire",
    ];
    const lines = filtered.map((r) => {
      const dt = parseISO(r.created_at);
      return [
        format(dt, "yyyy-MM-dd"),
        format(dt, "HH:mm:ss"),
        ACTION_META[r.action_type ?? ""]?.label ?? r.action_type ?? "",
        r.acteur?.full_name ?? r.acteur?.email ?? "",
        r.employe ? `${r.employe.prenom} ${r.employe.nom}` : "",
        r.affaire ? `${r.affaire.numero} - ${r.affaire.nom}` : "",
        r.saisie?.date ?? "",
        r.saisie?.heures_reelles ?? "",
        r.ancien_statut ?? "",
        r.nouveau_statut,
        (r.commentaire ?? "").replace(/[\r\n]+/g, " "),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",");
    });
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-heures-${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (authLoading) return null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Audit des heures"
        description="Trace complète des saisies, modifications, validations et rejets sur les 500 dernières actions."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Actions totales" value={stats.total} />
        <StatCard label="Saisies par chef" value={stats.byChef} tone="warning" />
        <StatCard label="Validations" value={stats.validations} tone="success" />
        <StatCard label="Rejets" value={stats.rejets} tone="destructive" />
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_2fr_auto]">
            <div className="grid gap-1">
              <Label className="text-xs">Du</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Au</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Type d'action</Label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
                  {Object.entries(ACTION_META).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Recherche (employé ou acteur)</Label>
              <div className="relative">
                <Filter className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="pl-7"
                  placeholder="Nom…"
                  value={employeQuery}
                  onChange={(e) => setEmployeQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}>
                <Download className="mr-1.5 h-4 w-4" /> CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              Aucune action trouvée pour cette période.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">Date / Heure</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Acteur</TableHead>
                    <TableHead>Pour</TableHead>
                    <TableHead>Affaire</TableHead>
                    <TableHead>Saisie</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Commentaire</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const meta = ACTION_META[r.action_type ?? ""] ?? {
                      label: r.action_type ?? "—",
                      tone: "bg-muted text-muted-foreground",
                    };
                    const dt = parseISO(r.created_at);
                    const isChef = r.action_type === "creation_chef";
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs">
                          <div>{format(dt, "dd/MM/yy", { locale: fr })}</div>
                          <div className="text-muted-foreground">{format(dt, "HH:mm:ss")}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={meta.tone}>
                            {isChef && <UserIcon className="mr-1 h-3 w-3" />}
                            {meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="flex items-center gap-1">
                            {r.acteur?.full_name && (
                              <ShieldCheck className="h-3 w-3 text-muted-foreground" />
                            )}
                            <span>{r.acteur?.full_name ?? r.acteur?.email ?? "—"}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.employe ? `${r.employe.prenom} ${r.employe.nom}` : "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.affaire ? (
                            <span>
                              <span className="font-mono font-semibold">{r.affaire.numero}</span>{" "}
                              <span className="text-muted-foreground">{r.affaire.nom}</span>
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.saisie ? (
                            <>
                              <div>{format(parseISO(r.saisie.date), "dd/MM/yy")}</div>
                              <div className="text-muted-foreground">
                                {r.saisie.heures_reelles ?? 0}h
                              </div>
                            </>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.ancien_statut && (
                            <span className="text-muted-foreground">{r.ancien_statut} → </span>
                          )}
                          <span className="font-semibold">{r.nouveau_statut}</span>
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                          {r.commentaire ?? "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "warning" | "success" | "destructive";
}) {
  const toneCls = {
    default: "text-foreground",
    warning: "text-amber-600",
    success: "text-emerald-600",
    destructive: "text-destructive",
  }[tone];
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-bold ${toneCls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
