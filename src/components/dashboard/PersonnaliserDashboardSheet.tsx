/**
 * v0.26.0 — Sheet "Personnaliser le dashboard".
 * v0.27.4 — Limite la liste aux widgets autorisés par le rôle effectif (anti-fuite).
 */
import { useState, useEffect, useMemo } from "react";
import { Settings2, RotateCcw } from "lucide-react";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger, SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  WIDGET_META, CATEGORY_LABELS, CATEGORY_ORDER,
} from "@/lib/dashboard/widget-registry";
import {
  ALL_WIDGET_IDS,
  getAllowedWidgetsForRole,
  type DashboardLayout,
  type WidgetId,
} from "@/lib/dashboard/types";
import { usePreview } from "@/lib/preview-context";
import { toast } from "sonner";

interface Props {
  layout: DashboardLayout;
  onSave: (next: DashboardLayout) => Promise<void>;
  onReset: () => Promise<void>;
}

export function PersonnaliserDashboardSheet({ layout, onSave, onReset }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Set<WidgetId>>(new Set(layout.visible));
  const { effectiveRole } = usePreview();

  // v0.27.4 — Whitelist des widgets que l'utilisateur courant a le droit
  // d'activer dans son dashboard. Empêche de cocher un widget commerce
  // quand on est employé.
  const allowedSet = useMemo(() => getAllowedWidgetsForRole(effectiveRole), [effectiveRole]);
  const allowedIds = useMemo(
    () => ALL_WIDGET_IDS.filter((id) => allowedSet.has(id)),
    [allowedSet],
  );

  useEffect(() => {
    if (open) setDraft(new Set(layout.visible));
  }, [open, layout.visible]);

  const toggle = (id: WidgetId) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    const visible = allowedIds.filter((id) => draft.has(id));
    const hidden = allowedIds.filter((id) => !draft.has(id));
    await onSave({ visible, hidden });
    toast.success("Layout enregistré");
    setOpen(false);
  };

  const handleReset = async () => {
    await onReset();
    toast.success("Réinitialisé au preset de votre rôle");
    setOpen(false);
  };

  const widgetsByCategory = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    widgets: allowedIds.filter((id) => WIDGET_META[id].category === cat),
  })).filter((g) => g.widgets.length > 0);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="mr-2 h-4 w-4" />Personnaliser
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Personnaliser le dashboard</SheetTitle>
          <SheetDescription>
            {draft.size} widget{draft.size > 1 ? "s" : ""} actif{draft.size > 1 ? "s" : ""} sur {ALL_WIDGET_IDS.length}
          </SheetDescription>
        </SheetHeader>

        <div className="my-4 space-y-5">
          {widgetsByCategory.map(({ category, widgets }) => (
            <div key={category} className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {CATEGORY_LABELS[category]}
              </p>
              <ul className="space-y-1.5">
                {widgets.map((id) => {
                  const meta = WIDGET_META[id];
                  return (
                    <li key={id} className="flex items-start gap-2 rounded-md border p-2.5 hover:bg-muted/30">
                      <Checkbox
                        id={`w-${id}`}
                        checked={draft.has(id)}
                        onCheckedChange={() => toggle(id)}
                        className="mt-0.5"
                      />
                      <Label htmlFor={`w-${id}`} className="flex-1 cursor-pointer">
                        <p className="text-sm font-medium">{meta.title}</p>
                        <p className="text-xs text-muted-foreground">{meta.description}</p>
                      </Label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <SheetFooter className="flex-col gap-2 sm:flex-col">
          <Button onClick={handleSave} className="w-full">Enregistrer</Button>
          <Button onClick={handleReset} variant="outline" className="w-full">
            <RotateCcw className="mr-2 h-4 w-4" />Réinitialiser au preset par défaut
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
