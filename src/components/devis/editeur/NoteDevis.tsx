import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, ChevronDown, ChevronRight, History, Pencil, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { pointsNote, pointsRestants } from "@/lib/devis/editeur-lisibilite";
import { blocsMarkdown, NOTE_MAX, type Segment } from "@/lib/devis/note";

export const STATUTS_TEXTE_EDITABLES = ["brouillon", "a_valider"];

function Segments({ s }: { s: Segment[] }) {
  return <>{s.map((x, i) => x.gras ? <strong key={i}>{x.texte}</strong> : <span key={i}>{x.texte}</span>)}</>;
}
/** Markdown simple rendu en éléments React, jamais en HTML brut. */
export function MarkdownSimple({ texte }: { texte: string | null }) {
  return (
    <div className="space-y-1.5 text-sm text-foreground">
      {blocsMarkdown(texte).map((b, i) => b.type === "para"
        ? <p key={i} className="whitespace-pre-wrap break-words"><Segments s={b.segments} /></p>
        : b.ordonnee
          ? <ol key={i} className="list-decimal space-y-0.5 pl-5">{b.items.map((it, j) => <li key={j}><Segments s={it} /></li>)}</ol>
          : <ul key={i} className="list-disc space-y-0.5 pl-5">{b.items.map((it, j) => <li key={j}><Segments s={it} /></li>)}</ul>)}
    </div>
  );
}

type Version = { id: string; cible: string; ligne_id: string | null; avant: string | null; apres: string | null; source: string; auteur_id: string | null; cree_le: string; restaure_depuis: string | null };

