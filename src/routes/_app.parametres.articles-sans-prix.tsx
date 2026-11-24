import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { requireCapability } from "@/lib/capability-guard";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { construireLot, type ArticleSansPrix } from "@/lib/devis/articles-sans-prix";

export const Route = createFileRoute("/_app/parametres/articles-sans-prix")({
  beforeLoad: () => requireCapability("devis.parametres"),
  head: () => ({ meta: [{ title: "Articles sans prix — Catalogue devis SET UP" }, { name: "description", content: "Saisie groupée par un admin des prix d'achat des articles du catalogue sans prix." }, { property: "og:title", content: "Articles sans prix du catalogue" }, { property: "og:description", content: "Compléter les prix d'achat manquants du catalogue matériaux." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Page,
});

const PAGE = 50;
const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 4 });

function Page() {
  const qc = useQueryClient();
  const [q, setQ] = useState(""); const [famille, setFamille] = useState(""); const [offset, setOffset] = useState(0);
  const [saisies, setSaisies] = useState<Record<string, string>>({});
  const [connus, setConnus] = useState<Record<string, ArticleSansPrix>>({});
  const [recap, setRecap] = useState(false); const [dateTarif, setDateTarif] = useState(new Date().toISOString().slice(0, 10));
  const familles = useQuery({ queryKey: ["familles-sans-prix"], queryFn: async () => {
    const { data } = await supabase.rpc("materiaux_sans_prix_lire", { _recherche: "", _limit: 100, _offset: 0 });
    return data as unknown as { total: number };
  } });
  const liste = useQuery({ queryKey: ["articles-sans-prix", q, famille, offset], queryFn: async () => {
    const { data, error } = await supabase.rpc("materiaux_sans_prix_lire", { _recherche: q, ...(famille ? { _famille: famille } : {}), _limit: PAGE, _offset: offset });
    if (error) throw error;
    return data as unknown as { total: number; lignes: ArticleSansPrix[] };
  } });
  const lignes = liste.data?.lignes ?? [];
  const { lot, erreurs } = construireLot(Object.values(connus), saisies);
  const nomFamilles = Array.from(new Set(lignes.map((l) => l.famille).filter(Boolean))) as string[];

  const saisir = (a: ArticleSansPrix, v: string) => { setConnus((c) => ({ ...c, [a.id]: a })); setSaisies((s) => ({ ...s, [a.id]: v })); };
  const enregistrer = async () => {
    const { data, error } = await supabase.rpc("materiaux_sans_prix_enregistrer", { _changements: lot as never, _date_tarif: dateTarif });
    if (error) return toast.error(error.message);
    toast.success(`${(data as { enregistres: number }).enregistres} prix enregistré(s)`);
    setSaisies({}); setConnus({}); setRecap(false);
    await qc.invalidateQueries({ queryKey: ["articles-sans-prix"] });
  };

  return (
    <div className="space-y-4 p-3 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Articles sans prix</h1>
        <p className="text-sm text-muted-foreground">Articles actifs du catalogue sans prix d'achat ({familles.data?.total ?? "…"}). Saisissez les prix puis « Enregistrer » : récapitulatif, enregistrement groupé et historique.{" "}
          <Link to="/parametres/devis-materiaux" className="underline">Catalogue matériaux →</Link></p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input className="w-64" placeholder="Rechercher produit, réf., fournisseur" value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} aria-label="Rechercher" />
        <Input className="w-48" placeholder="Famille (exacte)" list="familles" value={famille} onChange={(e) => { setFamille(e.target.value); setOffset(0); }} aria-label="Famille" />
        <datalist id="familles">{nomFamilles.map((f) => <option key={f} value={f} />)}</datalist>
      </div>
      {lot.length + erreurs.length > 0 && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-md border bg-card p-2 text-sm shadow-sm">
          <span><strong>{lot.length}</strong> prix à enregistrer</span>
          {erreurs.length > 0 && <span className="text-destructive">{erreurs.length} saisie(s) invalide(s)</span>}
          <Button size="sm" disabled={!lot.length || erreurs.length > 0} onClick={() => setRecap(true)}>Enregistrer…</Button>
          <Button size="sm" variant="outline" onClick={() => { setSaisies({}); setConnus({}); }}>Annuler les saisies</Button>
        </div>
      )}
      {liste.error && <p role="alert" className="text-sm text-destructive">{(liste.error as Error).message}</p>}
      <div className="hidden overflow-auto rounded-md border md:block">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted text-left text-xs"><tr><th className="p-2">Produit</th><th className="p-2">Famille</th><th className="p-2">Réf.</th><th className="p-2">Fournisseur</th><th className="p-2">Unité</th><th className="p-2 text-right">Prix d'achat HT</th></tr></thead>
          <tbody>{lignes.map((a, i) => (
            <tr key={a.id} className="border-t">
              <td className="p-1.5">{a.produit}</td><td className="p-1.5 text-muted-foreground">{a.famille ?? "—"}</td><td className="p-1.5 font-mono text-xs">{a.ref ?? "—"}</td>
              <td className="p-1.5">{a.fournisseur ?? "—"}</td><td className="p-1.5">{a.unite ?? "—"}</td>
              <td className="p-1 text-right"><Input data-cellule={i} aria-label={`Prix d'achat ${a.produit}`} inputMode="decimal" className="ml-auto h-8 w-28 text-right tabular-nums" placeholder="à saisir"
                value={saisies[a.id] ?? ""} onChange={(e) => saisir(a, e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (document.querySelector(`[data-cellule="${i + (e.shiftKey ? -1 : 1)}"]`) as HTMLInputElement | null)?.focus(); } }} /></td>
            </tr>))}</tbody>
        </table>
      </div>
      <ul className="space-y-2 md:hidden">{lignes.map((a) => (
        <li key={a.id} className="rounded-md border p-2 text-sm">
          <p className="font-medium">{a.produit}</p>
          <p className="text-xs text-muted-foreground">{[a.famille, a.ref, a.fournisseur, a.unite].filter(Boolean).join(" · ")}</p>
          <Input aria-label={`Prix d'achat ${a.produit}`} inputMode="decimal" className="mt-1 h-9 text-right" placeholder="Prix d'achat HT" value={saisies[a.id] ?? ""} onChange={(e) => saisir(a, e.target.value)} />
        </li>))}</ul>
      <div className="flex items-center gap-2 text-sm">
        <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Précédent</Button>
        <span>{liste.data ? `${Math.min(offset + 1, liste.data.total)}–${Math.min(offset + PAGE, liste.data.total)} sur ${liste.data.total}` : "…"}</span>
        <Button size="sm" variant="outline" disabled={!liste.data || offset + PAGE >= liste.data.total} onClick={() => setOffset(offset + PAGE)}>Suivant</Button>
      </div>
      <Dialog open={recap} onOpenChange={setRecap}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Récapitulatif des prix</DialogTitle><DialogDescription>Les devis déjà rédigés gardent leurs prix ; ces prix servent aux prochaines lignes ajoutées.</DialogDescription></DialogHeader>
          <ul className="space-y-1 text-sm">{lot.map((c) => <li key={c.id} className="flex justify-between gap-2 border-b py-1"><span>{connus[c.id]?.produit}</span><span className="tabular-nums">{c.ancien_prix == null ? "vide" : eur(c.ancien_prix)} → <strong>{eur(c.prix)}</strong></span></li>)}</ul>
          <label className="text-sm">Date du tarif <Input type="date" className="mt-1 w-40" value={dateTarif} onChange={(e) => setDateTarif(e.target.value)} /></label>
          <DialogFooter><Button variant="outline" onClick={() => setRecap(false)}>Retour</Button><Button disabled={!dateTarif} onClick={() => void enregistrer()}>Enregistrer {lot.length} prix</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
