import { Eye, X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { usePreview, type PreviewRole } from "@/lib/preview-context";

const LABELS: Record<PreviewRole, string> = {
  admin: "Admin",
  chef_chantier: "Chef d'équipe",
  employe_desktop: "Employé desktop",
  employe_mobile: "Employé mobile",
};

export function PreviewBanner() {
  const { previewRole, isPreviewing, setPreviewRole } = usePreview();
  const navigate = useNavigate();

  if (!isPreviewing || !previewRole) return null;

  const handleExit = () => {
    const wasMobile = previewRole === "employe_mobile";
    setPreviewRole(null);
    if (wasMobile) {
      navigate({ to: "/planning" });
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 border-b border-primary/30 bg-primary/10 px-4 py-2 text-xs">
      <div className="flex items-center gap-2 text-primary">
        <Eye className="h-3.5 w-3.5" />
        <span className="font-semibold uppercase tracking-wider">
          Mode prévisualisation : {LABELS[previewRole]}
        </span>
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
