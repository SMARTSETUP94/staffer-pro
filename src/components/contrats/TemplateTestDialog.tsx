/**
 * v0.42.2 — Dialog de validation E2E du template contrat.
 *
 * Génère 5 PDF preview avec fixtures hardcodées, affiche en gallery + checklist
 * sections attendues + détection placeholders {{...}} non interpolés.
 */
import { useEffect, useState } from "react";
import { Loader2, FileText, AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { generateContratPdfBlob } from "@/lib/contrats-pdf";
import { CONTRAT_TEST_FIXTURES, EXPECTED_SECTIONS } from "@/lib/contrats-template-fixtures";
import { interpolateContratTemplate, DEFAULT_CONTRAT_TEMPLATE_HTML } from "@/lib/contrats-templates";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  templateHtml: string | null;
}

interface FixtureResult {
  id: string;
  label: string;
  description: string;
  pdfUrl: string | null;
  rawPlaceholders: string[];
  missingSections: string[];
  generating: boolean;
  error: string | null;
}

export function TemplateTestDialog({ open, onOpenChange, templateHtml }: Props) {
  const [results, setResults] = useState<FixtureResult[]>([]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!open) {
      // Cleanup blob URLs
      results.forEach((r) => { if (r.pdfUrl) URL.revokeObjectURL(r.pdfUrl); });
      setResults([]);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const runAll = async () => {
    setRunning(true);
    const html = templateHtml ?? DEFAULT_CONTRAT_TEMPLATE_HTML;
    const initial: FixtureResult[] = CONTRAT_TEST_FIXTURES.map((f) => ({
      id: f.id, label: f.label, description: f.description,
      pdfUrl: null, rawPlaceholders: [], missingSections: [], generating: true, error: null,
    }));
    setResults(initial);

    for (let i = 0; i < CONTRAT_TEST_FIXTURES.length; i++) {
      const fix = CONTRAT_TEST_FIXTURES[i];
      try {
        // Pré-check : interpoler le template pour détecter placeholders raw / sections manquantes
        const poste = fix.data.poste && fix.data.poste.trim() !== "" ? fix.data.poste : "Technicien de plateau";
        const interpolated = interpolateContratTemplate(html, {
          employe_nom_complet: `${fix.data.employe_nom.toUpperCase()} ${fix.data.employe_prenom}`,
          employe_adresse_complete: fix.data.employe_adresse ?? "—",
          employe_email: fix.data.employe_email ?? "—",
          statut_contrat: fix.data.statut_contrat,
          poste,
          chantier_numero: fix.data.chantier_numero,
          chantier_libelle: fix.data.chantier_nom,
          date_debut: fix.data.date_debut,
          date_fin: fix.data.date_fin,
          heures_estimees: fix.data.heures_estimees ?? "—",
          taux_horaire_brut: fix.data.taux_horaire_brut == null ? "—" : `${fix.data.taux_horaire_brut} €`,
          numero_contrat: fix.data.numero_contrat ?? "—",
          date_signature_employe: "—",
          date_signature_employeur: "—",
        });
        const rawPlaceholders = Array.from(interpolated.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)).map((m) => m[1]);
        const missingSections = EXPECTED_SECTIONS.filter((s) => !interpolated.toLowerCase().includes(s.toLowerCase()));

        const blob = await generateContratPdfBlob({ ...fix.data, template_html: html });
        const url = URL.createObjectURL(blob);
        setResults((cur) => cur.map((r, idx) => idx === i ? {
          ...r, pdfUrl: url, rawPlaceholders, missingSections, generating: false,
        } : r));
      } catch (e) {
        setResults((cur) => cur.map((r, idx) => idx === i ? {
          ...r, generating: false, error: (e as Error).message,
        } : r));
      }
    }
    setRunning(false);
    toast.success("5 PDF de test générés");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tester le template — 5 cas critiques</DialogTitle>
          <DialogDescription>
            Génération automatique de 5 PDF preview couvrant les cas à risque (poste renseigné, fallback, adresse longue, libellé long, intérim).
            Vérifie l'absence de placeholder {`{{...}}`} raw et la présence des sections clés.
          </DialogDescription>
        </DialogHeader>

        {results.length === 0 ? (
          <div className="py-8 text-center">
            <Button onClick={runAll} disabled={running || !templateHtml}>
              {running ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Génération…</> : "Lancer les 5 tests"}
            </Button>
            {!templateHtml && <p className="mt-2 text-xs text-muted-foreground">Aucun template actif détecté.</p>}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((r) => {
              const ok = !r.error && r.rawPlaceholders.length === 0 && r.missingSections.length === 0;
              return (
                <div key={r.id} className="rounded-lg border bg-card p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm">{r.label}</div>
                      <div className="text-xs text-muted-foreground line-clamp-2">{r.description}</div>
                    </div>
                    {r.generating ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                    ) : ok ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                    )}
                  </div>

                  {r.error && (
                    <div className="text-xs text-destructive">Erreur : {r.error}</div>
                  )}

                  {!r.generating && !r.error && (
                    <>
                      {r.rawPlaceholders.length > 0 && (
                        <div className="text-xs text-destructive">
                          Placeholders non interpolés : {r.rawPlaceholders.slice(0, 3).join(", ")}
                        </div>
                      )}
                      {r.missingSections.length > 0 && (
                        <div className="text-xs text-amber-600">
                          Sections absentes : {r.missingSections.slice(0, 3).join(", ")}{r.missingSections.length > 3 && "…"}
                        </div>
                      )}
                      {ok && (
                        <Badge variant="secondary" className="text-[10px]">Aucun placeholder raw · {EXPECTED_SECTIONS.length} sections OK</Badge>
                      )}
                    </>
                  )}

                  {r.pdfUrl && (
                    <Button asChild variant="outline" size="sm" className="w-full">
                      <a href={r.pdfUrl} target="_blank" rel="noreferrer">
                        <FileText className="mr-1 h-3.5 w-3.5" />Ouvrir PDF
                        <ExternalLink className="ml-1 h-3 w-3" />
                      </a>
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
