import { useState, useEffect } from "react";
import { Loader2, History, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCapability } from "@/hooks/use-capability";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  type FabricationEtape,
  type FabricationEtapeStatut,
  type FabricationObjet,
  ETAPE_LABELS,
  STATUT_LABELS,
  STATUT_ICONS,
  ETAPE_TO_FLAG,
  useProfilesWithRoles,
} from "@/hooks/use-fabrication";

interface HistoriqueEntry {
  id: string;
  action: string;
  ancien_statut: FabricationEtapeStatut | null;
  nouveau_statut: FabricationEtapeStatut | null;
  fait_par_id: string | null;
  fait_par_name: string | null;
  commentaire: string | null;
  created_at: string;
}

interface Props {
  objet: FabricationObjet;
  etape: FabricationEtape;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const STATUT_OPTIONS: FabricationEtapeStatut[] = ["a_faire", "en_cours", "termine", "non_applicable"];

export function EtapeDialog({ objet, etape, open, onOpenChange, onSaved }: Props) {
  const { user } = useAuth();
  const isAdmin = useCapability("fabrication.etape.admin_override");
  const { profiles } = useProfilesWithRoles();
  const [statut, setStatut] = useState<FabricationEtapeStatut>(etape.statut);
  const [assigneeId, setAssigneeId] = useState<string>(etape.assignee_id ?? "none");
  const [commentaire, setCommentaire] = useState<string>(etape.commentaire ?? "");
  const [voirTous, setVoirTous] = useState(false);
  const [historique, setHistorique] = useState<HistoriqueEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingHistorique, setLoadingHistorique] = useState(false);

  const flag = ETAPE_TO_FLAG[etape.type_etape];
  // L3a — double-filtre : flag métier ET cap `casting.edit_phase_fabrication`
  const eligibles = voirTous
    ? profiles
    : profiles.filter((p) => p[flag] && p.has_cap_fab_edit);
  const currentUserCanSelfAssign =
    user && profiles.some((p) => p.id === user.id && p[flag] && p.has_cap_fab_edit);

  // Reset state when opening with new etape
  useEffect(() => {
    if (open) {
      setStatut(etape.statut);
      setAssigneeId(etape.assignee_id ?? "none");
      setCommentaire(etape.commentaire ?? "");
      setVoirTous(false);
    }
  }, [open, etape.id, etape.statut, etape.assignee_id, etape.commentaire]);

  // Charger historique
  useEffect(() => {
    if (!open) return;
    setLoadingHistorique(true);
    void (async () => {
      const { data: hist } = await supabase
        .from("fabrication_etapes_historique")
        .select("id, action, ancien_statut, nouveau_statut, fait_par_id, commentaire, created_at")
        .eq("etape_id", etape.id)
        .order("created_at", { ascending: false })
        .limit(20);

      const ids = new Set<string>();
      (hist ?? []).forEach((h) => h.fait_par_id && ids.add(h.fait_par_id));
      const { data: profs } = ids.size
        ? await supabase.from("profiles").select("id, full_name, email").in("id", Array.from(ids))
        : { data: [] as { id: string; full_name: string | null; email: string }[] };
      const nameMap = new Map<string, string>();
      (profs ?? []).forEach((p) => nameMap.set(p.id, p.full_name || p.email));

      setHistorique(
        (hist ?? []).map((h) => ({
          ...h,
          fait_par_name: h.fait_par_id ? nameMap.get(h.fait_par_id) ?? null : null,
        })) as HistoriqueEntry[],
      );
      setLoadingHistorique(false);
    })();
  }, [open, etape.id]);

  const handleSelfAssign = () => {
    if (user) setAssigneeId(user.id);
  };

  const handleSave = async () => {
    setSaving(true);
    const updates: {
      statut: FabricationEtapeStatut;
      assignee_id: string | null;
      commentaire: string | null;
    } = {
      statut,
      assignee_id: assigneeId === "none" ? null : assigneeId,
      commentaire: commentaire.trim() || null,
    };

    const { error } = await supabase.from("fabrication_etapes").update(updates).eq("id", etape.id);
    setSaving(false);
    if (error) {
      toast.error("Mise à jour impossible", { description: error.message });
      return;
    }
    toast.success("Étape mise à jour");
    onSaved();
    onOpenChange(false);
  };

