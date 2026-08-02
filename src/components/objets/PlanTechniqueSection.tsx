/**
 * LOT A2 — Section « Plan technique » de la fiche objet.
 *
 * Deux branches exclusives de publication :
 *   1. Dépôt d'un PDF → réutilise `affaire_documents` (bucket privé existant)
 *      avec `objet_id` renseigné.
 *   2. Lien externe (Teams) → renseigne `fabrication_objets.plan_url`.
 *
 * L'absence de plan est une simple mention : rien n'est jamais bloqué.
 */
import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, FileText, Link2, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAffaireDocuments } from "@/hooks/use-affaire-documents";
import { useCapability } from "@/hooks/use-capability";
import {
  normalizePlanUrl,
  planTechniqueStatut,
  type PlanTechniqueState,
} from "@/lib/objet-feed";
import {
  publishObjetPlan,
  unpublishObjetPlan,
} from "@/lib/server-fns/objet-feed.functions";

interface Props {
  objetId: string;
  affaireId: string;
  plan: PlanTechniqueState;
}

function fmt(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PlanTechniqueSection({ objetId, affaireId, plan }: Props) {
  const qc = useQueryClient();
  const canPublish = useCapability("action.publish_plan_fab");
  const [urlInput, setUrlInput] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const docs = useAffaireDocuments(affaireId, { objetId });
  const planDocs = useMemo(
    () => docs.documents.filter((d) => d.mime_type === "application/pdf"),
    [docs.documents],
  );
  const statut = planTechniqueStatut(plan, planDocs.length > 0);

  const publish = useServerFn(publishObjetPlan);
  const unpublish = useServerFn(unpublishObjetPlan);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["fiche-objet", objetId] });
    void qc.invalidateQueries({ queryKey: ["objet-feed", objetId] });
  };

  const publishLink = useMutation({
    mutationFn: async () => {
      const url = normalizePlanUrl(urlInput);
      if (!url) throw new Error("Lien invalide — vérifiez l'adresse saisie.");
      return publish({ data: { objetId, affaireId, mode: "lien" as const, url } });
    },
    onSuccess: () => {
      setUrlInput("");
      toast.success("Plan technique publié.");
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const retirer = useMutation({
    mutationFn: () => unpublish({ data: { objetId } }),
    onSuccess: () => {
      toast.success("Lien du plan retiré.");
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  async function handlePdf(file: File | undefined) {
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error("Seuls les fichiers PDF sont acceptés pour le plan technique.");
      return;
    }
    setBusy(true);
    const res = await docs.upload(file, undefined, objetId);
    if (!res.ok) {
      setBusy(false);
      toast.error(res.error ?? "Échec du dépôt");
      return;
    }
    try {
      await publish({
        data: {
          objetId,
          affaireId,
          mode: "document" as const,
          filename: file.name,
        },
      });
      toast.success("Plan technique publié.");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-testid="plan-technique-section">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm">Plan technique</CardTitle>
        <Badge
          variant={statut.publie ? "secondary" : "outline"}
          className="text-[11px] font-normal"
          data-testid="plan-technique-statut"
        >
          {statut.label}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {plan.plan_publie_le && (
          <p className="text-[11px] text-muted-foreground">
            Publié le {fmt(plan.plan_publie_le)}
          </p>
        )}

        {plan.plan_url && (
          <div className="flex items-center gap-2 rounded-md border bg-muted/20 p-2">
            <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <a
              href={plan.plan_url}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-1 truncate text-sm text-primary underline"
            >
              {plan.plan_url}
            </a>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {canPublish && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                aria-label="Retirer le lien"
                disabled={retirer.isPending}
                onClick={() => retirer.mutate()}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}

        {planDocs.map((d) => (
          <div key={d.id} className="flex items-center gap-2 rounded-md border bg-muted/20 p-2">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left text-sm text-primary underline"
              onClick={async () => {
                const url = await docs.getSignedUrl(d);
                if (url) window.open(url, "_blank", "noopener,noreferrer");
              }}
            >
              {d.filename}
            </button>
          </div>
        ))}

        {!statut.publie && (
          <p className="text-xs text-muted-foreground">
            Aucun plan n'a encore été publié pour cet objet. C'est une simple
            information : la fabrication n'est pas bloquée.
          </p>
        )}

        {canPublish && (
          <div className="space-y-2 border-t pt-3">
            <div className="flex gap-2">
              <Input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Coller un lien (Teams, SharePoint…)"
                className="h-9"
                data-testid="plan-technique-url-input"
              />
              <Button
                type="button"
                size="sm"
                className="h-9"
                disabled={publishLink.isPending || !urlInput.trim()}
                onClick={() => publishLink.mutate()}
                data-testid="plan-technique-url-submit"
              >
                {publishLink.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  void handlePdf(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                data-testid="plan-technique-pdf-upload"
              >
                {busy ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-1.5 h-4 w-4" />
                )}
                Déposer un PDF
              </Button>
              <span className="text-[11px] text-muted-foreground">
                Le PDF rejoint les documents du chantier.
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
