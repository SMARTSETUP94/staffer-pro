import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, Loader2 } from "lucide-react";
import { requireCapability } from "@/lib/capability-guard";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { chunk, extractRows, slugFromFilename } from "@/lib/devis/materiaux-import";
import { MateriauxRecherche } from "@/components/devis/MateriauxRecherche";

export const Route = createFileRoute("/_app/parametres/devis-materiaux")({
  beforeLoad: () => requireCapability("devis.parametres"),
  head: () => ({ meta: [{ title: "Catalogue matériaux — Paramètres devis" }] }),
  component: MateriauxPage,
});

type Bilan = {
  lignes_fichier: number; sans_prix: number; actives_avant: number; ajoutees: number; retirees: number;
  variation_mediane_pct: number | null;
  hausses: { produit: string; ancien: number; nouveau: number; var: number }[];
  baisses: { produit: string; ancien: number; nouveau: number; var: number }[];
};

const ETAT_LABEL: Record<string, string> = { ok: "OK", a_surveiller: "À surveiller", ancien: "Ancien" };

async function sha(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

function MateriauxPage() {
  const qc = useQueryClient();
  const fourn = useQuery({
    queryKey: ["materiaux-fournisseurs"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("materiaux_fournisseurs_stats");
      if (error) throw error;
      return data ?? [];
    },
  });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ label: string; pct: number } | null>(null);
  const [pending, setPending] = useState<{ importId: string; slug: string; bilan: Bilan } | null>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const list = [...files];
      const fFile = list.find((f) => /fournisseurs?_tarifs/i.test(f.name));
      if (fFile) {
        const rows = extractRows(JSON.parse(await fFile.text()));
        for (const r of rows) {
          const { error } = await supabase.rpc("fournisseur_tarif_enregistrer", { _f: r as never });
          if (error) throw new Error(`${String(r.slug)} : ${error.message}`);
        }
        toast.success(`${rows.length} fournisseurs enregistrés`);
        await qc.invalidateQueries({ queryKey: ["materiaux-fournisseurs"] });
      }
      const others = list.filter((f) => f !== fFile);
      if (others.length > 1) toast.info("Un seul fichier tarif à la fois : seul le premier est préparé.");
      const file = others[0];
      if (file) {
        const { data: fresh } = await supabase.rpc("materiaux_fournisseurs_stats");
        const slug = slugFromFilename(file.name, (fresh ?? []).map((f) => f.slug));
        if (!slug) throw new Error(`Fournisseur introuvable pour « ${file.name} » (nommez le fichier <slug>.json)`);
        const text = await file.text();
        const rows = extractRows(JSON.parse(text));
        const { data: importId, error } = await supabase.rpc("materiaux_import_preparer", {
          _fournisseur_slug: slug, _fichier_nom: file.name, _hash: await sha(text),
        });
        if (error) throw error;
        const parts = chunk(rows);
        for (let i = 0; i < parts.length; i++) {
          setProgress({ label: `${slug} — envoi ${i + 1}/${parts.length}`, pct: Math.round(((i + 1) / parts.length) * 100) });
          const { error: e } = await supabase.rpc("materiaux_import_ajouter", { _import_id: importId as string, _lignes: parts[i] as never });
          if (e) throw e;
        }
        setProgress({ label: "Calcul du bilan…", pct: 100 });
        const { data: bilan, error: eb } = await supabase.rpc("materiaux_import_bilan", { _import_id: importId as string });
        if (eb) throw eb;
        setPending({ importId: importId as string, slug, bilan: bilan as unknown as Bilan });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const valider = async () => {
    if (!pending) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("materiaux_import_valider", { _import_id: pending.importId });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${data} lignes actives pour ${pending.slug}`);
    setPending(null);
    qc.invalidateQueries({ queryKey: ["materiaux-fournisseurs"] });
  };

  const eur = (n: number | null) => (n == null ? "—" : n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" }));

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Devis — catalogue matériaux</h1>
        <p className="text-sm text-muted-foreground">
          Un nouveau tarif remplace celui du fournisseur : les anciennes lignes sont désactivées, jamais supprimées.{" "}
          <Link to="/parametres/devis-taux" className="underline">← Taux et forfaits</Link>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Importer</CardTitle>
          <CardDescription>Sélectionnez fournisseurs_tarifs.json et/ou un fichier tarif nommé &lt;slug&gt;.json. L'envoi se fait par paquets de 2 000 lignes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Choisir des fichiers
            <input type="file" multiple accept=".json" className="hidden" disabled={busy} onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
          </label>
          {progress && <div className="space-y-1"><p className="text-sm">{progress.label}</p><Progress value={progress.pct} /></div>}
          {pending && (
            <div className="space-y-3 rounded-md border p-4">
              <h3 className="font-medium">Bilan avant validation — {pending.slug}</h3>
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="secondary">{pending.bilan.lignes_fichier} lignes dans le fichier</Badge>
                <Badge variant="secondary">{pending.bilan.ajoutees} ajoutées</Badge>
                <Badge variant="secondary">{pending.bilan.retirees} retirées (sur {pending.bilan.actives_avant})</Badge>
                <Badge variant="secondary">{pending.bilan.sans_prix} sans prix</Badge>
                <Badge>Variation médiane : {pending.bilan.variation_mediane_pct == null ? "—" : `${pending.bilan.variation_mediane_pct} %`}</Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {(["hausses", "baisses"] as const).map((k) => (
                  <div key={k}>
                    <p className="mb-1 text-sm font-medium">{k === "hausses" ? "Plus fortes hausses" : "Plus fortes baisses"}</p>
                    {pending.bilan[k].length === 0 ? <p className="text-xs text-muted-foreground">Aucune</p> : (
                      <ul className="space-y-0.5 text-xs">
                        {pending.bilan[k].map((x, i) => <li key={i}>{x.produit} : {eur(x.ancien)} → {eur(x.nouveau)} ({x.var} %)</li>)}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button onClick={valider} disabled={busy}>Valider et remplacer le tarif</Button>
                <Button variant="ghost" onClick={() => setPending(null)}>Abandonner</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Fournisseurs</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Fournisseur</TableHead><TableHead>Date du tarif</TableHead><TableHead>État</TableHead><TableHead className="text-right">Lignes actives</TableHead></TableRow></TableHeader>
            <TableBody>
              {(fourn.data ?? []).map((f) => (
                <TableRow key={f.id}>
                  <TableCell>{f.nom} <span className="text-xs text-muted-foreground">{f.slug}</span>{f.prix_public && <Badge variant="outline" className="ml-2">prix public</Badge>}</TableCell>
                  <TableCell>{f.date_tarif ? new Date(f.date_tarif).toLocaleDateString("fr-FR") : "—"}</TableCell>
                  <TableCell><Badge variant={f.etat === "ok" ? "secondary" : "destructive"}>{ETAT_LABEL[f.etat] ?? f.etat}</Badge></TableCell>
                  <TableCell className="text-right">{Number(f.lignes_actives).toLocaleString("fr-FR")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Rechercher</CardTitle></CardHeader>
        <CardContent><MateriauxRecherche /></CardContent>
      </Card>
    </div>
  );
}
