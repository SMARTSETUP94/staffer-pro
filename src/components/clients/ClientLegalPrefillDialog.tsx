import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { enrichClientFiche } from "@/lib/server-fns/client-enrichment.functions";
import { prefillClientLegal, sirenFromIdentifier, type ClientLegalFields } from "@/lib/client-legal-prefill";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export function ClientLegalPrefillDialog({ client, onClose, onDone }: {
  client: ClientLegalFields & { id: string; nom: string; domaines_email: string[]; email: string | null };
  onClose: () => void;
  onDone: () => void;
}) {
  const enrich = useServerFn(enrichClientFiche);
  const [draft, setDraft] = useState<ClientLegalFields>(client);
  const [sources, setSources] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    setSearching(true);
    setError(null);
    try {
      const result = await enrich({ data: { nom: client.nom, domaine: client.domaines_email[0], email: client.email ?? undefined } });
      if (result.error || !result.suggestion) {
        setError(result.error ?? "Aucune information juridique trouvée.");
        return;
      }
      const suggestion = result.suggestion;
      setDraft((current) => prefillClientLegal(current, suggestion));
      setSources((result.suggestion.sources ?? []).filter((url) => /^https?:\/\//i.test(url)));
      if (!result.suggestion.siret && !result.suggestion.adresse && !result.suggestion.site_web) {
        setError("Aucune information juridique confirmée dans les sources consultées.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Recherche indisponible.");
    } finally {
      setSearching(false);
    }
  }

  async function save() {
    setSaving(true);
    const { error: saveError } = await supabase.from("clients").update({
      siret: draft.siret?.trim() || null,
      adresse: draft.adresse?.trim() || null,
      site_web: draft.site_web?.trim() || null,
    }).eq("id", client.id);
    setSaving(false);
    if (saveError) { setError(saveError.message); return; }
    toast.success("Informations juridiques enregistrées");
    onDone();
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !searching && !saving) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Informations juridiques — {client.nom}</DialogTitle>
        <DialogDescription>Vérifie les informations proposées avant d’enregistrer. Les champs renseignés sont conservés.</DialogDescription>
      </DialogHeader>
      <Button variant="outline" onClick={search} disabled={searching || saving}>
        {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {searching ? "Recherche sur internet…" : "Rechercher avec l’IA"}
      </Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="space-y-3">
        <div><Label htmlFor="legal-siren">SIREN / SIRET</Label><Input id="legal-siren" value={draft.siret ?? ""} disabled={searching || saving} onChange={(e) => setDraft((d) => ({ ...d, siret: e.target.value }))} />
          {sirenFromIdentifier(draft.siret) && <p className="text-xs text-muted-foreground mt-1">SIREN : {sirenFromIdentifier(draft.siret)}</p>}
        </div>
        <div><Label htmlFor="legal-address">Adresse postale</Label><Textarea id="legal-address" rows={2} value={draft.adresse ?? ""} disabled={searching || saving} onChange={(e) => setDraft((d) => ({ ...d, adresse: e.target.value }))} /></div>
        <div><Label htmlFor="legal-website">Site web</Label><Input id="legal-website" value={draft.site_web ?? ""} disabled={searching || saving} onChange={(e) => setDraft((d) => ({ ...d, site_web: e.target.value }))} /></div>
      </div>
      {sources.length > 0 && <details><summary className="text-xs cursor-pointer text-muted-foreground">Sources consultées ({sources.length})</summary><ul className="space-y-1 mt-2 text-xs">{sources.map((url) => <li key={url}><a href={url} target="_blank" rel="noopener noreferrer" className="text-primary break-all hover:underline">{url}</a></li>)}</ul></details>}
      <DialogFooter><Button variant="outline" onClick={onClose} disabled={searching || saving}>Annuler</Button><Button onClick={save} disabled={searching || saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}Enregistrer</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}