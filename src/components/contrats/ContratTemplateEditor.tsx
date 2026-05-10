import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import {
  Bold, Italic, Underline as UnderlineIcon,
  Heading1, Heading2, Heading3, Pilcrow,
  List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Table as TableIcon, FileSliders,
  Save, CheckCircle2, RotateCcw, Loader2, Variable, Copy,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuLabel, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  activateContratTemplate,
  PLACEHOLDER_GROUPS,
  createContratTemplateVersion,
  DEFAULT_CONTRAT_TEMPLATE_HTML,
  EXAMPLE_CONTRAT_TEMPLATE_VALUES,
  interpolateContratTemplate,
  listContratTemplates,
  type ContratTemplate,
  type PlaceholderKey,
} from "@/lib/contrats-templates";
import { ContratPlaceholderNode } from "./ContratPlaceholderNode";

interface Props {
  onChanged?: () => void;
}

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function ContratTemplateEditor({ onChanged }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nom, setNom] = useState("Template contrat intermittent");
  const [notes, setNotes] = useState("");
  const [html, setHtml] = useState(DEFAULT_CONTRAT_TEMPLATE_HTML);
  const [saving, setSaving] = useState<"draft" | "active" | "activate" | null>(null);
  const [previewInterpolated, setPreviewInterpolated] = useState(true);

  const { data: templates = [], isLoading, refetch } = useQuery({
    queryKey: ["contrat-templates"],
    queryFn: listContratTemplates,
  });

  const activeTemplate = useMemo(() => templates.find((t) => t.actif) ?? templates[0], [templates]);
  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? activeTemplate,
    [activeTemplate, selectedId, templates],
  );

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      ContratPlaceholderNode,
    ],
    content: DEFAULT_CONTRAT_TEMPLATE_HTML,
    immediatelyRender: false,
    onUpdate: ({ editor }) => setHtml(editor.getHTML()),
    editorProps: {
      attributes: {
        class: "tiptap-template-editor min-h-[460px] focus:outline-none prose prose-sm max-w-none text-foreground",
      },
    },
  });

  useEffect(() => {
    if (!selectedTemplate || !editor) return;
    setNom(selectedTemplate.nom);
    setNotes("");
    const nextHtml = selectedTemplate.contenu_html || DEFAULT_CONTRAT_TEMPLATE_HTML;
    setHtml(nextHtml);
    if (selectedTemplate.contenu_json) {
      try {
        editor.commands.setContent(selectedTemplate.contenu_json as never, { emitUpdate: false });
        return;
      } catch {
        // fallback HTML
      }
    }
    editor.commands.setContent(nextHtml, { emitUpdate: false });
  }, [editor, selectedTemplate]);

  const debouncedHtml = useDebounced(html, 300);
  const previewHtml = useMemo(
    () => previewInterpolated ? interpolateContratTemplate(debouncedHtml, EXAMPLE_CONTRAT_TEMPLATE_VALUES) : debouncedHtml,
    [debouncedHtml, previewInterpolated],
  );

  const refresh = async () => { await refetch(); onChanged?.(); };

  const insertPlaceholder = (key: PlaceholderKey) => {
    if (!editor) return;
    editor.chain().focus().insertContent({
      type: "contratPlaceholder",
      attrs: { key },
    }).run();
  };

  const save = async (activate: boolean) => {
    if (!editor) return;
    const contenuHtml = editor.getHTML();
    const contenuJson = editor.getJSON();
    if (!nom.trim()) { toast.error("Nom du template obligatoire"); return; }
    if (!contenuHtml || contenuHtml === "<p></p>") { toast.error("Contenu du template obligatoire"); return; }
    setSaving(activate ? "active" : "draft");
    try {
      const newId = await createContratTemplateVersion({
        nom: nom.trim(),
        contenuHtml,
        contenuJson,
        notes: notes.trim() || null,
        actif: activate,
      });
      setSelectedId(newId);
      toast.success(activate ? "Version sauvegardée et activée" : "Brouillon sauvegardé");
      await refresh();
    } catch (error) {
      console.error("TEMPLATE SAVE ERROR", error);
      toast.error(error instanceof Error ? error.message : "Erreur sauvegarde template");
    } finally {
      setSaving(null);
    }
  };

  const activateExisting = async (template: ContratTemplate) => {
    setSaving("activate");
    try {
      await activateContratTemplate(template.id);
      toast.success(`Version v${template.version_int} activée`);
      await refresh();
    } catch (error) {
      console.error("TEMPLATE ACTIVATE ERROR", error);
      toast.error(error instanceof Error ? error.message : "Activation impossible");
    } finally {
      setSaving(null);
    }
  };

  const restoreFromVersion = (template: ContratTemplate) => {
    if (!editor) return;
    if (template.contenu_json) {
      try { editor.commands.setContent(template.contenu_json as never, { emitUpdate: true }); }
      catch { editor.commands.setContent(template.contenu_html, { emitUpdate: true }); }
    } else {
      editor.commands.setContent(template.contenu_html, { emitUpdate: true });
    }
    setSelectedId(null);
    setNom(`${template.nom} (copie de v${template.version_int})`);
    setNotes(`Restauration depuis v${template.version_int}`);
    toast.success(`Contenu de v${template.version_int} chargé en brouillon`);
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
      {/* Sidebar versions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Versions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <ScrollArea className="h-[640px] pr-2">
            <div className="space-y-2">
              {templates.map((template) => {
                const isSelected = selectedTemplate?.id === template.id;
                return (
                  <div
                    key={template.id}
                    className={`rounded-md border p-3 text-sm transition-colors ${
                      isSelected ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/50"
                    }`}
                  >
                    <button type="button" onClick={() => setSelectedId(template.id)} className="w-full text-left">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">v{template.version_int}</span>
                        {template.actif && <Badge>Actif</Badge>}
                      </div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">{template.nom}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {new Date(template.created_at).toLocaleDateString("fr-FR")}
                      </div>
                      {template.notes && (
                        <div className="mt-1 line-clamp-2 text-[11px] italic text-muted-foreground">{template.notes}</div>
                      )}
                    </button>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Button
                        type="button" variant="ghost" size="sm" className="h-7 text-xs"
                        onClick={() => restoreFromVersion(template)}
                        title="Charger ce contenu dans un nouveau brouillon"
                      >
                        <Copy className="h-3 w-3 mr-1" />Restaurer
                      </Button>
                      {!template.actif && (
                        <Button
                          type="button" variant="outline" size="sm" className="h-7 text-xs"
                          disabled={saving !== null}
                          onClick={() => activateExisting(template)}
                        >
                          Activer
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
              {templates.length === 0 && <div className="text-sm text-muted-foreground">Aucune version.</div>}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Editor + Preview */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Éditeur</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
              <div className="space-y-1">
                <Label htmlFor="tpl-nom" className="text-xs">Nom de la version</Label>
                <Input id="tpl-nom" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom de la version" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tpl-notes" className="text-xs">Note de version (changelog)</Label>
                <Input id="tpl-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ex: Ajout clause confidentialité" />
              </div>
            </div>

            <Toolbar editor={editor} onInsertPlaceholder={insertPlaceholder} />

            <div className="rounded-md border bg-background">
              <ScrollArea className="h-[480px]">
                <div className="p-4">
                  <EditorContent editor={editor} />
                </div>
              </ScrollArea>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={saving !== null} onClick={() => save(false)}>
                {saving === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Sauvegarder brouillon
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button disabled={saving !== null}>
                    {saving === "active" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Sauvegarder et activer
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Activer cette nouvelle version ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Cette version remplacera celle utilisée pour tous les nouveaux contrats créés à partir de maintenant.
                      Les contrats déjà créés restent rattachés à leur version d'origine (snapshot juridique).
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction onClick={() => save(true)}>Activer</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span>Preview live (données exemple)</span>
              <div className="flex items-center gap-2 text-xs font-normal">
                <span className="text-muted-foreground">Brut</span>
                <Switch checked={previewInterpolated} onCheckedChange={setPreviewInterpolated} />
                <span className="text-muted-foreground">Interpolé</span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[640px] rounded-md border bg-background">
              <div className="p-6">
                <div className="mb-4">
                  <div className="text-xs uppercase text-muted-foreground">Contrat exemple</div>
                  <h2 className="text-lg font-semibold">Contrat de travail intermittent — Setup Paris</h2>
                  <p className="text-xs text-muted-foreground">N° {EXAMPLE_CONTRAT_TEMPLATE_VALUES.numero_contrat}</p>
                </div>
                <div className="contrat-template-preview" dangerouslySetInnerHTML={{ __html: previewHtml }} />
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Toolbar({
  editor,
  onInsertPlaceholder,
}: {
  editor: Editor | null;
  onInsertPlaceholder: (key: PlaceholderKey) => void;
}) {
  if (!editor) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/30 p-1">
      {/* Format */}
      <Group>
        <TBtn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} label="Gras"><Bold className="h-4 w-4" /></TBtn>
        <TBtn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} label="Italique"><Italic className="h-4 w-4" /></TBtn>
        <TBtn active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} label="Souligné"><UnderlineIcon className="h-4 w-4" /></TBtn>
      </Group>
      <Sep />
      {/* Headings */}
      <Group>
        <TBtn active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} label="Titre 1"><Heading1 className="h-4 w-4" /></TBtn>
        <TBtn active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} label="Titre 2"><Heading2 className="h-4 w-4" /></TBtn>
        <TBtn active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} label="Titre 3"><Heading3 className="h-4 w-4" /></TBtn>
        <TBtn active={editor.isActive("paragraph")} onClick={() => editor.chain().focus().setParagraph().run()} label="Paragraphe"><Pilcrow className="h-4 w-4" /></TBtn>
      </Group>
      <Sep />
      {/* Lists */}
      <Group>
        <TBtn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} label="Liste à puces"><List className="h-4 w-4" /></TBtn>
        <TBtn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} label="Liste numérotée"><ListOrdered className="h-4 w-4" /></TBtn>
      </Group>
      <Sep />
      {/* Align */}
      <Group>
        <TBtn active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()} label="Aligner à gauche"><AlignLeft className="h-4 w-4" /></TBtn>
        <TBtn active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()} label="Centrer"><AlignCenter className="h-4 w-4" /></TBtn>
        <TBtn active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()} label="Aligner à droite"><AlignRight className="h-4 w-4" /></TBtn>
        <TBtn active={editor.isActive({ textAlign: "justify" })} onClick={() => editor.chain().focus().setTextAlign("justify").run()} label="Justifier"><AlignJustify className="h-4 w-4" /></TBtn>
      </Group>
      <Sep />
      {/* Table + Page break */}
      <Group>
        <TBtn
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          label="Insérer un tableau 3×3"
        ><TableIcon className="h-4 w-4" /></TBtn>
        <TBtn
          onClick={() => editor.chain().focus().insertContent('<hr class="page-break" />').run()}
          label="Saut de page"
        ><FileSliders className="h-4 w-4" /></TBtn>
        <TBtn onClick={() => editor.chain().focus().undo().run()} label="Annuler"><RotateCcw className="h-4 w-4" /></TBtn>
      </Group>
      <Sep />
      {/* Insert variable */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="default" size="sm" className="h-8">
            <Variable className="h-4 w-4" />
            Insérer variable
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72 max-h-[460px] overflow-y-auto">
          {PLACEHOLDER_GROUPS.map((group, idx) => (
            <div key={group.groupe}>
              {idx > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
                {group.groupe}
              </DropdownMenuLabel>
              {group.items.map((item) => (
                <DropdownMenuItem key={item.key} onSelect={() => onInsertPlaceholder(item.key)} className="flex items-center justify-between gap-2">
                  <span className="font-medium">{item.label}</span>
                  <code className="text-[10px] text-muted-foreground">{`{{${item.key}}}`}</code>
                </DropdownMenuItem>
              ))}
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function Group({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>;
}
function Sep() { return <div className="mx-1 h-6 w-px bg-border" />; }
function TBtn({
  active, onClick, label, children,
}: { active?: boolean; onClick: () => void; label: string; children: ReactNode }) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="icon"
      className="h-8 w-8"
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      {children}
    </Button>
  );
}
