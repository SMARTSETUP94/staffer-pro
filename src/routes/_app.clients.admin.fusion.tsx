import { createFileRoute, Link } from "@tanstack/react-router";
import { requireCapability } from "@/lib/capability-guard";
import { useEffect, useState } from "react";
import { Loader2, ArrowRight, GitMerge, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_app/clients/admin/fusion")({
  beforeLoad: () => requireCapability("clients.merge"),
  head: () => ({ meta: [{ title: "Fusion clients — Setup Paris" }] }),
  component: ClientsFusionPage,
});

interface DuplicateRow {
  client_a_id: string;
  client_a_nom: string;
  client_a_domaines: string[];
  client_a_nb_affaires: number;
  client_a_nb_contacts: number;
  client_b_id: string;
  client_b_nom: string;
  client_b_domaines: string[];
  client_b_nb_affaires: number;
  client_b_nb_contacts: number;
  similarity: number;
}

function ClientsFusionPage() {
  const [rows, setRows] = useState<DuplicateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [threshold, setThreshold] = useState(0.5);
  const [pending, setPending] = useState<{
    source: { id: string; nom: string };
    target: { id: string; nom: string };
  } | null>(null);
  const [merging, setMerging] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.rpc("detect_client_duplicates", {
      min_similarity: threshold,
    });
    if (error) {
      toast.error(`Erreur détection doublons : ${error.message}`);
      setRows([]);
    } else {
      setRows((data ?? []) as DuplicateRow[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleMerge() {
    if (!pending) return;
    setMerging(true);
    const { data, error } = await supabase.rpc("merge_clients", {
      source_id: pending.source.id,
      target_id: pending.target.id,
    });
    setMerging(false);
    if (error) {
      toast.error(`Fusion échouée : ${error.message}`);
      return;
    }
    const res = (data ?? {}) as {
      affaires_transferees?: number;
      emails_transferes?: number;
      contacts_transferes?: number;
    };
    toast.success(
      `Fusion réussie : ${res.affaires_transferees ?? 0} affaire(s), ${
        res.emails_transferes ?? 0
      } email(s), ${res.contacts_transferes ?? 0} contact(s) transférés.`,
    );
    setPending(null);
    load();
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Fusion clients"
        description="Détecte les fiches clients aux noms similaires et fusionne les doublons. La fiche cible récupère toutes les affaires, emails, contacts et domaines de la fiche source ; la source est ensuite supprimée."
      />

      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex-1 space-y-2">
            <Label>
              Seuil de similarité :{" "}
              <span className="font-mono">{threshold.toFixed(2)}</span>
            </Label>
            <Slider
              value={[threshold]}
              onValueChange={(v) => setThreshold(v[0])}
              min={0.2}
              max={0.95}
              step={0.05}
            />
            <p className="text-xs text-muted-foreground">
              0.2 = très permissif (beaucoup de faux positifs) · 0.95 = quasi-identique.
            </p>
          </div>
          <Button onClick={load} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Rechercher"
            )}
          </Button>
        </div>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          Aucun doublon probable détecté avec ce seuil.
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <Card key={`${row.client_a_id}-${row.client_b_id}`} className="p-4">
              <div className="flex items-center justify-between mb-3">
                <Badge variant="outline" className="font-mono">
                  Similarité {(row.similarity * 100).toFixed(0)}%
                </Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ClientCard
                  id={row.client_a_id}
                  nom={row.client_a_nom}
                  domaines={row.client_a_domaines}
                  nbAffaires={row.client_a_nb_affaires}
                  nbContacts={row.client_a_nb_contacts}
                />
                <ClientCard
                  id={row.client_b_id}
                  nom={row.client_b_nom}
                  domaines={row.client_b_domaines}
                  nbAffaires={row.client_b_nb_affaires}
                  nbContacts={row.client_b_nb_contacts}
                />
              </div>
              <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setPending({
                      source: { id: row.client_b_id, nom: row.client_b_nom },
                      target: { id: row.client_a_id, nom: row.client_a_nom },
                    })
                  }
                >
                  <GitMerge className="h-4 w-4 mr-1" />
                  Garder « {row.client_a_nom} »
                  <ArrowRight className="h-4 w-4 mx-1" />
                  fusionner B dedans
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setPending({
                      source: { id: row.client_a_id, nom: row.client_a_nom },
                      target: { id: row.client_b_id, nom: row.client_b_nom },
                    })
                  }
                >
                  <GitMerge className="h-4 w-4 mr-1" />
                  Garder « {row.client_b_nom} »
                  <ArrowRight className="h-4 w-4 mx-1" />
                  fusionner A dedans
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirmer la fusion
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  La fiche{" "}
                  <strong className="text-foreground">« {pending?.source.nom} »</strong>{" "}
                  va être <strong>supprimée</strong>.
                </p>
                <p>
                  Toutes ses affaires, emails entrants, contacts et domaines email
                  seront transférés vers{" "}
                  <strong className="text-foreground">« {pending?.target.nom} »</strong>.
                </p>
                <p className="text-destructive font-medium">
                  Cette action est irréversible.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={merging}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleMerge();
              }}
              disabled={merging}
            >
              {merging ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <GitMerge className="h-4 w-4 mr-2" />
              )}
              Fusionner
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ClientCard({
  id,
  nom,
  domaines,
  nbAffaires,
  nbContacts,
}: {
  id: string;
  nom: string;
  domaines: string[];
  nbAffaires: number;
  nbContacts: number;
}) {
  return (
    <div className="border rounded-lg p-3 bg-muted/30">
      <Link
        to="/clients/$clientId"
        params={{ clientId: id }}
        className="font-semibold hover:underline"
      >
        {nom}
      </Link>
      <div className="flex flex-wrap gap-1 mt-2">
        {domaines.length === 0 ? (
          <span className="text-xs text-muted-foreground italic">
            Aucun domaine
          </span>
        ) : (
          domaines.map((d) => (
            <Badge key={d} variant="secondary" className="text-xs">
              @{d}
            </Badge>
          ))
        )}
      </div>
      <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
        <span>{nbAffaires} affaire(s)</span>
        <span>{nbContacts} contact(s)</span>
      </div>
    </div>
  );
}
