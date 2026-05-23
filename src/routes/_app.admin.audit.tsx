import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { format, parseISO, subDays } from "date-fns";
import { fr } from "date-fns/locale";
import { Loader2, FileText, Image as ImageIcon, ShieldCheck, Download, AlertTriangle } from "lucide-react";
import { StaffingDivergenceTab } from "@/components/admin/StaffingDivergenceTab";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_app/admin/audit")({
  component: AdminAuditPage,
});

interface ValidationRow {
  id: string;
  valide_at: string;
  action: string;
  valeur_avant: number | null;
  valeur_apres: number;
  commentaire: string | null;
  role_au_moment: string;
  heure_saisie_id: string;
  valide_par_chef_id: string;
  chef?: { prenom: string; nom: string } | null;
  saisie?: {
    date: string;
    employe_id: string;
    affaire_id: string;
  } | null;
  employe?: { prenom: string; nom: string } | null;
  affaire?: { numero: string; nom: string } | null;
}

interface DocDeletedRow {
  source: string;
  id: string;
  affaire_id: string | null;
  filename: string | null;
  deleted_at: string;
  deleted_by: string | null;
  deleted_by_email: string | null;
  uploaded_by: string | null;
  uploaded_at: string | null;
  uploader?: { full_name: string | null; email: string } | null;
  affaire?: { numero: string; nom: string } | null;
}

interface DocUploadedRow {
  id: string;
  affaire_id: string;
  filename: string;
  mime_type: string;
  taille_bytes: number;
  uploaded_at: string;
  uploaded_by: string;
  uploader?: { full_name: string | null; email: string } | null;
  affaire?: { numero: string; nom: string } | null;
}

const ACTION_LABEL: Record<string, { label: string; tone: string }> = {
  validate: {
    label: "Validation",
    tone: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  },
  correct: {
    label: "Correction",
    tone: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  },
  reject: {
    label: "Rejet",
    tone: "bg-destructive/15 text-destructive border-destructive/30",
  },
};

function AdminAuditPage() {
  const { isAdmin, loading: authLoading } = useAuth();

  if (authLoading) return null;

  return (
    <RoleGuard required="admin">
      <div className="space-y-4">
        <PageHeader
          title="Audit Admin"
          description="Validations d'heures et historique des documents (upload + soft-delete 30j)."
        />
        <Tabs defaultValue="validations">
          <TabsList>
            <TabsTrigger value="validations">
              <ShieldCheck className="mr-1.5 h-4 w-4" /> Validations heures
            </TabsTrigger>
            <TabsTrigger value="documents-supprimes">
              <FileText className="mr-1.5 h-4 w-4" /> Documents supprimés (30j)
            </TabsTrigger>
            <TabsTrigger value="documents-uploads">
              <ImageIcon className="mr-1.5 h-4 w-4" /> Uploads récents
            </TabsTrigger>
          </TabsList>
          <TabsContent value="validations" className="mt-4">
            <ValidationsTab enabled={isAdmin} />
          </TabsContent>
          <TabsContent value="documents-supprimes" className="mt-4">
            <DocumentsSupprimesTab enabled={isAdmin} />
          </TabsContent>
          <TabsContent value="documents-uploads" className="mt-4">
            <DocumentsUploadsTab enabled={isAdmin} />
          </TabsContent>
        </Tabs>
      </div>
    </RoleGuard>
  );
}

/* ─── Validations heures ─────────────────────────────────────────────── */

