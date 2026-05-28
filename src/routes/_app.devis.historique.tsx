import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { History, FileText, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCapability } from "@/hooks/use-capability";
import { PageHeader } from "@/components/PageHeader";
import { PageBreadcrumbs } from "@/components/PageBreadcrumbs";
import { ImportsTabsNav } from "@/components/ImportsTabsNav";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { DevisDeleteCascadeDialog } from "@/components/devis-import/DevisDeleteCascadeDialog";

export const Route = createFileRoute("/_app/devis/historique")({
  head: () => ({ meta: [{ title: "Historique des imports devis — Setup Paris" }] }),
  component: DevisHistoriquePage,
});

interface ImportRow {
  id: string;
  user_id: string;
  affaire_id: string | null;
  devis_id: string | null;
  fichier_nom: string;
  fichier_hash: string;
  postes_count: number;
  total_heures: number;
  total_montant_ht: number | null;
  affaire_numero: string | null;
  affaire_nom: string | null;
  devis_numero: string | null;
  created_at: string;
  profiles?: { full_name: string | null; email: string } | null;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("fr-FR");
}

function DevisHistoriquePage() {
  const canViewDevis = useCapability("section.devis");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const fetchRows = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("devis_imports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error || !data) {
      setLoading(false);
      return;
    }
    const userIds = Array.from(new Set(data.map((r) => r.user_id).filter(Boolean)));
    const profilesMap = new Map<string, { full_name: string | null; email: string }>();
    if (userIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      profs?.forEach((p) => profilesMap.set(p.id, { full_name: p.full_name, email: p.email }));
    }
    const enriched: ImportRow[] = data.map((r) => ({
      ...(r as unknown as ImportRow),
      profiles: profilesMap.get(r.user_id) ?? null,
    }));
    setRows(enriched);
    setLoading(false);
  };

  useEffect(() => {
    if (!canViewDevis) {
      setLoading(false);
      return;
    }
    fetchRows();
  }, [canViewDevis]);

  if (!canViewDevis) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Accès réservé aux utilisateurs habilités à consulter les devis.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <PageBreadcrumbs steps={[{ label: "Imports", to: "/employes/import" }, { label: "Historique" }]} />
      <PageHeader
        eyebrow="Administration / Imports"
        title="Historique des imports devis"
        description="Trace de tous les fichiers devis importés. Empêche les doublons par empreinte de fichier."
      />
      <ImportsTabsNav />

      <div className="flex items-center justify-end">
        <Button asChild variant="outline" size="sm">
          <Link to="/devis/import">
            <FileText className="mr-2 h-4 w-4" />
            Nouvel import
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <History className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Aucun import enregistré pour le moment.
            </p>
            <Button asChild size="sm">
              <Link to="/devis/import">Importer un premier devis</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <Card key={row.id} className="transition-colors hover:bg-accent/30">
              <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="font-mono text-xs">
                      {row.affaire_numero ?? "—"}
                    </Badge>
                    <span className="truncate text-sm font-semibold">
                      {row.affaire_nom ?? "Affaire inconnue"}
                    </span>
                    {row.devis_numero && (
                      <Badge variant="outline" className="text-xs">
                        Devis {row.devis_numero}
                      </Badge>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    📄 {row.fichier_nom}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Par{" "}
                    <span className="font-medium text-foreground">
                      {row.profiles?.full_name ?? row.profiles?.email ?? "Inconnu"}
                    </span>{" "}
                    • {fmtDate(row.created_at)}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-4 text-right text-xs">
                  <div>
                    <p className="text-muted-foreground">Postes</p>
                    <p className="text-base font-bold">{row.postes_count}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Heures</p>
                    <p className="text-base font-bold">{fmtNumber(row.total_heures)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Montant HT</p>
                    <p className="text-base font-bold">
                      {row.total_montant_ht !== null
                        ? `${fmtNumber(row.total_montant_ht)} €`
                        : "—"}
                    </p>
                  </div>
                  {row.affaire_id && (
                    <Button asChild variant="ghost" size="icon" className="shrink-0">
                      <Link
                        to="/affaires/$affaireId"
                        params={{ affaireId: row.affaire_id }}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </Button>
                  )}
                  {row.devis_id && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setDeleteTarget(row.devis_id)}
                      title="Supprimer ce devis (cascade)"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <DevisDeleteCascadeDialog
        devisId={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirmed={() => {
          toast.success("Devis supprimé");
          setDeleteTarget(null);
          fetchRows();
        }}
      />
    </div>
  );
}
