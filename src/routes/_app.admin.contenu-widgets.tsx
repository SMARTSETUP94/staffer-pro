/**
 * Admin — Contenu éditorial des widgets dashboard.
 * Deux sections (tabs) :
 *  - Astuces du jour (table content_astuces)
 *  - Quiz du jour (table content_quiz)
 *
 * CRUD complet (créer, éditer inline, toggle active, soft delete via active=false).
 * Filtres par catégorie + recherche texte.
 *
 * Garde : RoleGuard required="admin".
 */
import { createFileRoute } from "@tanstack/react-router";
import { requireCapability } from "@/lib/capability-guard";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Pencil, Check, X, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/admin/contenu-widgets")({
  beforeLoad: () => requireCapability("section.admin"),
  component: ContenuWidgetsPage,
});

function ContenuWidgetsPage() {
  return (
      <div className="container mx-auto p-6 space-y-4">
        <header>
          <h1 className="text-2xl font-bold">Contenu widgets dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Gestion éditoriale des widgets « Astuce de la semaine » et « Quiz du jour ».
          </p>
        </header>

        <Tabs defaultValue="astuces" className="space-y-4">
          <TabsList>
            <TabsTrigger value="astuces">Astuces</TabsTrigger>
            <TabsTrigger value="quiz">Quiz</TabsTrigger>
          </TabsList>
          <TabsContent value="astuces"><AstucesAdmin /></TabsContent>
          <TabsContent value="quiz"><QuizAdmin /></TabsContent>
        </Tabs>
      </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// ASTUCES
// ─────────────────────────────────────────────────────────────────

const ASTUCE_CATS = [
  { value: "atelier", label: "Atelier" },
  { value: "process", label: "Process" },
  { value: "securite", label: "Sécurité" },
  { value: "livraison", label: "Livraison" },
  { value: "RH", label: "RH" },
  { value: "montage", label: "Montage" },
  { value: "menuiserie", label: "Menuiserie" },
  { value: "devis", label: "Devis" },
  { value: "logistique", label: "Logistique" },
  { value: "peinture", label: "Peinture" },
  { value: "tapisserie", label: "Tapisserie" },
  { value: "culture", label: "Culture" },
] as const;
type AstuceCat = (typeof ASTUCE_CATS)[number]["value"];

interface Astuce {
  id: string;
  texte: string;
  categorie: string;
  auteur: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

function astuceCatLabel(v: string) {
  return ASTUCE_CATS.find((c) => c.value === v)?.label ?? v;
}

function AstucesAdmin() {
  const [rows, setRows] = useState<Astuce[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [showInactive, setShowInactive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Astuce>>({});
  const [createOpen, setCreateOpen] = useState(false);

  async function reload() {
    setLoading(true);
    const { data, error } = await supabase
      .from("content_astuces")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    else setRows((data ?? []) as Astuce[]);
    setLoading(false);
  }
  useEffect(() => { void reload(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!showInactive && !r.active) return false;
      if (filterCat !== "all" && r.categorie !== filterCat) return false;
      if (q && !`${r.texte} ${r.auteur ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, filterCat, showInactive]);

  const counters = useMemo(() => {
    const byCat: Record<string, number> = {};
    for (const c of ASTUCE_CATS) byCat[c.value] = 0;
    for (const r of rows) if (r.active) byCat[r.categorie] = (byCat[r.categorie] ?? 0) + 1;
    return { total: rows.length, active: rows.filter((r) => r.active).length, byCat };
  }, [rows]);

  function startEdit(r: Astuce) { setEditingId(r.id); setDraft({ ...r }); }
  function cancelEdit() { setEditingId(null); setDraft({}); }

  async function saveEdit() {
    if (!editingId) return;
    const texte = (draft.texte ?? "").trim();
    if (!texte) { toast.error("Texte obligatoire"); return; }
    if (texte.length > 500) { toast.error("Texte trop long (max 500)"); return; }
    const { error } = await supabase.from("content_astuces").update({
      texte,
      categorie: (draft.categorie ?? "process") as AstuceCat,
      auteur: draft.auteur ? String(draft.auteur).trim().slice(0, 80) : null,
    }).eq("id", editingId);
    if (error) { toast.error(error.message); return; }
    toast.success("Astuce mise à jour");
    cancelEdit();
    await reload();
  }

  async function toggleActive(r: Astuce) {
    const { error } = await supabase.from("content_astuces").update({ active: !r.active }).eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    toast.success(r.active ? "Désactivée" : "Réactivée");
    await reload();
  }

  async function softDelete(r: Astuce) {
    if (!confirm(`Désactiver l'astuce « ${r.texte.slice(0, 50)}… » ?`)) return;
    const { error } = await supabase.from("content_astuces").update({ active: false }).eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Astuce désactivée");
    await reload();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {counters.active}/{counters.total} actives
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Nouvelle astuce
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {ASTUCE_CATS.map((c) => (
          <Badge key={c.value} variant="secondary">{c.label} : {counters.byCat[c.value] ?? 0}</Badge>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-center bg-muted/30 p-3 rounded-md">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Recherche texte / auteur…" value={search}
            onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes catégories</SelectItem>
            {ASTUCE_CATS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} />
          Désactivées
        </label>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Texte</TableHead>
              <TableHead className="w-[120px]">Catégorie</TableHead>
              <TableHead className="w-[140px]">Auteur</TableHead>
              <TableHead className="w-[110px]">Créé le</TableHead>
              <TableHead className="w-20">Actif</TableHead>
              <TableHead className="w-[110px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Chargement…</TableCell></TableRow>}
            {!loading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Aucune astuce.</TableCell></TableRow>
            )}
            {filtered.map((r) => {
              const isEdit = editingId === r.id;
              return (
                <TableRow key={r.id} className={!r.active ? "opacity-50" : undefined}>
                  <TableCell>
                    {isEdit ? (
                      <Textarea value={draft.texte ?? ""} onChange={(e) => setDraft((d) => ({ ...d, texte: e.target.value }))} rows={2} maxLength={500} />
                    ) : (
                      <span className="text-sm">{r.texte.length > 80 ? r.texte.slice(0, 80) + "…" : r.texte}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {isEdit ? (
                      <Select value={(draft.categorie as string) ?? "process"} onValueChange={(v) => setDraft((d) => ({ ...d, categorie: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ASTUCE_CATS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline">{astuceCatLabel(r.categorie)}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {isEdit ? (
                      <Input value={(draft.auteur as string) ?? ""} onChange={(e) => setDraft((d) => ({ ...d, auteur: e.target.value }))} maxLength={80} />
                    ) : (
                      <span className="text-sm text-muted-foreground">{r.auteur ?? "—"}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString("fr-FR")}
                  </TableCell>
                  <TableCell>
                    <Switch checked={r.active} onCheckedChange={() => toggleActive(r)} disabled={isEdit} />
                  </TableCell>
                  <TableCell className="text-right">
                    {isEdit ? (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={cancelEdit}><X className="h-4 w-4" /></Button>
                        <Button size="sm" onClick={saveEdit}><Check className="h-4 w-4" /></Button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => startEdit(r)}><Pencil className="h-4 w-4" /></Button>
                        {r.active ? (
                          <Button size="sm" variant="ghost" onClick={() => softDelete(r)}><Trash2 className="h-4 w-4" /></Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => toggleActive(r)}><RotateCcw className="h-4 w-4" /></Button>
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

      <CreateAstuceDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={reload} />
    </div>
  );
}

function CreateAstuceDialog({ open, onOpenChange, onCreated }: {
  open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => Promise<void> | void;
}) {
  const [texte, setTexte] = useState("");
  const [categorie, setCategorie] = useState<AstuceCat>("process");
  const [auteur, setAuteur] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) { setTexte(""); setCategorie("process"); setAuteur(""); }
  }, [open]);

  async function submit() {
    const t = texte.trim();
    if (!t) { toast.error("Texte obligatoire"); return; }
    if (t.length > 500) { toast.error("Texte trop long (max 500)"); return; }
    setSaving(true);
    const { error } = await supabase.from("content_astuces").insert({
      texte: t, categorie, auteur: auteur.trim() ? auteur.trim().slice(0, 80) : null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Astuce créée");
    onOpenChange(false);
    await onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle astuce</DialogTitle>
          <DialogDescription>Apparaîtra dans le widget « Astuce de la semaine ».</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Texte</Label>
            <Textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={4} maxLength={500} />
            <div className="text-xs text-muted-foreground text-right mt-1">{texte.length}/500</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Catégorie</Label>
              <Select value={categorie} onValueChange={(v) => setCategorie(v as AstuceCat)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASTUCE_CATS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Auteur (optionnel)</Label>
              <Input value={auteur} onChange={(e) => setAuteur(e.target.value)} maxLength={80} />
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

// ─────────────────────────────────────────────────────────────────
// QUIZ
// ─────────────────────────────────────────────────────────────────

const QUIZ_CATS = [
  { value: "securite", label: "Sécurité", color: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30" },
  { value: "menuiserie", label: "Menuiserie", color: "bg-amber-700/15 text-amber-800 dark:text-amber-400 border-amber-700/30" },
  { value: "sceno", label: "Scéno", color: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30" },
  { value: "event", label: "Event", color: "bg-pink-500/15 text-pink-700 dark:text-pink-400 border-pink-500/30" },
  { value: "culture-G", label: "Culture générale", color: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30" },
  { value: "decor-culture-g", label: "Décor (difficile)", color: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-500/30" },
  { value: "setup-histoire", label: "Histoire SETUP", color: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30" },
  { value: "setup-orga", label: "Organisation SETUP", color: "bg-teal-500/15 text-teal-700 dark:text-teal-400 border-teal-500/30" },
  { value: "setup-clients", label: "Clients SETUP", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
  { value: "setup-outils", label: "Outils internes", color: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-500/30" },
  { value: "setup-machines", label: "Parc machines", color: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30" },
] as const;
type QuizCat = (typeof QUIZ_CATS)[number]["value"];
const DIFFS = ["facile", "moyen", "difficile"] as const;
type Diff = (typeof DIFFS)[number];

interface Quiz {
  id: string;
  question: string;
  reponses: string[];
  bonne_reponse_index: number;
  explication: string | null;
  categorie: string;
  difficulte: string;
  active: boolean;
  created_at: string;
}

function quizCatLabel(v: string) {
  return QUIZ_CATS.find((c) => c.value === v)?.label ?? v;
}
function quizCatColor(v: string) {
  return QUIZ_CATS.find((c) => c.value === v)?.color ?? "";
}

function QuizAdmin() {
  const [rows, setRows] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [filterDiff, setFilterDiff] = useState("all");
  const [showInactive, setShowInactive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Quiz>>({});
  const [createOpen, setCreateOpen] = useState(false);

  async function reload() {
    setLoading(true);
    const { data, error } = await supabase
      .from("content_quiz")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    else {
      setRows((data ?? []).map((r: { reponses: unknown } & Record<string, unknown>) => ({
        ...r,
        reponses: Array.isArray(r.reponses) ? (r.reponses as string[]) : [],
      })) as Quiz[]);
    }
    setLoading(false);
  }
  useEffect(() => { void reload(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!showInactive && !r.active) return false;
      if (filterCat !== "all" && r.categorie !== filterCat) return false;
      if (filterDiff !== "all" && r.difficulte !== filterDiff) return false;
      if (q && !`${r.question} ${(r.explication ?? "")}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, filterCat, filterDiff, showInactive]);

  const counters = useMemo(() => {
    const byCat: Record<string, number> = {};
    for (const c of QUIZ_CATS) byCat[c.value] = 0;
    for (const r of rows) if (r.active) byCat[r.categorie] = (byCat[r.categorie] ?? 0) + 1;
    return { total: rows.length, active: rows.filter((r) => r.active).length, byCat };
  }, [rows]);

  function startEdit(r: Quiz) { setEditingId(r.id); setDraft({ ...r, reponses: [...r.reponses] }); }
  function cancelEdit() { setEditingId(null); setDraft({}); }

  async function saveEdit() {
    if (!editingId) return;
    const question = (draft.question ?? "").trim();
    if (!question) { toast.error("Question obligatoire"); return; }
    const reponses = (draft.reponses ?? []).map((x) => String(x ?? "").trim());
    if (reponses.length !== 4 || reponses.some((x) => !x)) { toast.error("Les 4 réponses sont obligatoires"); return; }
    const idx = Number(draft.bonne_reponse_index ?? 0);
    if (idx < 0 || idx > 3) { toast.error("Bonne réponse invalide"); return; }
    const { error } = await supabase.from("content_quiz").update({
      question,
      reponses,
      bonne_reponse_index: idx,
      explication: draft.explication ? String(draft.explication).trim() : null,
      categorie: (draft.categorie ?? "culture-G") as QuizCat,
      difficulte: (draft.difficulte ?? "moyen") as Diff,
    }).eq("id", editingId);
    if (error) { toast.error(error.message); return; }
    toast.success("Quiz mis à jour");
    cancelEdit();
    await reload();
  }

  async function toggleActive(r: Quiz) {
    const { error } = await supabase.from("content_quiz").update({ active: !r.active }).eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    toast.success(r.active ? "Désactivé" : "Réactivé");
    await reload();
  }

  async function softDelete(r: Quiz) {
    if (!confirm(`Désactiver le quiz « ${r.question.slice(0, 50)}… » ?`)) return;
    const { error } = await supabase.from("content_quiz").update({ active: false }).eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Quiz désactivé");
    await reload();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {counters.active}/{counters.total} actifs
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Nouveau quiz
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {QUIZ_CATS.map((c) => (
          <Badge key={c.value} variant="outline" className={c.color}>{c.label} : {counters.byCat[c.value] ?? 0}</Badge>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-center bg-muted/30 p-3 rounded-md">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Recherche question / explication…" value={search}
            onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes catégories</SelectItem>
            {QUIZ_CATS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterDiff} onValueChange={setFilterDiff}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes difficultés</SelectItem>
            {DIFFS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} />
          Désactivés
        </label>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Question</TableHead>
              <TableHead className="w-[120px]">Catégorie</TableHead>
              <TableHead className="w-[100px]">Difficulté</TableHead>
              <TableHead className="w-[110px]">Créé le</TableHead>
              <TableHead className="w-20">Actif</TableHead>
              <TableHead className="w-[110px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Chargement…</TableCell></TableRow>}
            {!loading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Aucun quiz.</TableCell></TableRow>
            )}
            {filtered.map((r) => {
              const isEdit = editingId === r.id;
              return (
                <TableRow key={r.id} className={!r.active ? "opacity-50" : undefined}>
                  <TableCell>
                    {isEdit ? (
                      <div className="space-y-2">
                        <Textarea value={draft.question ?? ""} onChange={(e) => setDraft((d) => ({ ...d, question: e.target.value }))} rows={2} />
                        <RadioGroup
                          value={String(draft.bonne_reponse_index ?? 0)}
                          onValueChange={(v) => setDraft((d) => ({ ...d, bonne_reponse_index: Number(v) }))}
                          className="space-y-1"
                        >
                          {[0, 1, 2, 3].map((i) => (
                            <div key={i} className="flex items-center gap-2">
                              <RadioGroupItem value={String(i)} id={`r-${r.id}-${i}`} />
                              <span className="text-xs font-mono w-4">{String.fromCharCode(65 + i)}</span>
                              <Input
                                value={(draft.reponses ?? [])[i] ?? ""}
                                onChange={(e) => setDraft((d) => {
                                  const reps = [...((d.reponses as string[]) ?? ["", "", "", ""])];
                                  reps[i] = e.target.value;
                                  return { ...d, reponses: reps };
                                })}
                                className="text-xs"
                              />
                            </div>
                          ))}
                        </RadioGroup>
                        <Textarea
                          placeholder="Explication (optionnel)"
                          value={(draft.explication as string) ?? ""}
                          onChange={(e) => setDraft((d) => ({ ...d, explication: e.target.value }))}
                          rows={2}
                          className="text-xs"
                        />
                      </div>
                    ) : (
                      <div className="text-sm">
                        <div>{r.question.length > 60 ? r.question.slice(0, 60) + "…" : r.question}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          ✓ {r.reponses[r.bonne_reponse_index]}
                        </div>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {isEdit ? (
                      <Select value={(draft.categorie as string) ?? "culture-G"} onValueChange={(v) => setDraft((d) => ({ ...d, categorie: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {QUIZ_CATS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline" className={quizCatColor(r.categorie)}>{quizCatLabel(r.categorie)}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {isEdit ? (
                      <Select value={(draft.difficulte as string) ?? "moyen"} onValueChange={(v) => setDraft((d) => ({ ...d, difficulte: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {DIFFS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline">{r.difficulte}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString("fr-FR")}
                  </TableCell>
                  <TableCell>
                    <Switch checked={r.active} onCheckedChange={() => toggleActive(r)} disabled={isEdit} />
                  </TableCell>
                  <TableCell className="text-right">
                    {isEdit ? (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={cancelEdit}><X className="h-4 w-4" /></Button>
                        <Button size="sm" onClick={saveEdit}><Check className="h-4 w-4" /></Button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => startEdit(r)}><Pencil className="h-4 w-4" /></Button>
                        {r.active ? (
                          <Button size="sm" variant="ghost" onClick={() => softDelete(r)}><Trash2 className="h-4 w-4" /></Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => toggleActive(r)}><RotateCcw className="h-4 w-4" /></Button>
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

      <CreateQuizDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={reload} />
    </div>
  );
}

function CreateQuizDialog({ open, onOpenChange, onCreated }: {
  open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => Promise<void> | void;
}) {
  const [question, setQuestion] = useState("");
  const [reponses, setReponses] = useState<string[]>(["", "", "", ""]);
  const [bonne, setBonne] = useState(0);
  const [explication, setExplication] = useState("");
  const [categorie, setCategorie] = useState<QuizCat>("culture-G");
  const [difficulte, setDifficulte] = useState<Diff>("moyen");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuestion(""); setReponses(["", "", "", ""]); setBonne(0);
      setExplication(""); setCategorie("culture-G"); setDifficulte("moyen");
    }
  }, [open]);

  async function submit() {
    const q = question.trim();
    if (!q) { toast.error("Question obligatoire"); return; }
    const reps = reponses.map((x) => x.trim());
    if (reps.some((x) => !x)) { toast.error("Les 4 réponses sont obligatoires"); return; }
    setSaving(true);
    const { error } = await supabase.from("content_quiz").insert({
      question: q,
      reponses: reps,
      bonne_reponse_index: bonne,
      explication: explication.trim() || null,
      categorie,
      difficulte,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Quiz créé");
    onOpenChange(false);
    await onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouveau quiz</DialogTitle>
          <DialogDescription>Apparaîtra dans le widget « Quiz du jour ».</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Question</Label>
            <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} />
          </div>
          <div>
            <Label className="text-xs">Réponses (cocher la bonne)</Label>
            <RadioGroup value={String(bonne)} onValueChange={(v) => setBonne(Number(v))} className="space-y-2 mt-1">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-2">
                  <RadioGroupItem value={String(i)} id={`new-r-${i}`} />
                  <span className="text-xs font-mono w-4">{String.fromCharCode(65 + i)}</span>
                  <Input
                    value={reponses[i]}
                    onChange={(e) => setReponses((rs) => { const c = [...rs]; c[i] = e.target.value; return c; })}
                    placeholder={`Réponse ${String.fromCharCode(65 + i)}`}
                  />
                </div>
              ))}
            </RadioGroup>
          </div>
          <div>
            <Label className="text-xs">Explication (optionnel)</Label>
            <Textarea value={explication} onChange={(e) => setExplication(e.target.value)} rows={2}
              placeholder="Pourquoi cette réponse est correcte…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Catégorie</Label>
              <Select value={categorie} onValueChange={(v) => setCategorie(v as QuizCat)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {QUIZ_CATS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Difficulté</Label>
              <Select value={difficulte} onValueChange={(v) => setDifficulte(v as Diff)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DIFFS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
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
