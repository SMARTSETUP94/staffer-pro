import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { proposerImagesDevis, ajouterImagesAuDevis } from "@/lib/server-fns/images-devis.functions";
import { CATEGORIE_LABEL } from "@/lib/devis/images-ia";
import { devisKey, type Ligne } from "./api";

type Prop = { ligne_id: string; document_id: string; confiance: number; justification: string; legende: string; visible_client: boolean; document_nom: string; categorie: string | null };
type Choix = Prop & { coche: boolean; cle: string };

/** Revue des images proposées par l'IA : rien n'est ajouté sans validation. */
export function ProposerImagesDialog({ devisId, affaireId, lignes }: { devisId: string; affaireId: string; lignes: Ligne[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [etape, setEtape] = useState<string | null>(null);
  const [choix, setChoix] = useState<Choix[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [info, setInfo] = useState<{ duree: number; cout: number; sansRendu: string[]; erreurs: string[]; candidats: number } | null>(null);
  const [ajout, setAjout] = useState(false);
  const cibles = useMemo(() => {
    const by = new Map(lignes.map((l) => [l.id, l]));
    const dansChap = (l?: Ligne): boolean => !!l && (l.type.startsWith("chapitre_") || dansChap(by.get(l.parent_id ?? "")));
    return lignes.filter((l) => (l.type === "zone" || l.type === "objet" || l.type === "option") && !dansChap(l)).sort((a, b) => a.ordre - b.ordre);
  }, [lignes]);
  const zoneDe = (l: Ligne) => l.type === "zone" ? null : lignes.find((x) => x.id === l.parent_id && x.type === "zone")?.libelle ?? null;

  const lancer = async () => {
    setOpen(true); setChoix([]); setInfo(null);
    const t0 = performance.now();
    try {
      setEtape("Préparation des documents…");
      const { preparerBoite } = await import("@/lib/devis/rendu-pages.client");
      const prep = await preparerBoite(affaireId, setEtape);
      setEtape("L'IA examine les images…");
      const r = await proposerImagesDevis({ data: { devisId } });
      const ids = [...new Set(r.propositions.map((p) => p.document_id))];
      if (ids.length) {
        const { data: docs } = await supabase.from("affaire_documents").select("id,storage_path").in("id", ids);
        const { data: s } = await supabase.storage.from("affaires-photos").createSignedUrls((docs ?? []).map((d) => d.storage_path), 600);
        setUrls(Object.fromEntries((docs ?? []).map((d, i) => [d.id, s?.[i]?.signedUrl ?? ""])));
      }
      setChoix(r.propositions.map((p) => ({ ...p, coche: false, cle: `${p.ligne_id}:${p.document_id}` })));
      setInfo({ duree: Math.round(performance.now() - t0), cout: r.cout_eur, sansRendu: r.sans_rendu, erreurs: prep.erreurs, candidats: r.candidats });
    } catch (e) { toast.error("Proposition impossible", { description: (e as Error).message }); setOpen(false); }
    setEtape(null);
  };
  const maj = (cle: string, f: (c: Choix) => Choix) => setChoix((cs) => cs.map((c) => (c.cle === cle ? f(c) : c)));
  const deplacer = (cle: string, ligneId: string) => setChoix((cs) => {
    const c = cs.find((x) => x.cle === cle);
    if (!c || cs.some((x) => x.ligne_id === ligneId && x.document_id === c.document_id)) return cs;
    return cs.map((x) => (x.cle === cle ? { ...x, ligne_id: ligneId, cle: `${ligneId}:${x.document_id}`, coche: true } : x));
  });
  const valider = async () => {
    const items = choix.filter((c) => c.coche).map((c) => ({ ligneId: c.ligne_id, documentId: c.document_id, legende: c.legende || null, visibleClient: c.visible_client }));
    if (!items.length) return;
    setAjout(true);
    try {
      const res = await ajouterImagesAuDevis({ data: { devisId, items } });
      const ok = res.filter((r) => r.ok).length, ko = res.filter((r) => !r.ok);
      await qc.invalidateQueries({ queryKey: devisKey(devisId) });
      if (ok) toast.success(`${ok} image${ok > 1 ? "s" : ""} ajoutée${ok > 1 ? "s" : ""} au devis`);
      if (ko.length) toast.error(`${ko.length} image${ko.length > 1 ? "s" : ""} non ajoutée${ko.length > 1 ? "s" : ""}`, { description: ko[0].erreur });
      setChoix((cs) => cs.filter((c) => !res.some((r) => r.ok && `${r.ligneId}:${r.documentId}` === c.cle)));
      if (!ko.length) setOpen(false);
    } catch (e) { toast.error("Ajout impossible", { description: (e as Error).message }); }
    setAjout(false);
  };
  const nbCoches = choix.filter((c) => c.coche).length;

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => void lancer()} disabled={etape !== null}><Sparkles className="mr-1 h-3.5 w-3.5" />Proposer les images</Button>
      <Dialog open={open} onOpenChange={(o) => { if (!etape && !ajout) setOpen(o); }}>
        <DialogContent className="flex max-h-[92vh] max-w-5xl flex-col">
          <DialogHeader>
            <DialogTitle>Images proposées</DialogTitle>
            <DialogDescription>Rien n'est ajouté sans votre validation. Faites glisser une image sur un autre objet, ou choisissez-le dans la liste.</DialogDescription>
          </DialogHeader>
          {etape && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{etape}</p>}
          {info && (
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>{choix.length} proposition{choix.length > 1 ? "s" : ""} sur {info.candidats} image{info.candidats > 1 ? "s" : ""} candidate{info.candidats > 1 ? "s" : ""} · {(info.duree / 1000).toFixed(1)} s · coût IA {info.cout.toFixed(4).replace(".", ",")} €</p>
              {info.sansRendu.length > 0 && <p>Pages non rendues : {info.sansRendu.join(", ")} (l'IA s'est servie des images extraites et du texte).</p>}
              {info.erreurs.map((e) => <p key={e} className="text-destructive">{e}</p>)}
            </div>
          )}
          {!etape && info && (
            <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto overflow-x-hidden md:grid-cols-[minmax(0,14rem)_1fr]">
              <ul className="space-y-1 text-sm">
                {cibles.map((l) => (
                  <li key={l.id} className="rounded border border-dashed px-2 py-1.5" onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); deplacer(e.dataTransfer.getData("text/plain"), l.id); }}>
                    <span className={l.type === "zone" ? "font-semibold" : "pl-2"}>{l.libelle || "Sans titre"}</span>
                    <span className="ml-1 text-xs text-muted-foreground">({choix.filter((c) => c.ligne_id === l.id).length})</span>
                  </li>
                ))}
              </ul>
              <div className="min-w-0 space-y-3">
                {choix.length === 0 && <p className="text-sm text-muted-foreground">Aucune image ne correspond aux zones et objets de ce devis.</p>}
                {cibles.filter((l) => choix.some((c) => c.ligne_id === l.id)).map((l) => (
                  <section key={l.id} className="space-y-2">
                    <h4 className="text-sm font-semibold">{zoneDe(l) ? `${zoneDe(l)} › ` : ""}{l.libelle || "Sans titre"}</h4>
                    <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                      {choix.filter((c) => c.ligne_id === l.id).map((c) => (
                        <div key={c.cle} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", c.cle)} className="flex min-w-0 gap-2 rounded-md border p-2 text-xs">
                          <img src={urls[c.document_id] || undefined} alt={c.document_nom} className="h-16 w-16 shrink-0 rounded object-cover sm:h-20 sm:w-20" />
                          <div className="min-w-0 flex-1 space-y-1">
                            <label className="flex items-center gap-1 font-medium">
                              <input type="checkbox" checked={c.coche} onChange={(e) => maj(c.cle, (x) => ({ ...x, coche: e.target.checked }))} />
                              <span className="truncate" title={c.document_nom}>{c.document_nom}</span>
                            </label>
                            <div className="flex flex-wrap gap-1">
                              <Badge variant={c.confiance >= 80 ? "default" : "secondary"}>{c.confiance} %</Badge>
                              {c.categorie && <Badge variant="outline">{CATEGORIE_LABEL[c.categorie] ?? c.categorie}</Badge>}
                            </div>
                            <p className="text-muted-foreground">{c.justification}</p>
                            <Input value={c.legende} maxLength={80} aria-label="Légende" placeholder="Légende" className="h-7 text-xs" onChange={(e) => maj(c.cle, (x) => ({ ...x, legende: e.target.value }))} />
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <label className="flex items-center gap-1"><input type="checkbox" checked={c.visible_client} onChange={(e) => maj(c.cle, (x) => ({ ...x, visible_client: e.target.checked }))} />Visible client</label>
                              <select aria-label="Déplacer vers" className="h-7 min-w-0 max-w-full rounded border bg-background text-xs sm:max-w-[9rem]" value={c.ligne_id} onChange={(e) => deplacer(c.cle, e.target.value)}>
                                {cibles.map((t) => <option key={t.id} value={t.id}>{t.libelle || "Sans titre"}</option>)}
                              </select>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          )}
          {!etape && info && (
            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="outline" disabled={!choix.length} onClick={() => setChoix((cs) => cs.map((c) => ({ ...c, coche: c.coche || c.confiance >= 80 })))}>Tout accepter au-dessus de 80 %</Button>
              <Button disabled={!nbCoches || ajout} onClick={() => void valider()}>{ajout ? "Ajout…" : `Ajouter ${nbCoches} image${nbCoches > 1 ? "s" : ""}`}</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
