import { useState } from "react";
import { ChevronDown, ChevronRight, GripVertical, MessageSquare, MoreHorizontal, Lock } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { TYPE_LABEL, eur, type Ligne } from "./api";

export interface ArbreActions {
  select: (id: string) => void;
  move: (id: string, parentId: string | null, ordre: number) => void;
  rename: (l: Ligne) => void;
  duplicate: (id: string) => void;
  remove: (l: Ligne) => void;
}

const CONTENEURS = new Set(["zone", "option", "chapitre_suivi", "chapitre_pose", "chapitre_depose", "objet"]);

export function DevisArbre({ lignes, montants, racines, selected, readOnly, actions }: {
  lignes: Ligne[]; montants: Record<string, number>; racines: Record<string, number>;
  selected: string | null; readOnly: boolean; actions: ArbreActions;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; pos: "before" | "inside" } | null>(null);
  const children = (p: string | null) => lignes.filter((l) => l.parent_id === p).sort((a, b) => a.ordre - b.ordre);
  const zones = lignes.filter((l) => l.type === "zone" || l.type === "option" || l.type.startsWith("chapitre"));

  const isDescendant = (id: string, maybeChild: string): boolean => {
    let cur = lignes.find((l) => l.id === maybeChild);
    while (cur?.parent_id) { if (cur.parent_id === id) return true; cur = lignes.find((l) => l.id === cur!.parent_id); }
    return false;
  };

  const drop = (target: Ligne, pos: "before" | "inside") => {
    if (!drag || drag === target.id || isDescendant(drag, target.id)) return;
    if (pos === "inside") {
      const last = children(target.id).at(-1);
      actions.move(drag, target.id, (last?.ordre ?? 0) + 1);
    } else {
      const sib = children(target.parent_id);
      const idx = sib.findIndex((s) => s.id === target.id);
      const prev = sib[idx - 1];
      actions.move(drag, target.parent_id, prev ? (prev.ordre + target.ordre) / 2 : target.ordre - 1);
    }
  };

  const step = (l: Ligne, dir: -1 | 1) => {
    const sib = children(l.parent_id);
    const i = sib.findIndex((s) => s.id === l.id);
    const j = i + dir;
    if (j < 0 || j >= sib.length) return;
    const n = sib[j + dir];
    const ordre = dir === -1 ? (n ? (n.ordre + sib[j].ordre) / 2 : sib[j].ordre - 1) : (n ? (n.ordre + sib[j].ordre) / 2 : sib[j].ordre + 1);
    actions.move(l.id, l.parent_id, ordre);
  };

  const render = (l: Ligne, depth: number) => {
    const kids = children(l.id).filter((k) => k.type !== "commentaire" || true);
    const isContainer = CONTENEURS.has(l.type);
    const open = !collapsed.has(l.id);
    const montant = depth === 0 ? racines[l.id] : montants[l.id];
    return (
      <div key={l.id}>
        <div
          draggable={!readOnly}
          onDragStart={(e) => { setDrag(l.id); e.dataTransfer.effectAllowed = "move"; }}
          onDragEnd={() => { setDrag(null); setOver(null); }}
          onDragOver={(e) => {
            if (!drag) return;
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            const inside = isContainer && e.clientY > r.top + r.height * 0.35;
            setOver({ id: l.id, pos: inside ? "inside" : "before" });
          }}
          onDrop={(e) => { e.preventDefault(); if (over) drop(l, over.pos); setOver(null); setDrag(null); }}
          onClick={() => actions.select(l.id)}
          className={cn(
            "group flex cursor-pointer items-center gap-1 rounded px-1 py-1 text-sm",
            selected === l.id ? "bg-primary/10 font-medium" : "hover:bg-muted",
            over?.id === l.id && over.pos === "before" && "border-t-2 border-primary",
            over?.id === l.id && over.pos === "inside" && "ring-1 ring-primary",
          )}
          style={{ paddingLeft: depth * 14 + 4 }}
        >
          {!readOnly && <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />}
          {kids.length > 0 ? (
            <button type="button" onClick={(e) => { e.stopPropagation(); const s = new Set(collapsed); open ? s.add(l.id) : s.delete(l.id); setCollapsed(s); }}>
              {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          ) : <span className="w-3.5" />}
          {l.type === "commentaire" ? (
            <span className="flex min-w-0 flex-1 items-center gap-1 italic text-muted-foreground">
              <MessageSquare className="h-3.5 w-3.5 shrink-0" />{l.interne && <Lock className="h-3 w-3 shrink-0" />}
              <span className="truncate">{l.texte || "Commentaire"}</span>
            </span>
          ) : (
            <span className="min-w-0 flex-1 truncate">
              {depth === 0 && <span className="mr-1 text-xs uppercase text-muted-foreground">{TYPE_LABEL[l.type]}</span>}
              {l.libelle || "(sans titre)"}{l.type === "objet" && Number(l.quantite) !== 1 && <span className="text-muted-foreground"> ×{Number(l.quantite)}</span>}
            </span>
          )}
          {montant ? <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{eur(montant)}</span> : null}
          {!readOnly && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <button type="button" aria-label="Actions" className="rounded p-0.5 opacity-60 hover:bg-muted hover:opacity-100"><MoreHorizontal className="h-4 w-4" /></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onClick={() => step(l, -1)}>Monter</DropdownMenuItem>
                <DropdownMenuItem onClick={() => step(l, 1)}>Descendre</DropdownMenuItem>
                {l.type !== "zone" && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Déplacer vers…</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem onClick={() => actions.move(l.id, null, 999)}>Racine du devis</DropdownMenuItem>
                      {zones.filter((z) => z.id !== l.id && !isDescendant(l.id, z.id)).map((z) => (
                        <DropdownMenuItem key={z.id} onClick={() => actions.move(l.id, z.id, (children(z.id).at(-1)?.ordre ?? 0) + 1)}>
                          {TYPE_LABEL[z.type]} · {z.libelle || "(sans titre)"}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                <DropdownMenuItem onClick={() => actions.rename(l)}>Renommer</DropdownMenuItem>
                <DropdownMenuItem onClick={() => actions.duplicate(l.id)}>Dupliquer</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={() => actions.remove(l)}>Supprimer</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {open && kids.map((k) => render(k, depth + 1))}
      </div>
    );
  };

  const roots = children(null);
  const ordreRacine = (l: Ligne) => (l.type.startsWith("chapitre") ? 1 : l.type === "option" ? 2 : 0);
  return <div className="space-y-0.5">{[...roots].sort((a, b) => ordreRacine(a) - ordreRacine(b) || a.ordre - b.ordre).map((l) => render(l, 0))}</div>;
}