export function HistoriqueTextes({ devisId, cible, ligneId, open, onOpenChange, peutRestaurer, onRestaure }: {
  devisId: string; cible: "note" | "commentaire"; ligneId?: string | null; open: boolean; onOpenChange: (o: boolean) => void; peutRestaurer: boolean; onRestaure?: () => void;
}) {
  const q = useQuery({
    queryKey: ["devis-textes-historique", devisId, cible, ligneId ?? null],
    enabled: open,
    queryFn: async () => {
      let r = supabase.from("devis_textes_historique").select("*").eq("devis_id", devisId).eq("cible", cible).order("cree_le", { ascending: false }).limit(100);
      r = ligneId ? r.eq("ligne_id", ligneId) : r.is("ligne_id", null);
      const { data, error } = await r;
      if (error) throw error;
      const rows = (data ?? []) as Version[];
      const ids = [...new Set(rows.map((x) => x.auteur_id).filter(Boolean))] as string[];
      const noms = new Map<string, string>();
      if (ids.length) {
        const p = await supabase.from("profiles").select("id,full_name,email").in("id", ids);
        for (const x of (p.data ?? []) as { id: string; full_name: string | null; email: string | null }[]) noms.set(x.id, x.full_name || x.email || "Utilisateur");
      }
      return rows.map((x) => ({ ...x, auteur: x.source === "mcp" ? "Claude (MCP)" : x.auteur_id ? noms.get(x.auteur_id) ?? "Utilisateur" : "Système" }));
    },
  });
  const restaurer = async (v: Version) => {
    const { error } = await supabase.rpc("devis_texte_modifier", { _devis_id: devisId, _cible: cible, _ligne_id: (ligneId ?? null) as never, _texte: "", _mode: "remplacer", _restaure_depuis: v.id });
    if (error) return void toast.error("Restauration impossible", { description: error.message });
    toast.success("Version restaurée");
    void q.refetch(); onRestaure?.();
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{cible === "note" ? "Historique de la note" : "Historique du commentaire"}</SheetTitle>
          <SheetDescription>Chaque modification, la plus récente en premier.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          {q.isLoading && <p className="text-sm text-muted-foreground">Chargement…</p>}
          {q.data?.length === 0 && <p className="text-sm text-muted-foreground">Aucune modification enregistrée.</p>}
          {q.data?.map((v) => (
            <div key={v.id} className="space-y-2 rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{v.auteur}</span>
                <span>{new Date(v.cree_le).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}</span>
                {v.restaure_depuis && <span>· restauration</span>}
                {peutRestaurer && <Button size="sm" variant="outline" className="ml-auto h-7" onClick={() => void restaurer(v)}><RotateCcw className="mr-1 h-3 w-3" />Restaurer cette version</Button>}
              </div>
              <details><summary className="cursor-pointer text-xs text-muted-foreground">Avant</summary><p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{v.avant || "(vide)"}</p></details>
              <div><p className="text-xs text-muted-foreground">Après</p><p className="whitespace-pre-wrap break-words">{v.apres || "(vide)"}</p></div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Bandeau « Note / hypothèses » : lecture, cases cochées, édition (brouillon et à valider) et historique. */
export function NoteDevis({ devisId, statut, peutEcrire }: { devisId: string; statut: string; peutEcrire: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["devis-note", devisId],
    queryFn: async () => {
      const { data, error } = await supabase.from("devis").select("id,note_mcp,note_mcp_coches,cree_par_mcp").eq("id", devisId).maybeSingle();
      if (error) throw error;
      return data as { id: string; note_mcp: string | null; note_mcp_coches: string[] | null; cree_par_mcp: boolean } | null;
    },
  });
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<string | null>(null);
  const [hist, setHist] = useState(false);
  const [saving, setSaving] = useState(false);
  const editable = peutEcrire && STATUTS_TEXTE_EDITABLES.includes(statut);
  const note = q.data?.note_mcp ?? null;
  const coches = Array.isArray(q.data?.note_mcp_coches) ? q.data!.note_mcp_coches! : [];
  const points = pointsNote(note);
  const restants = pointsRestants(points, coches);
  const rafraichir = () => { void qc.invalidateQueries({ queryKey: ["devis-note", devisId] }); void qc.invalidateQueries({ queryKey: ["devis-claude"] }); void qc.invalidateQueries({ queryKey: ["devis-textes-historique", devisId] }); };

  const enregistrer = async () => {
    if (edit == null) return;
    setSaving(true);
    const { error } = await supabase.rpc("devis_texte_modifier", { _devis_id: devisId, _cible: "note", _ligne_id: null as never, _texte: edit, _mode: "remplacer" });
    setSaving(false);
    if (error) return void toast.error("Enregistrement impossible", { description: error.message });
    toast.success("Note enregistrée");
    setEdit(null); rafraichir();
  };
  const basculer = async (p: string) => {
    const next = coches.includes(p) ? coches.filter((x) => x !== p) : [...coches, p];
    const { error } = await supabase.rpc("devis_note_mcp_cocher", { _devis_id: devisId, _coches: next });
    if (error) return void toast.error("Enregistrement impossible", { description: error.message });
    rafraichir();
  };
  if (!q.data) return null;
  if (!note && !editable) return null;

  const boutonModifier = editable
    ? <Button size="sm" variant="ghost" className="h-7" onClick={() => { setEdit(note ?? ""); setOpen(true); }}><Pencil className="mr-1 h-3.5 w-3.5" />Modifier</Button>
    : (
      <Tooltip><TooltipTrigger asChild><span><Button size="sm" variant="ghost" className="h-7" disabled><Pencil className="mr-1 h-3.5 w-3.5" />Modifier</Button></span></TooltipTrigger>
        <TooltipContent>{peutEcrire ? "Devis validé ou au-delà : note en lecture seule" : "Droit de rédaction requis"}</TooltipContent></Tooltip>
    );

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 text-sm">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 text-left font-medium text-foreground">
          {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}<Bot className="h-4 w-4 shrink-0" />
          <span className="truncate">Note / hypothèses{note ? ` · ${restants === 0 ? "tous les points sont vus" : `${restants} point${restants > 1 ? "s" : ""} à confirmer`}` : " · vide"}</span>
        </button>
        {boutonModifier}
        <Button size="sm" variant="ghost" className="h-7" onClick={() => setHist(true)}><History className="mr-1 h-3.5 w-3.5" />Historique</Button>
      </div>
      {open && edit == null && note && (
        <div className="space-y-3 border-t border-primary/20 px-3 py-2">
          <MarkdownSimple texte={note} />
          {points.length > 1 && (
            <ul className="space-y-1 border-t border-primary/10 pt-2">
              {points.map((p, i) => {
                const fait = coches.includes(p);
                return (
                  <li key={i}><label className="flex cursor-pointer items-start gap-2">
                    <input type="checkbox" className="mt-0.5" checked={fait} disabled={!peutEcrire} onChange={() => void basculer(p)} />
                    <span className={fait ? "text-muted-foreground line-through" : "text-foreground"}>{p}</span>
                  </label></li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      {edit != null && (
        <div className="space-y-2 border-t border-primary/20 px-3 py-2">
          <Textarea value={edit} onChange={(e) => setEdit(e.target.value)} className="min-h-48 font-mono text-xs" placeholder="Hypothèses et questions. Listes : « - point » ; gras : **texte**." autoFocus
            onKeyDown={(e) => { if (e.key === "Escape") setEdit(null); }} />
          <div className="flex flex-wrap items-center gap-2">
            <span className={edit.length > NOTE_MAX ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{edit.length.toLocaleString("fr-FR")} / 8 000</span>
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => setEdit(null)}>Annuler</Button>
            <Button size="sm" disabled={saving || edit.length > NOTE_MAX || edit === (note ?? "")} onClick={() => void enregistrer()}>Enregistrer</Button>
          </div>
          {edit.trim() && <div className="rounded border bg-background p-2"><p className="mb-1 text-xs text-muted-foreground">Aperçu</p><MarkdownSimple texte={edit} /></div>}
        </div>
      )}
      <HistoriqueTextes devisId={devisId} cible="note" open={hist} onOpenChange={setHist} peutRestaurer={editable} onRestaure={rafraichir} />
    </div>
  );
}

/** Commentaire édité en place : double-clic ou crayon, Maj+Entrée = saut de ligne, Échap = annuler, enregistré à la perte du focus. */
export function CommentaireEnPlace({ texte, peut, enregistrer, historique }: { texte: string | null; peut: boolean; enregistrer: (t: string) => Promise<void>; historique: () => void }) {
  const [v, setV] = useState<string | null>(null);
  const fin = async (save: boolean) => {
    const t = v; setV(null);
    if (save && t != null && t !== (texte ?? "")) await enregistrer(t);
  };
  if (v != null) {
    return (
      <textarea autoFocus value={v} onClick={(e) => e.stopPropagation()} onChange={(e) => setV(e.target.value)} aria-label="Texte du commentaire"
        className="min-h-16 w-full flex-1 rounded border bg-background p-1 text-sm not-italic text-foreground"
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") { e.preventDefault(); void fin(false); } else if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }}
        onBlur={() => void fin(true)} />
    );
  }
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1" onDoubleClick={(e) => { if (peut) { e.stopPropagation(); setV(texte ?? ""); } }}>
      <span className="line-clamp-2 min-w-0 flex-1 break-words" title={texte || "Commentaire"}>{texte || "Commentaire"}</span>
      {peut && <button type="button" aria-label="Modifier le commentaire" className="rounded p-0.5 opacity-60 hover:opacity-100" onClick={(e) => { e.stopPropagation(); setV(texte ?? ""); }}><Pencil className="h-3 w-3" /></button>}
      <button type="button" aria-label="Historique du commentaire" className="rounded p-0.5 opacity-60 hover:opacity-100" onClick={(e) => { e.stopPropagation(); historique(); }}><History className="h-3 w-3" /></button>
    </span>
  );
}
