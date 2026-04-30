/**
 * v0.32.0 — ErrorBoundary dédié aux routes d'import.
 *
 * Capture les erreurs React non rattrapées (parser qui throw dans un setState,
 * useMemo qui crash sur un fichier corrompu, etc.) et affiche un écran
 * actionnable au lieu d'une page blanche / d'un crash global.
 *
 * Usage : wrapper autour du contenu de la route, sous PageHeader.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertOctagon, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  /** Libellé court du module pour le message (ex: "Import devis"). */
  label: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ImportErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error(`[ImportErrorBoundary:${this.props.label}]`, error, info);
  }

  reset = () => {
    this.setState({ error: null });
  };

  reload = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    const msg = this.state.error.message || "Erreur inconnue";
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="space-y-4 p-6">
          <div className="flex items-start gap-3">
            <AlertOctagon className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-destructive">
                {this.props.label} — un problème nous a empêché d'afficher cette page.
              </p>
              <p className="text-xs text-destructive/80">
                Le fichier que tu as chargé contient probablement une donnée
                inattendue (cellule mal formatée, en-tête manquante, fichier corrompu).
                Tes données ne sont pas perdues : aucun import n'a été effectué.
              </p>
            </div>
          </div>
          <details className="rounded-xl border border-destructive/20 bg-background/50 p-3 text-[11px] text-muted-foreground">
            <summary className="cursor-pointer font-mono text-destructive/80">
              Détail technique
            </summary>
            <pre className="mt-2 whitespace-pre-wrap break-words">{msg}</pre>
          </details>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-xl"
              onClick={this.reset}
            >
              <RotateCcw className="mr-1.5 h-4 w-4" /> Réessayer
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 rounded-xl"
              onClick={this.reload}
            >
              Recharger la page
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }
}
