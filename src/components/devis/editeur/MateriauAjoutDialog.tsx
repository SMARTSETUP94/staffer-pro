import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MateriauxRecherche, type MateriauResult } from "@/components/devis/MateriauxRecherche";
import { convertirEnUnitesVente } from "@/lib/devis/calcul";
import { eur } from "./api";

type Rapide = { id: string; produit: string; format_texte: string | null; epaisseur_mm: number | null; unite: string; fournisseur: string; prix_achat_net: number | null; prix_m2: number | null };

export function MateriauAjoutDialog({ open, onOpenChange, devisId, onAdd }: {
  open: boolean; onOpenChange: (o: boolean) => void; devisId: string;
  onAdd: (p: { materiau_id?: string; designation?: string; fournisseur?: string; unite?: string; prix_achat?: number; quantite: number; aide_conversion?: unknown; propose_catalogue?: boolean }) => Promise<void>;
}) {
  const [pick, setPick] = useState<Partial<MateriauResult> | null>(null);
  const [qte, setQte] = useState("1");
  const [mode, setMode] = useState<"direct" | "m2" | "pieces" | "ml">("direct");
  const [m2, setM2] = useState(""); const [ml, setMl] = useState(""); const [perte, setPerte] = useState("10");
  const [pieces, setPieces] = useState("");
  const [libre, setLibre] = useState({ designation: "", fournisseur: "", unite: "", prix: "", proposer: false });

  const rapides = useQuery({
    queryKey: ["materiaux-rapides", devisId], enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("materiaux_acces_rapides", { _devis_id: devisId });
      if (error) throw error;
      return data as unknown as Record<"favoris" | "recents" | "ce_devis" | "top12", Rapide[]>;
    },
  });

  const reset = () => { setPick(null); setQte("1"); setMode("direct"); setM2(""); setMl(""); setPieces(""); };
  const conv = (() => {
    if (!pick || mode === "direct") return null;
    const fmt = { longueur_mm: pick.longueur_mm, largeur_mm: pick.largeur_mm };
    const p = Number(perte.replace(",", ".")) || 0;
    if (mode === "m2") return convertirEnUnitesVente("m2", { m2: Number(m2.replace(",", ".")) }, fmt, p);
    if (mode === "ml") return convertirEnUnitesVente("ml", { ml: Number(ml.replace(",", ".")) }, fmt, p);
    const list = pieces.split(/[\n;]+/).map((s) => s.trim()).filter(Boolean).map((s) => {
      const [dims, n] = s.split(/\s*[×x*]\s*(?=\d+\s*$)|\s+/).length ? s.split("=") : [s];
      const m = s.match(/(\d+)\s*[x×*]\s*(\d+)(?:\s*[x×*]\s*(\d+))?/i);
      void dims; void n;
      return m ? { l: Number(m[1]), w: Number(m[2]), n: Number(m[3] ?? 1) } : null;
    }).filter(Boolean) as { l: number; w: number; n: number }[];
    return convertirEnUnitesVente("pieces", { pieces: list }, fmt, p);
  })();

  const favori = async (id: string) => {
    const { error } = await supabase.from("materiaux_favoris").insert({ materiau_id: id });
    if (error && !error.message.includes("duplicate")) toast.error(error.message); else { toast.success("Ajouté aux favoris"); rapides.refetch(); }
  };

  const valider = async () => {
    if (!pick?.id) return;
    const q = conv ?? Number(qte.replace(",", "."));
    await onAdd({ materiau_id: pick.id, quantite: q || 1, aide_conversion: mode === "direct" ? null : { mode, m2, ml, pieces, perte_pct: Number(perte) } });
    reset(); onOpenChange(false);
  };

  const RapideList = ({ items }: { items?: Rapide[] }) => (
    <div className="max-h-72 divide-y overflow-auto rounded-md border">
      {(items ?? []).length === 0 && <p className="p-3 text-sm text-muted-foreground">Rien pour l'instant.</p>}
      {(items ?? []).map((m) => (
        <button type="button" key={m.id} onClick={() => setPick(m as unknown as MateriauResult)} className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-muted">
          <span>{m.produit} <span className="text-xs text-muted-foreground">{[m.format_texte, m.epaisseur_mm ? `ép. ${m.epaisseur_mm}` : null, m.fournisseur, m.unite].filter(Boolean).join(" · ")}</span></span>
          <span className="text-xs">{eur(m.prix_achat_net)}</span>
        </button>
      ))}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Ajouter un matériau</DialogTitle></DialogHeader>
        {!pick ? (
          <Tabs defaultValue="recherche">
            <TabsList>
              <TabsTrigger value="recherche">Recherche</TabsTrigger>
              <TabsTrigger value="ce_devis">Dans ce devis</TabsTrigger>
              <TabsTrigger value="recents">Récents</TabsTrigger>
              <TabsTrigger value="favoris">Favoris</TabsTrigger>
              <TabsTrigger value="top12">Plus utilisés</TabsTrigger>
              <TabsTrigger value="libre">Pas trouvé</TabsTrigger>
            </TabsList>
            <TabsContent value="recherche"><MateriauxRecherche autoFocus onPick={setPick} /></TabsContent>
            {(["ce_devis", "recents", "favoris", "top12"] as const).map((k) => (
              <TabsContent key={k} value={k}><RapideList items={rapides.data?.[k]} /></TabsContent>
            ))}
            <TabsContent value="libre" className="space-y-2">
              <Input placeholder="Désignation" value={libre.designation} onChange={(e) => setLibre({ ...libre, designation: e.target.value })} />
              <div className="grid grid-cols-3 gap-2">
                <Input placeholder="Fournisseur" value={libre.fournisseur} onChange={(e) => setLibre({ ...libre, fournisseur: e.target.value })} />
                <Input placeholder="Unité" value={libre.unite} onChange={(e) => setLibre({ ...libre, unite: e.target.value })} />
                <Input placeholder="Prix d'achat €" inputMode="decimal" value={libre.prix} onChange={(e) => setLibre({ ...libre, prix: e.target.value })} />
              </div>
              <Input placeholder="Quantité" inputMode="decimal" value={qte} onChange={(e) => setQte(e.target.value)} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={libre.proposer} onChange={(e) => setLibre({ ...libre, proposer: e.target.checked })} />Proposer au catalogue</label>
              <Button disabled={!libre.designation.trim()} onClick={async () => {
                await onAdd({ designation: libre.designation.trim(), fournisseur: libre.fournisseur, unite: libre.unite,
                  prix_achat: Number(libre.prix.replace(",", ".")) || 0, quantite: Number(qte.replace(",", ".")) || 1, propose_catalogue: libre.proposer });
                setLibre({ designation: "", fournisseur: "", unite: "", prix: "", proposer: false }); onOpenChange(false);
              }}>Ajouter la ligne libre</Button>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start justify-between rounded-md border p-3">
              <div>
                <p className="font-medium">{pick.produit}</p>
                <p className="text-xs text-muted-foreground">{[pick.format_texte, pick.epaisseur_mm ? `ép. ${pick.epaisseur_mm} mm` : null, pick.fournisseur, pick.unite].filter(Boolean).join(" · ")}</p>
                {pick.prix_achat_net !== undefined && <p className="text-sm">{eur(pick.prix_achat_net ?? null)} / {pick.unite}</p>}
              </div>
              <Button variant="ghost" size="sm" onClick={() => pick.id && favori(pick.id)}><Star className="mr-1 h-4 w-4" />Favori</Button>
            </div>
            <div className="flex flex-wrap gap-1 text-sm">
              {(["direct", "m2", "pieces", "ml"] as const).map((m) => (
                <Button key={m} size="sm" variant={mode === m ? "default" : "outline"} onClick={() => setMode(m)}>
                  {m === "direct" ? `Quantité (${pick.unite})` : m === "m2" ? "Depuis m²" : m === "pieces" ? "Depuis pièces" : "Depuis mètres linéaires"}
                </Button>
              ))}
            </div>
            {mode === "direct" && <Input autoFocus inputMode="decimal" value={qte} onChange={(e) => setQte(e.target.value)} onKeyDown={(e) => e.key === "Enter" && valider()} />}
            {mode === "m2" && <Input autoFocus placeholder="Surface en m²" value={m2} onChange={(e) => setM2(e.target.value)} />}
            {mode === "ml" && <Input autoFocus placeholder="Mètres linéaires" value={ml} onChange={(e) => setMl(e.target.value)} />}
            {mode === "pieces" && <textarea autoFocus className="min-h-20 w-full rounded-md border bg-background p-2 text-sm" placeholder={"Une pièce par ligne : longueur x largeur x nombre (mm)\n1200 x 600 x 4"} value={pieces} onChange={(e) => setPieces(e.target.value)} />}
            {mode !== "direct" && (
              <div className="flex items-center gap-2 text-sm">
                Perte <Input className="h-8 w-16" value={perte} onChange={(e) => setPerte(e.target.value)} /> %
                <span className="ml-auto font-medium">{conv == null ? "Format du produit inconnu ou saisie vide" : `${conv} ${pick.unite}`}</span>
              </div>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={reset}>Retour</Button>
              <Button onClick={valider} disabled={mode !== "direct" && conv == null}>Ajouter</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
