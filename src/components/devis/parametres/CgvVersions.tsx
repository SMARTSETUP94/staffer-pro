import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const today = () => new Date().toISOString().slice(0, 10);

/** CGV versionnées : chaque enregistrement crée une version datée ; le PDF prend celle en vigueur à la date du devis. */
export function CgvVersions() {
  const qc = useQueryClient();
  const versions = useQuery({ queryKey: ["devis-cgv-versions"], queryFn: async () => {
    const { data, error } = await supabase.from("devis_cgv_versions").select("id,date_effet,texte,created_at,created_by").order("date_effet", { ascending: false });
    if (error) throw error; return data ?? [];
  } });
  const [texte, setTexte] = useState<string | null>(null);
  const [date, setDate] = useState(today());
  const [envoi, setEnvoi] = useState(false);
  const courante = (versions.data ?? []).find((v) => v.date_effet <= today()) ?? null;
  const valeur = texte ?? courante?.texte ?? "";
  const passe = date < today();

  const enregistrer = async () => {
    if (passe && !window.confirm("Date d'effet dans le passé : les devis datés depuis cette date imprimeront ce texte. Confirmer ?")) return;
    setEnvoi(true);
    const { error } = await supabase.rpc("devis_cgv_enregistrer", { _texte: valeur, _date_effet: date, _confirmer_passe: passe });
    setEnvoi(false);
    if (error) return toast.error(error.message);
    toast.success("Nouvelle version des CGV enregistrée"); setTexte(null);
    await qc.invalidateQueries({ queryKey: ["devis-cgv-versions"] });
  };

  return (
    <Card id="cgv">
      <CardHeader>
        <CardTitle className="text-base">Conditions générales de vente</CardTitle>
        <CardDescription>Imprimées en dernière page du PDF client (détaillé et synthétique) quand le devis a « Joindre les CGV ». Sans texte, aucune page n'est ajoutée. Une ligne vide sépare les paragraphes.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{courante ? `En vigueur depuis le ${new Date(courante.date_effet).toLocaleDateString("fr-FR")}` : "Aucun texte saisi : les PDF n'ont pas de page CGV."}</p>
        <div className="space-y-1"><Label htmlFor="cgv-texte">Texte</Label>
          <Textarea id="cgv-texte" rows={10} value={valeur} onChange={(e) => setTexte(e.target.value)} placeholder="Saisissez vos conditions générales de vente" /></div>
        <div className="flex flex-wrap items-end gap-2">
          <div><Label htmlFor="cgv-date">Date d'effet</Label><Input id="cgv-date" type="date" className="w-40" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <Button disabled={envoi || !valeur.trim() || texte == null || !date} onClick={() => void enregistrer()}>Enregistrer une nouvelle version</Button>
        </div>
        {(versions.data ?? []).length > 0 && (
          <details><summary className="cursor-pointer text-sm">Historique ({versions.data!.length})</summary>
            <ul className="mt-2 space-y-1 text-xs">{versions.data!.map((v) => (
              <li key={v.id} className="rounded border p-2"><strong>{new Date(v.date_effet).toLocaleDateString("fr-FR")}</strong> · saisie le {new Date(v.created_at).toLocaleString("fr-FR")}
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-muted-foreground">{v.texte}</p></li>))}</ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
