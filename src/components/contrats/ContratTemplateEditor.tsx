import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Bold, Italic, List, ListOrdered, Heading2, Pilcrow, Save, CheckCircle2, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  activateContratTemplate,
  CONTRAT_TEMPLATE_PLACEHOLDERS,
  createContratTemplateVersion,
  DEFAULT_CONTRAT_TEMPLATE_HTML,
  EXAMPLE_CONTRAT_TEMPLATE_VALUES,
  interpolateContratTemplate,
  listContratTemplates,
  type ContratTemplate,
} from "@/lib/contrats-templates";

interface Props {
  onChanged?: () => void;
}

export function ContratTemplateEditor({ onChanged }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nom, setNom] = useState("Template contrat intermittent");
  const [saving, setSaving] = useState<"draft" | "active" | "activate" | null>(null);

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
      Placeholder.configure({ placeholder: "Rédigez le corps juridique du contrat…" }),
    ],
    content: DEFAULT_CONTRAT_TEMPLATE_HTML,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "min-h-[420px] focus:outline-none prose prose-sm max-w-none text-foreground",
      },
    },
  });

  useEffect(() => {
    if (!selectedTemplate || !editor) return;
    setNom(selectedTemplate.nom);
    editor.commands.setContent(selectedTemplate.contenu_html || DEFAULT_CONTRAT_TEMPLATE_HTML, { emitUpdate: false });
  }, [editor, selectedTemplate]);

  const html = editor?.getHTML() ?? "";
  const previewHtml = useMemo(
    () => interpolateContratTemplate(html, EXAMPLE_CONTRAT_TEMPLATE_VALUES),
    [html],
  );

  const refresh = async () => {
    await refetch();
    onChanged?.();
  };

  const save = async (activate: boolean) => {
    if (!editor) return;
    const contenuHtml = editor.getHTML();
    if (!nom.trim()) { toast.error("Nom du template obligatoire"); return; }
    if (!contenuHtml || contenuHtml === "<p></p>") { toast.error("Contenu du template obligatoire"); return; }
    setSaving(activate ? "active" : "draft");
    try {
      const newId = await createContratTemplateVersion({ nom: nom.trim(), contenuHtml, actif: activate });
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

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Versions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => setSelectedId(template.id)}
                className="w-full rounded-md border border-border bg-card p-3 text-left text-sm transition-colors hover:bg-muted"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">v{template.version_int}</span>
                  {template.actif && <Badge>Actif</Badge>}
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground">{template.nom}</div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{new Date(template.created_at).toLocaleDateString("fr-FR")}</span>
                  {!template.actif && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={saving !== null}
                      onClick={(event) => { event.stopPropagation(); activateExisting(template); }}
                    >
                      Activer
                    </Button>
                  )}
                </div>
              </button>
            ))}
            {templates.length === 0 && <div className="text-sm text-muted-foreground">Aucune version.</div>}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Éditeur</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom de la version" />
              <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/30 p-1">
                <ToolbarButton active={editor?.isActive("bold")} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></ToolbarButton>
                <ToolbarButton active={editor?.isActive("italic")} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></ToolbarButton>
                <ToolbarButton active={editor?.isActive("heading", { level: 2 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="h-4 w-4" /></ToolbarButton>
                <ToolbarButton active={editor?.isActive("bulletList")} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List className="h-4 w-4" /></ToolbarButton>
                <ToolbarButton active={editor?.isActive("orderedList")} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></ToolbarButton>
                <ToolbarButton onClick={() => editor?.chain().focus().setParagraph().run()}><Pilcrow className="h-4 w-4" /></ToolbarButton>
                <ToolbarButton onClick={() => editor?.chain().focus().undo().run()}><RotateCcw className="h-4 w-4" /></ToolbarButton>
              </div>
              <ScrollArea className="h-[460px] rounded-md border bg-background p-4">
                <EditorContent editor={editor} />
              </ScrollArea>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={saving !== null} onClick={() => save(false)}>
                  {saving === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Sauvegarder brouillon
                </Button>
                <Button disabled={saving !== null} onClick={() => save(true)}>
                  {saving === "active" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Sauvegarder et activer cette version
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Preview avec données exemple</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1">
                {CONTRAT_TEMPLATE_PLACEHOLDERS.map((placeholder) => (
                  <Badge key={placeholder} variant="outline">{"{{"}{placeholder}{"}}"}</Badge>
                ))}
              </div>
              <ScrollArea className="h-[570px] rounded-md border bg-background p-5">
                <div className="space-y-4 text-sm leading-relaxed">
                  <div>
                    <div className="text-xs uppercase text-muted-foreground">Contrat exemple</div>
                    <h2 className="text-lg font-semibold">Contrat de travail intermittent — Setup Paris</h2>
                    <p className="text-xs text-muted-foreground">N° {EXAMPLE_CONTRAT_TEMPLATE_VALUES.numero_contrat}</p>
                  </div>
                  <div className="grid gap-2 rounded-md border p-3 text-xs sm:grid-cols-2">
                    <div><span className="text-muted-foreground">Salarié</span><br />{EXAMPLE_CONTRAT_TEMPLATE_VALUES.employe_prenom} {EXAMPLE_CONTRAT_TEMPLATE_VALUES.employe_nom}</div>
                    <div><span className="text-muted-foreground">Mission</span><br />{EXAMPLE_CONTRAT_TEMPLATE_VALUES.chantier_numero} — {EXAMPLE_CONTRAT_TEMPLATE_VALUES.chantier_nom}</div>
                    <div><span className="text-muted-foreground">Dates</span><br />{EXAMPLE_CONTRAT_TEMPLATE_VALUES.date_debut} → {EXAMPLE_CONTRAT_TEMPLATE_VALUES.date_fin}</div>
                    <div><span className="text-muted-foreground">Rémunération</span><br />{EXAMPLE_CONTRAT_TEMPLATE_VALUES.taux_horaire_brut} · {EXAMPLE_CONTRAT_TEMPLATE_VALUES.nb_heures}</div>
                  </div>
                  <div className="contrat-template-preview" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ToolbarButton({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" variant={active ? "secondary" : "ghost"} size="icon" onClick={onClick} className="h-8 w-8">
      {children}
    </Button>
  );
}