function ValidationsTab({ enabled }: { enabled: boolean }) {
  const [rows, setRows] = useState<ValidationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const { data, error } = await supabase
        .from("heures_validations")
        .select(
          "id, valide_at, action, valeur_avant, valeur_apres, commentaire, role_au_moment, heure_saisie_id, valide_par_chef_id",
        )
        .gte("valide_at", `${from}T00:00:00`)
        .lte("valide_at", `${to}T23:59:59`)
        .order("valide_at", { ascending: false })
        .limit(500);
      if (cancelled) return;
      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }
      const list = (data ?? []) as ValidationRow[];
      const chefIds = Array.from(new Set(list.map((r) => r.valide_par_chef_id)));
      const saisieIds = Array.from(new Set(list.map((r) => r.heure_saisie_id)));

      const [chefsRes, saisiesRes] = await Promise.all([
        chefIds.length
          ? supabase.from("employes").select("id, prenom, nom").in("id", chefIds)
          : Promise.resolve({ data: [] as any[] }),
        saisieIds.length
          ? supabase
              .from("heures_saisies")
              .select("id, date, employe_id, affaire_id")
              .in("id", saisieIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const chefMap = new Map<string, ValidationRow["chef"]>();
      (chefsRes.data ?? []).forEach((e: any) =>
        chefMap.set(e.id, { prenom: e.prenom, nom: e.nom }),
      );
      const saisieMap = new Map<string, ValidationRow["saisie"]>();
      (saisiesRes.data ?? []).forEach((s: any) =>
        saisieMap.set(s.id, {
          date: s.date,
          employe_id: s.employe_id,
          affaire_id: s.affaire_id,
        }),
      );
      const employeIds = Array.from(
        new Set(
          Array.from(saisieMap.values())
            .map((s) => s?.employe_id)
            .filter((v): v is string => !!v),
        ),
      );
      const affaireIds = Array.from(
        new Set(
          Array.from(saisieMap.values())
            .map((s) => s?.affaire_id)
            .filter((v): v is string => !!v),
        ),
      );
      const [empRes, affRes] = await Promise.all([
        employeIds.length
          ? supabase.from("employes").select("id, prenom, nom").in("id", employeIds)
          : Promise.resolve({ data: [] as any[] }),
        affaireIds.length
          ? supabase.from("affaires").select("id, numero, nom").in("id", affaireIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const empMap = new Map<string, ValidationRow["employe"]>();
      (empRes.data ?? []).forEach((e: any) =>
        empMap.set(e.id, { prenom: e.prenom, nom: e.nom }),
      );
      const affMap = new Map<string, ValidationRow["affaire"]>();
      (affRes.data ?? []).forEach((a: any) =>
        affMap.set(a.id, { numero: a.numero, nom: a.nom }),
      );

      const enriched: ValidationRow[] = list.map((r) => {
        const s = saisieMap.get(r.heure_saisie_id) ?? null;
        return {
          ...r,
          chef: chefMap.get(r.valide_par_chef_id) ?? null,
          saisie: s,
          employe: s?.employe_id ? empMap.get(s.employe_id) ?? null : null,
          affaire: s?.affaire_id ? affMap.get(s.affaire_id) ?? null : null,
        };
      });
      if (!cancelled) {
        setRows(enriched);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, from, to]);

  function exportCsv() {
    const header = [
      "Date validation",
      "Action",
      "Chef",
      "Rôle",
      "Employé",
      "Affaire",
      "Date saisie",
      "Avant (h)",
      "Après (h)",
      "Commentaire",
    ];
    const lines = rows.map((r) =>
      [
        format(parseISO(r.valide_at), "yyyy-MM-dd HH:mm:ss"),
        ACTION_LABEL[r.action]?.label ?? r.action,
        r.chef ? `${r.chef.prenom} ${r.chef.nom}` : "",
        r.role_au_moment,
        r.employe ? `${r.employe.prenom} ${r.employe.nom}` : "",
        r.affaire ? `${r.affaire.numero} - ${r.affaire.nom}` : "",
        r.saisie?.date ?? "",
        r.valeur_avant ?? "",
        r.valeur_apres,
        (r.commentaire ?? "").replace(/[\r\n]+/g, " "),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-validations-${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="pt-4">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <div className="grid gap-1">
              <Label className="text-xs">Du</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Au</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
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
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              Aucune validation sur cette période.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">Date</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Chef</TableHead>
                    <TableHead>Employé</TableHead>
                    <TableHead>Affaire</TableHead>
                    <TableHead>Saisie</TableHead>
                    <TableHead>Heures</TableHead>
                    <TableHead>Commentaire</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const meta = ACTION_LABEL[r.action] ?? {
                      label: r.action,
                      tone: "bg-muted text-muted-foreground",
                    };
                    const dt = parseISO(r.valide_at);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs">
                          <div>{format(dt, "dd/MM/yy", { locale: fr })}</div>
                          <div className="text-muted-foreground">
                            {format(dt, "HH:mm")}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={meta.tone}>
                            {meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div>
                            {r.chef ? `${r.chef.prenom} ${r.chef.nom}` : "—"}
                          </div>
                          <div className="text-muted-foreground">{r.role_au_moment}</div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.employe ? `${r.employe.prenom} ${r.employe.nom}` : "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.affaire ? (
                            <>
                              <span className="font-mono font-semibold">
                                {r.affaire.numero}
                              </span>{" "}
                              <span className="text-muted-foreground">
                                {r.affaire.nom}
                              </span>
                            </>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.saisie?.date
                            ? format(parseISO(r.saisie.date), "dd/MM/yy")
                            : "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.valeur_avant != null && (
                            <span className="text-muted-foreground">
                              {r.valeur_avant}h →{" "}
                            </span>
                          )}
                          <span className="font-semibold">{r.valeur_apres}h</span>
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

/* ─── Documents supprimés ────────────────────────────────────────────── */

function DocumentsSupprimesTab({ enabled }: { enabled: boolean }) {
  const [rows, setRows] = useState<DocDeletedRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const { data, error } = await supabase
        .from("v_documents_supprimes_30j" as any)
        .select("*")
        .order("deleted_at", { ascending: false })
        .limit(500);
      if (cancelled) return;
      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }
      const list = ((data ?? []) as unknown) as DocDeletedRow[];
      const affaireIds = Array.from(
        new Set(list.map((r) => r.affaire_id).filter((v): v is string => !!v)),
      );
      const affRes = affaireIds.length
        ? await supabase.from("affaires").select("id, numero, nom").in("id", affaireIds)
        : { data: [] as any[] };
      const affMap = new Map<string, DocDeletedRow["affaire"]>();
      (affRes.data ?? []).forEach((a: any) =>
        affMap.set(a.id, { numero: a.numero, nom: a.nom }),
      );
      const enriched = list.map((r) => ({
        ...r,
        affaire: r.affaire_id ? affMap.get(r.affaire_id) ?? null : null,
      }));
      if (!cancelled) {
        setRows(enriched);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return (
    <Card>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Aucune suppression sur les 30 derniers jours.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Supprimé le</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Fichier</TableHead>
                  <TableHead>Affaire</TableHead>
                  <TableHead>Supprimé par</TableHead>
                  <TableHead>Uploadé le</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const dt = parseISO(r.deleted_at);
                  return (
                    <TableRow key={`${r.source}-${r.id}`}>
                      <TableCell className="text-xs">
                        <div>{format(dt, "dd/MM/yy", { locale: fr })}</div>
                        <div className="text-muted-foreground">
                          {format(dt, "HH:mm")}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {r.source === "affaire_document" ? "Document" : "Photo objet"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-xs">
                        {r.filename ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.affaire ? (
                          <>
                            <span className="font-mono font-semibold">
                              {r.affaire.numero}
                            </span>{" "}
                            <span className="text-muted-foreground">
                              {r.affaire.nom}
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.deleted_by_email ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.uploaded_at
                          ? format(parseISO(r.uploaded_at), "dd/MM/yy")
                          : "—"}
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
  );
}

/* ─── Documents uploadés (90j) ───────────────────────────────────────── */

function DocumentsUploadsTab({ enabled }: { enabled: boolean }) {
  const [rows, setRows] = useState<DocUploadedRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    const since = format(subDays(new Date(), 90), "yyyy-MM-dd");
    void (async () => {
      const { data, error } = await supabase
        .from("affaire_documents")
        .select(
          "id, affaire_id, filename, mime_type, taille_bytes, uploaded_at, uploaded_by",
        )
        .is("deleted_at", null)
        .gte("uploaded_at", `${since}T00:00:00`)
        .order("uploaded_at", { ascending: false })
        .limit(500);
      if (cancelled) return;
      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }
      const list = (data ?? []) as DocUploadedRow[];
      const userIds = Array.from(
        new Set(list.map((r) => r.uploaded_by).filter((v): v is string => !!v)),
      );
      const affaireIds = Array.from(new Set(list.map((r) => r.affaire_id)));
      const [usersRes, affRes] = await Promise.all([
        userIds.length
          ? supabase.from("profiles").select("id, full_name, email").in("id", userIds)
          : Promise.resolve({ data: [] as any[] }),
        affaireIds.length
          ? supabase.from("affaires").select("id, numero, nom").in("id", affaireIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const uMap = new Map<string, DocUploadedRow["uploader"]>();
      (usersRes.data ?? []).forEach((p: any) =>
        uMap.set(p.id, { full_name: p.full_name, email: p.email }),
      );
      const affMap = new Map<string, DocUploadedRow["affaire"]>();
      (affRes.data ?? []).forEach((a: any) =>
        affMap.set(a.id, { numero: a.numero, nom: a.nom }),
      );
      const enriched = list.map((r) => ({
        ...r,
        uploader: r.uploaded_by ? uMap.get(r.uploaded_by) ?? null : null,
        affaire: affMap.get(r.affaire_id) ?? null,
      }));
      if (!cancelled) {
        setRows(enriched);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return (
    <Card>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Aucun upload sur les 90 derniers jours.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Uploadé le</TableHead>
                  <TableHead>Fichier</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Taille</TableHead>
                  <TableHead>Affaire</TableHead>
                  <TableHead>Auteur</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const dt = parseISO(r.uploaded_at);
                  const sizeKb = (r.taille_bytes / 1024).toFixed(0);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">
                        <div>{format(dt, "dd/MM/yy", { locale: fr })}</div>
                        <div className="text-muted-foreground">
                          {format(dt, "HH:mm")}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-xs">
                        {r.filename}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.mime_type}
                      </TableCell>
                      <TableCell className="text-xs">{sizeKb} Ko</TableCell>
                      <TableCell className="text-xs">
                        {r.affaire ? (
                          <>
                            <span className="font-mono font-semibold">
                              {r.affaire.numero}
                            </span>{" "}
                            <span className="text-muted-foreground">
                              {r.affaire.nom}
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.uploader?.full_name ?? r.uploader?.email ?? "—"}
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
  );
}
