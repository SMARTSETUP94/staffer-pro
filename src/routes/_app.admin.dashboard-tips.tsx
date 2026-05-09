/**
 * v0.40.x — Admin : gestion du contenu du widget "Astuce de la semaine".
 *
 * Fonctionnalités :
 * - Liste paginée des astuces (active + désactivées)
 * - Filtre par catégorie + recherche texte
 * - Création via modal (textarea + select catégorie + input auteur + emoji)
 * - Édition inline (texte, emoji, catégorie, auteur, ordre)
 * - Toggle active (Switch)
 * - Soft delete (active=false) + bouton restaurer
 *
 * Garde : RoleGuard required="admin".
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Pencil, Check, X, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/admin/dashboard-tips")({
  component: DashboardTipsAdminPage,
});

const CATEGORIES = [
  { value: "app", label: "App" },
  { value: "planning", label: "Planning" },
  { value: "fabrication", label: "Fabrication" },
  { value: "equipe", label: "Équipe" },
  { value: "divers", label: "Divers" },
] as const;

type Categorie = (typeof CATEGORIES)[number]["value"];

interface Tip {
  id: string;
  texte: string;
  emoji: string;
  categorie: string;
  auteur: string | null;
  active: boolean;
  ordre: number;
  created_at: string;
  updated_at: string;
}

function categoryLabel(value: string): string {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

function DashboardTipsAdminPage() {
  return (
    <RoleGuard required="admin">
      <DashboardTipsAdmin />
    </RoleGuard>
  );
}

function DashboardTipsAdmin() {
  const [tips, setTips] = useState<Tip[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Tip>>({});
  const [createOpen, setCreateOpen] = useState(false);

  async function reload() {
    setLoading(true);
    const { data, error } = await supabase
      .from("dashboard_tips")
      .select("*")
      .order("ordre", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      toast.error(error.message);
    } else {
      setTips((data ?? []) as Tip[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    void reload();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tips.filter((t) => {
      if (!showInactive && !t.active) return false;
      if (filterCat !== "all" && t.categorie !== filterCat) return false;
      if (q) {
        const hay = `${t.texte} ${t.auteur ?? ""} ${t.emoji}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tips, search, filterCat, showInactive]);

  const counters = useMemo(() => {
    const total = tips.length;
    const active = tips.filter((t) => t.active).length;
    const byCat: Record<string, number> = {};
    for (const c of CATEGORIES) byCat[c.value] = 0;
    for (const t of tips) {
      if (t.active) byCat[t.categorie] = (byCat[t.categorie] ?? 0) + 1;
    }
    return { total, active, byCat };
  }, [tips]);

  function startEdit(t: Tip) {
    setEditingId(t.id);
    setDraft({ ...t });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft({});
  }

  async function saveEdit() {
    if (!editingId) return;
    const texte = (draft.texte ?? "").trim();
    if (!texte) {
      toast.error("Le texte est obligatoire");
      return;
    }
    if (texte.length > 500) {
      toast.error("Texte trop long (max 500 caractères)");
      return;
    }
    const { error } = await supabase
      .from("dashboard_tips")
      .update({
        texte,
        emoji: (draft.emoji ?? "💡").trim().slice(0, 8) || "💡",
        categorie: (draft.categorie ?? "divers") as Categorie,
        auteur: draft.auteur ? String(draft.auteur).trim().slice(0, 80) : null,
        ordre: Number(draft.ordre ?? 0),
      })
      .eq("id", editingId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Astuce mise à jour");
    cancelEdit();
    await reload();
  }

  async function toggleActive(t: Tip) {
    const { error } = await supabase
      .from("dashboard_tips")
      .update({ active: !t.active })
      .eq("id", t.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t.active ? "Astuce désactivée" : "Astuce réactivée");
    await reload();
  }

  async function softDelete(t: Tip) {
    if (!confirm(`Désactiver l'astuce « ${t.texte.slice(0, 50)}… » ?\n(Suppression douce : active=false)`)) return;
    const { error } = await supabase
      .from("dashboard_tips")
      .update({ active: false })
      .eq("id", t.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Astuce désactivée (soft delete)");
    await reload();
  }

  return (
    <div className="container mx-auto p-6 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Astuces dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Gestion du contenu du widget « Astuce de la semaine » — {counters.active}/{counters.total} actives
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Nouvelle astuce
        </Button>
      </header>

      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <Badge key={c.value} variant="secondary">
            {c.label} : {counters.byCat[c.value] ?? 0}
          </Badge>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-center bg-muted/30 p-3 rounded-md">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Recherche texte / auteur…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes catégories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} />
          Afficher désactivées
        </label>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Emoji</TableHead>
              <TableHead>Texte</TableHead>
              <TableHead className="w-[120px]">Catégorie</TableHead>
              <TableHead className="w-[140px]">Auteur</TableHead>
              <TableHead className="w-20">Ordre</TableHead>
              <TableHead className="w-20">Actif</TableHead>
              <TableHead className="w-[140px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Chargement…</TableCell></TableRow>
            )}
            {!loading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Aucune astuce ne correspond aux filtres.</TableCell></TableRow>
            )}
            {filtered.map((t) => {
              const isEdit = editingId === t.id;
              return (
                <TableRow key={t.id} className={!t.active ? "opacity-50" : undefined}>
                  <TableCell>
                    {isEdit ? (
                      <Input value={draft.emoji ?? ""} onChange={(e) => setDraft((d) => ({ ...d, emoji: e.target.value }))} className="w-14" maxLength={8} />
                    ) : (
                      <span className="text-lg">{t.emoji}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {isEdit ? (
                      <Textarea
                        value={draft.texte ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...d, texte: e.target.value }))}
                        rows={2}
                        maxLength={500}
                      />
                    ) : (
                      <span className="text-sm">{t.texte}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {isEdit ? (
                      <Select value={(draft.categorie as string) ?? "divers"} onValueChange={(v) => setDraft((d) => ({ ...d, categorie: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline">{categoryLabel(t.categorie)}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {isEdit ? (
                      <Input value={(draft.auteur as string) ?? ""} onChange={(e) => setDraft((d) => ({ ...d, auteur: e.target.value }))} maxLength={80} />
                    ) : (
                      <span className="text-sm text-muted-foreground">{t.auteur ?? "—"}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {isEdit ? (
                      <Input type="number" value={draft.ordre ?? 0} onChange={(e) => setDraft((d) => ({ ...d, ordre: Number(e.target.value) }))} className="w-16" />
                    ) : (
                      <span className="text-sm text-muted-foreground">{t.ordre}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch checked={t.active} onCheckedChange={() => toggleActive(t)} disabled={isEdit} />
                  </TableCell>
                  <TableCell className="text-right">
                    {isEdit ? (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={cancelEdit}><X className="h-4 w-4" /></Button>
                        <Button size="sm" onClick={saveEdit}><Check className="h-4 w-4" /></Button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => startEdit(t)} title="Éditer">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {t.active ? (
                          <Button size="sm" variant="ghost" onClick={() => softDelete(t)} title="Désactiver (soft)">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => toggleActive(t)} title="Restaurer">
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <CreateTipDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={reload}
        nextOrdre={(tips.reduce((m, t) => Math.max(m, t.ordre), 0) || 0) + 1}
      />
    </div>
  );
}

function CreateTipDialog({
  open,
  onOpenChange,
  onCreated,
  nextOrdre,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => Promise<void> | void;
  nextOrdre: number;
}) {
  const [texte, setTexte] = useState("");
  const [emoji, setEmoji] = useState("💡");
  const [categorie, setCategorie] = useState<Categorie>("divers");
  const [auteur, setAuteur] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setTexte(""); setEmoji("💡"); setCategorie("divers"); setAuteur("");
    }
  }, [open]);

  async function submit() {
    const t = texte.trim();
    if (!t) { toast.error("Le texte est obligatoire"); return; }
    if (t.length > 500) { toast.error("Texte trop long (max 500 caractères)"); return; }
    setSaving(true);
    const { error } = await supabase.from("dashboard_tips").insert({
      texte: t,
      emoji: emoji.trim().slice(0, 8) || "💡",
      categorie,
      auteur: auteur.trim() ? auteur.trim().slice(0, 80) : null,
      ordre: nextOrdre,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Astuce créée");
    onOpenChange(false);
    await onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle astuce</DialogTitle>
          <DialogDescription>
            Rédige une astuce qui aidera l'équipe au quotidien. Elle apparaîtra dans le widget « Astuce de la semaine » du dashboard.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-[80px_1fr] gap-2 items-start">
            <div>
              <Label className="text-xs">Emoji</Label>
              <Input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={8} />
            </div>
            <div>
              <Label className="text-xs">Texte de l'astuce</Label>
              <Textarea
                value={texte}
                onChange={(e) => setTexte(e.target.value)}
                rows={4}
                maxLength={500}
                placeholder="Exemple : Cmd+K ouvre la recherche universelle."
              />
              <div className="text-xs text-muted-foreground text-right mt-1">{texte.length}/500</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Catégorie</Label>
              <Select value={categorie} onValueChange={(v) => setCategorie(v as Categorie)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Auteur (optionnel)</Label>
              <Input value={auteur} onChange={(e) => setAuteur(e.target.value)} maxLength={80} placeholder="Gabin, Luc…" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Annuler</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Création…" : "Créer"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