  const handleQuickStatut = async (newStatut: FabricationEtapeStatut) => {
    setStatut(newStatut);
    setSaving(true);
    const { error } = await supabase
      .from("fabrication_etapes")
      .update({
        statut: newStatut,
        assignee_id: assigneeId === "none" ? null : assigneeId,
        commentaire: commentaire.trim() || null,
      })
      .eq("id", etape.id);
    setSaving(false);
    if (error) {
      toast.error("Action impossible", { description: error.message });
      return;
    }
    toast.success(`Étape marquée « ${STATUT_LABELS[newStatut]} »`);
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {objet.reference} — {objet.nom}
          </DialogTitle>
          <DialogDescription>
            Étape : <span className="font-semibold">{ETAPE_LABELS[etape.type_etape]}</span>
            {" · "}Statut actuel : {STATUT_ICONS[etape.statut]} {STATUT_LABELS[etape.statut]}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label>Assignee</Label>
              {isAdmin && (
                <div className="flex items-center gap-2">
                  <Switch id="voir-tous" checked={voirTous} onCheckedChange={setVoirTous} />
                  <Label htmlFor="voir-tous" className="text-xs font-normal text-muted-foreground">
                    Voir tous les profils
                  </Label>
                </div>
              )}
            </div>
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir un assignee" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Non assigné —</SelectItem>
                {eligibles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {currentUserCanSelfAssign && assigneeId !== user?.id && (
              <Button variant="outline" size="sm" onClick={handleSelfAssign} className="w-fit">
                Me l'assigner
              </Button>
            )}
            {!voirTous && eligibles.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Aucun profil avec le rôle requis. Configurez-le dans Paramètres → Rôles fabrication.
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="commentaire-etape">Commentaire (optionnel)</Label>
            <Textarea
              id="commentaire-etape"
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              rows={2}
              placeholder="Note rapide sur l'étape…"
            />
          </div>

          <div className="grid gap-2">
            <Label>Actions rapides</Label>
            <div className="flex flex-wrap gap-2">
              {STATUT_OPTIONS.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={s === statut ? "default" : "outline"}
                  onClick={() => handleQuickStatut(s)}
                  disabled={saving}
                  className="rounded-xl"
                >
                  {STATUT_ICONS[s]} {STATUT_LABELS[s]}
                </Button>
              ))}
            </div>
            {etape.statut === "termine" && (
              <p className="text-xs text-muted-foreground">
                <RotateCcw className="mr-1 inline h-3 w-3" />
                La dévalidation est tracée dans l'historique.
              </p>
            )}
          </div>

          <div className="grid gap-2 border-t pt-3">
            <Label className="flex items-center gap-2">
              <History className="h-4 w-4" /> Historique
            </Label>
            {loadingHistorique ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Chargement…
              </div>
            ) : historique.length === 0 ? (
              <p className="text-xs text-muted-foreground">Aucune action enregistrée.</p>
            ) : (
              <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
                {historique.map((h) => (
                  <li key={h.id} className="flex items-start gap-2 border-b border-border/50 pb-1 last:border-0">
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {new Date(h.created_at).toLocaleString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Badge>
                    <div>
                      <span className="font-medium">{h.fait_par_name ?? "Système"}</span>
                      {" · "}
                      <span className="text-muted-foreground">
                        {formatAction(h)}
                      </span>
                      {h.commentaire && <p className="text-muted-foreground italic">« {h.commentaire} »</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Fermer
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatAction(h: HistoriqueEntry): string {
  if (h.action === "creation") return "Étape créée";
  if (h.action === "assignation") return "Assignation modifiée";
  if (h.action === "devalidation") return `Dévalidée (était ${h.ancien_statut ?? "?"})`;
  if (h.action === "changement_statut") {
    return `${STATUT_LABELS[h.ancien_statut ?? "a_faire"]} → ${STATUT_LABELS[h.nouveau_statut ?? "a_faire"]}`;
  }
  if (h.action === "changement_statut_et_assignation") {
    return `Statut + assignation modifiés`;
  }
  return h.action;
}
