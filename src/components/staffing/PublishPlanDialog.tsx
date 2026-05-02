// v0.35.5 — Dialog publication plan staffing
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Send } from "lucide-react";
import { publishStaffingPlan } from "@/server/staffing-publish.functions";

export function PublishPlanDialog({
  planId,
  affaireLabel,
  affectedDays,
  affectedPeople,
  open,
  onOpenChange,
  onPublished,
}: {
  planId: string;
  affaireLabel: string;
  affectedDays: number;
  affectedPeople: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPublished: () => void;
}) {
  const publishFn = useServerFn(publishStaffingPlan);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const r = await publishFn({ data: { planId } });
      toast.success(
        `Plan publié — ${r.published_assignments} créneaux, ${r.notified_users} personnes notifiées.`,
      );
      onOpenChange(false);
      onPublished();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur publication");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publier le plan staffing</DialogTitle>
          <DialogDescription>
            Tu vas publier le plan staffing pour{" "}
            <span className="font-semibold">{affaireLabel}</span>. Cela affectera{" "}
            <span className="font-semibold">{affectedPeople}</span> personne(s) sur{" "}
            <span className="font-semibold">{affectedDays}</span> jour(s).
            <br />
            <br />
            Les créneaux seront propagés vers le Planning principal et les personnes
            recevront une notification. Si un plan publié existait déjà sur cette
            affaire, il sera archivé.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Publier
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
