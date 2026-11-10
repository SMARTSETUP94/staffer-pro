import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Loader2, RefreshCw } from "lucide-react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { requireCapability } from "@/lib/capability-guard";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReglagesFormulaireLogistique } from "@/components/logistique/ReglagesFormulaireLogistique";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_app/parametres/formulaire-logistique")({
  beforeLoad: () => requireCapability("section.admin"),
  head: () => ({
    meta: [
      { title: "Formulaire logistique — Paramètres SET UP" },
      { name: "description", content: "Réglages des chefs d'équipe, catégories, champs obligatoires et lien privé du formulaire logistique SET UP." },
      { property: "og:title", content: "Formulaire logistique — Paramètres SET UP" },
      { property: "og:description", content: "Configurer et partager le formulaire de demande logistique aux équipes SET UP." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const [creeLe, setCreeLe] = useState<string | null>(null);
  const [lien, setLien] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void supabase.rpc("demande_log_jeton_etat").then(({ data }) => setCreeLe((data as string | null) ?? null)); }, []);
  async function regenerer() {
    setBusy(true);
    const { data, error } = await supabase.rpc("demande_log_jeton_regenerer");
    setBusy(false);
    if (error || !data) return toast.error("Régénération impossible", { description: error?.message });
    setLien(`${window.location.origin}/demande-logistique?jeton=${data}`);
    setCreeLe(new Date().toISOString());
    toast.success("Nouveau lien créé ; l'ancien ne fonctionne plus");
  }
  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader title="Lien formulaire logistique" description="Le lien permet aux équipes d'envoyer une demande sans compte. Il ne donne accès à aucune autre donnée." />
      <section className="max-w-2xl space-y-4">
        <p className="text-sm">{creeLe ? `Lien actif depuis le ${format(parseISO(creeLe), "d MMM yyyy à HH:mm", { locale: fr })}.` : "Aucun lien actif."}</p>
        {lien ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input readOnly value={lien} aria-label="Lien du formulaire" />
              <Button variant="outline" onClick={() => { void navigator.clipboard.writeText(lien); toast.success("Lien copié"); }}><Copy className="mr-1 h-4 w-4" />Copier</Button>
            </div>
            <div className="inline-block rounded-md bg-background p-3"><QRCodeSVG value={lien} size={180} /></div>
            <p className="text-xs text-muted-foreground">Copiez-le maintenant : par sécurité, le lien complet n'est affiché qu'une fois. Pour le revoir, régénérez-le.</p>
          </div>
        ) : creeLe && <p className="text-xs text-muted-foreground">Le lien n'est pas conservé en clair. Régénérez-le pour l'afficher à nouveau (l'ancien cessera de fonctionner).</p>}
        <AlertDialog>
          <AlertDialogTrigger asChild><Button disabled={busy}>{busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}{creeLe ? "Régénérer le jeton" : "Créer le lien"}</Button></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{creeLe ? "Régénérer le jeton ?" : "Créer le lien ?"}</AlertDialogTitle>
              <AlertDialogDescription>{creeLe ? "L'ancien lien et son QR code cesseront immédiatement de fonctionner." : "Un lien partageable sera créé."}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>Annuler</AlertDialogCancel><AlertDialogAction onClick={regenerer}>Confirmer</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
      <ReglagesFormulaireLogistique />
    </div>
  );
}
