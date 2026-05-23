import { Eye } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { usePreview, type PreviewRole } from "@/lib/preview-context";
import { previewRoleLabel } from "@/lib/labels";

interface Props {
  collapsed?: boolean;
}

export function ViewAsSwitcher({ collapsed }: Props) {
  const { isAdmin } = useAuth();
  const { previewRole, setPreviewRole } = usePreview();
  const navigate = useNavigate();

  if (!isAdmin) return null;

  const value: PreviewRole = previewRole ?? "admin";

  const handleChange = (next: string) => {
    const role = next as PreviewRole;
    setPreviewRole(role === "admin" ? null : role);
    if (role === "employe_mobile") {
      navigate({ to: "/mobile/aujourdhui" });
    } else if (role === "chef_mobile") {
      navigate({ to: "/mobile/chef" });
    } else {
      // Repasser sur le planning desktop si on revenait du mobile
      navigate({ to: "/planning" });
    }
  };

  if (collapsed) {
    return (
      <div className="flex justify-center py-2" title="Voir comme">
        <Eye className="h-4 w-4 text-sidebar-foreground/60" />
      </div>
    );
  }

  return (
    <div className="px-2 pb-2">
      <p className="overline mb-1.5 !text-sidebar-foreground/60">— Voir comme</p>
      <Select value={value} onValueChange={handleChange}>
        <SelectTrigger className="h-9 rounded-lg border-sidebar-border bg-sidebar-accent/40 text-xs text-sidebar-foreground hover:bg-sidebar-accent">
          <div className="flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5" />
            <SelectValue />
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="admin">{previewRoleLabel("admin")}</SelectItem>
          <SelectItem value="chef_chantier">{previewRoleLabel("chef_chantier")}</SelectItem>
          <SelectItem value="chef_mobile">{previewRoleLabel("chef_mobile")}</SelectItem>
          <SelectItem value="employe_desktop">{previewRoleLabel("employe_desktop")}</SelectItem>
          <SelectItem value="employe_mobile">{previewRoleLabel("employe_mobile")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
