/**
 * Bloc 9 (bonus) — Mini-section "Infos pose & livraison" sur la fiche affaire.
 *
 * 5 inputs nullable utilisés par la carte mission mobile :
 *   acces_livraison / code_acces / consignes_tenue / contact_site_nom / contact_site_tel
 */
import { useEffect, useState } from "react";
import { Loader2, Truck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface InfosPose {
  acces_livraison: string;
  code_acces: string;
  consignes_tenue: string;
  contact_site_nom: string;
  contact_site_tel: string;
}

const EMPTY: InfosPose = {
  acces_livraison: "",
  code_acces: "",
  consignes_tenue: "",
  contact_site_nom: "",
  contact_site_tel: "",
};

export function AffaireInfosPoseSection({ affaireId }: { affaireId: string }) {
  const [values, setValues] = useState<InfosPose>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("affaires")
        .select("acces_livraison, code_acces, consignes_tenue, contact_site_nom, contact_site_tel")
        .eq("id", affaireId)
        .maybeSingle();
      if (cancelled) return;
      setValues({
        acces_livraison: (data?.acces_livraison as string | null) ?? "",
        code_acces: (data?.code_acces as string | null) ?? "",
        consignes_tenue: (data?.consignes_tenue as string | null) ?? "",
        contact_site_nom: (data?.contact_site_nom as string | null) ?? "",
        contact_site_tel: (data?.contact_site_tel as string | null) ?? "",
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [affaireId]);

  const set = <K extends keyof InfosPose>(k: K, v: string) =>
    setValues((s) => ({ ...s, [k]: v }));

  async function save() {
    setSaving(true);
    const payload = {
      acces_livraison: values.acces_livraison.trim() || null,
      code_acces: values.code_acces.trim() || null,
      consignes_tenue: values.consignes_tenue.trim() || null,
      contact_site_nom: values.contact_site_nom.trim() || null,
      contact_site_tel: values.contact_site_tel.trim() || null,
    };
    const { error } = await supabase.from("affaires").update(payload).eq("id", affaireId);
    setSaving(false);
    if (error) {
      toast.error("Enregistrement impossible", { description: error.message });
    } else {
      toast.success("Infos pose & livraison enregistrées");
    }
  }

  return (
    <section data-testid="affaire-infos-pose">
      <p className="overline mb-3 flex items-center gap-2">
        <Truck className="h-3 w-3" />— Infos pose &amp; livraison (mission mobile)
      </p>
      <div className="rounded-2xl border border-border bg-card p-4">
        {loading ? (
          <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Chargement…
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="contact-site-nom" className="text-xs">
                  Contact site (nom)
                </Label>
                <Input
                  id="contact-site-nom"
                  value={values.contact_site_nom}
                  onChange={(e) => set("contact_site_nom", e.target.value)}
                  placeholder="Régisseur, chargé d'accueil…"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contact-site-tel" className="text-xs">
                  Contact site (téléphone)
                </Label>
                <Input
                  id="contact-site-tel"
                  value={values.contact_site_tel}
                  onChange={(e) => set("contact_site_tel", e.target.value)}
                  placeholder="06 12 34 56 78"
                  type="tel"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="code-acces" className="text-xs">
                  Code d'accès
                </Label>
                <Input
                  id="code-acces"
                  value={values.code_acces}
                  onChange={(e) => set("code_acces", e.target.value)}
                  placeholder="A1234B"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="consignes-tenue" className="text-xs">
                  Consignes tenue
                </Label>
                <Input
                  id="consignes-tenue"
                  value={values.consignes_tenue}
                  onChange={(e) => set("consignes_tenue", e.target.value)}
                  placeholder="Tenue noire, chaussures de sécurité…"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="acces-livraison" className="text-xs">
                  Accès livraison
                </Label>
                <Textarea
                  id="acces-livraison"
                  value={values.acces_livraison}
                  onChange={(e) => set("acces_livraison", e.target.value)}
                  rows={3}
                  placeholder="Itinéraire camion, créneau, quai, etc."
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                onClick={save}
                disabled={saving}
                className="rounded-xl"
                data-testid="save-infos-pose"
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enregistrer
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Visibles par les poseurs sur leur carte mission mobile (montage / démontage).
            </p>
          </>
        )}
      </div>
    </section>
  );
}
