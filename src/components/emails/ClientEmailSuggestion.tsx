import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { suggestClientEmailReply } from "@/lib/server-fns/client-email-suggestion.functions";
import type { ClientEmailSuggestion as Suggestion } from "@/lib/client-email-suggestion";

export function ClientEmailSuggestion({ emailId }: { emailId: string }) {
  const suggest = useServerFn(suggestClientEmailReply);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inFlight = useRef(false);

  async function generate() {
    if (inFlight.current) return;
    if (suggestion && reply !== suggestion.reponse && !window.confirm("Remplacer la réponse que vous avez modifiée ?")) return;
    inFlight.current = true;
    setBusy(true); setError(null); setCopied(false);
    try {
      const result = await suggest({ data: { emailId } });
      if (result.error) setError(result.error);
      if (result.suggestion) { setSuggestion(result.suggestion); setReply(result.suggestion.reponse); }
    } catch (e) { setError(e instanceof Error ? e.message : "Suggestion indisponible."); }
    finally { inFlight.current = false; setBusy(false); }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(reply); setCopied(true); toast.success("Réponse copiée"); }
    catch { setCopied(false); toast.error("Copie impossible : sélectionnez le texte de la réponse."); }
  }

  return (
    <section className="space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> Analyse & réponse suggérée</h3>
        <Button size="sm" variant="outline" onClick={generate} disabled={busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : suggestion ? <RefreshCw className="mr-2 h-4 w-4" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {busy ? "Analyse en cours…" : suggestion ? "Régénérer" : "Analyser et suggérer une réponse"}
        </Button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {suggestion && <>
        <div className="space-y-2 text-sm">
          <h4 className="font-medium">Analyse du projet</h4>
          <p className="whitespace-pre-wrap break-words text-muted-foreground">{suggestion.analyse}</p>
          {suggestion.points_a_clarifier.length > 0 && <><h4 className="font-medium">À clarifier</h4><ul className="list-disc space-y-1 pl-5 text-muted-foreground">{suggestion.points_a_clarifier.map((point, i) => <li key={i}>{point}</li>)}</ul></>}
        </div>
        <div className="space-y-2">
          <label htmlFor={`reply-${emailId}`} className="text-sm font-medium">Réponse suggérée</label>
          <Textarea id={`reply-${emailId}`} value={reply} onChange={(e) => { setReply(e.target.value); setCopied(false); }} className="min-h-64" />
          <div className="flex justify-end"><Button size="sm" onClick={copy} disabled={!reply.trim() || busy}>{copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}{copied ? "Copiée" : "Copier la réponse"}</Button></div>
        </div>
      </>}
    </section>
  );
}