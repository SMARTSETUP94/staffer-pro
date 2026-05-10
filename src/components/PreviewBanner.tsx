import { useEffect, useState } from "react";
import { Eye, X, User } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePreview, type PreviewRole } from "@/lib/preview-context";

const LABELS: Record<PreviewRole, string> = {
  admin: "Admin",
  chef_chantier: "Chef d'équipe",
  chef_mobile: "Chef mobile",
  employe_desktop: "Employé desktop",
  employe_mobile: "Employé mobile",
};

interface EmployeOption {
  id: string;
  prenom: string;
  nom: string;
  type_contrat: string;
}

export function PreviewBanner() {
  const {
    previewRole,
    isPreviewing,
    setPreviewRole,
    isEmployePreview,
    previewEmployeId,
    setPreviewEmployeId,
  } = usePreview();
  const navigate = useNavigate();
  const [employes, setEmployes] = useState<EmployeOption[]>([]);

  // Charger la liste des employés actifs (ayant des assignations en priorité) pour QA
  useEffect(() => {
    if (!isEmployePreview) return;
    if (employes.length > 0) return;
    supabase
      .from("employes")
      .select("id, prenom, nom, type_contrat")
      .eq("actif", true)
      .order("nom")
      .limit(200)
      .then(({ data }) => {
        if (data) setEmployes(data as EmployeOption[]);
      });
  }, [isEmployePreview, employes.length]);

  if (!isPreviewing || !previewRole) return null;

  const handleExit = () => {
    const wasMobile = previewRole === "employe_mobile" || previewRole === "chef_mobile";
    setPreviewRole(null);
    if (wasMobile) {
      navigate({ to: "/planning" });
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/30 bg-primary/10 px-4 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-3 text-primary">
        <div className="flex items-center gap-2">
          <Eye className="h-3.5 w-3.5" />
          <span className="font-semibold uppercase tracking-wider">
            Preview : {LABELS[previewRole]}
          </span>
        </div>
        {isEmployePreview && (
          <div className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" />
            <span className="font-semibold uppercase tracking-wider text-[10px]">
              Comme&nbsp;:
            </span>
            <Select
              value={previewEmployeId ?? "__none__"}
              onValueChange={(v) =>
                setPreviewEmployeId(v === "__none__" ? null : v)
              }
            >
              <SelectTrigger className="h-7 min-w-[200px] border-primary/40 bg-background text-xs">
                <SelectValue placeholder="Choisir une fiche employé démo…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Mon compte (lié)</SelectItem>
                {employes.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.prenom} {e.nom}{" "}
                    <span className="text-muted-foreground">
                      · {e.type_contrat}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 gap-1.5 text-xs text-primary hover:bg-primary/15 hover:text-primary"
        onClick={handleExit}
      >
        <X className="h-3 w-3" />
        Revenir admin
      </Button>
    </div>
  );
}
