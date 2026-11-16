import { useEffect, useState } from "react";
import { Copy, Loader2, RefreshCw, Ban } from "lucide-react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Gestion du lien public « Planning des équipes » (semaine en cours + suivante). */
export function LienPlanningPublic() {
  const [creeLe, setCreeLe] = useState<string | null>(null);
  const [lien, setLien] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void supabase.rpc("planning_public_etat").then(({ data }) => setCreeLe((data as string | null) ?? null)); }, []);
  async function regenerer() {
    if (creeLe && !window.confirm("L'ancien lien cessera immédiatement de fonctionner. Continuer ?")) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("planning_public_regenerer");
    setBusy(false);
    if (error || !data) return toast.error("Création impossible", { description: error?.message });
    setLien(`${window.location.origin}/planning-equipes?cle=${data}`);
    setCreeLe(new Date().toISOString());
    toast.success("Nouveau lien créé");
  }
  async function desactiver() {
    if (!window.confirm("Désactiver le lien ? Plus personne ne pourra voir le planning avec.")) return;
    const { error } = await supabase.rpc("planning_public_desactiver");
    if (error) return toast.error("Désactivation impossible", { description: error.message });
    setLien(null); setCreeLe(null); toast.success("Lien désactivé");
  }
  return (
    <section className="max-w-2xl space-y-3 rounded-lg border border-border p-4">
      <h2 className="font-semibold">Lien planning des équipes</h2>
      <p className="text-sm text-muted-foreground">Lien sans connexion vers le planning de la semaine en cours et de la suivante (jour par jour et par employé), mis à jour en temps réel. Ni téléphone, ni coût, ni note interne.</p>
      <p className="text-sm">{creeLe ? `Lien actif depuis le ${format(parseISO(creeLe), "d MMM yyyy à HH:mm", { locale: fr })}.` : "Aucun lien actif."}</p>
      {lien ? (
        <div className="space-y-1">
          <div className="flex gap-2">
            <Input readOnly value={lien} aria-label="Lien du planning" />
            <Button variant="outline" onClick={() => { void navigator.clipboard.writeText(lien); toast.success("Lien copié"); }}><Copy className="mr-1 h-4 w-4" />Copier</Button>
          </div>
          <p className="text-xs text-muted-foreground">Copiez-le maintenant : le lien complet n'est affiché qu'une fois.</p>
        </div>
      ) : creeLe && <p className="text-xs text-muted-foreground">Le lien n'est pas conservé en clair. Régénérez-le pour l'afficher (l'ancien cessera de fonctionner).</p>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={regenerer} disabled={busy}>{busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}{creeLe ? "Régénérer le lien" : "Créer le lien"}</Button>
        {creeLe && <Button variant="outline" onClick={desactiver}><Ban className="mr-1 h-4 w-4" />Désactiver</Button>}
      </div>
    </section>
  );
}
