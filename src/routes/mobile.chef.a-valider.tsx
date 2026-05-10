import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Check, X, Pencil, Hammer, Clock, AlertTriangle } from "lucide-react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { ChefMobileHeader } from "@/components/mobile-chef/ChefMobileHeader";
import { useChefAValider, type HeureAValider, type ObjetAValider } from "@/hooks/use-chef-a-valider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

export const Route = createFileRoute("/mobile/chef/a-valider")({
  head: () => ({ meta: [{ title: "Hub chef — À valider" }] }),
  component: () => (
    <RoleGuard required="chef_or_admin">
      <ChefAValiderPage />
    </RoleGuard>
  ),
});

function ChefAValiderPage() {
  const { heures, objets, isLoading, refetch } = useChefAValider();

  return (
    <>
      <ChefMobileHeader title="À valider" />
      <div className="mx-auto max-w-xl p-4">
        <Tabs defaultValue="heures">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="heures" className="gap-2">
              <Clock className="h-4 w-4" />
              Heures
              {heures.length > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">
                  {heures.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="objets" className="gap-2">
              <Hammer className="h-4 w-4" />
              Objets fab
              {objets.length > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">
                  {objets.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="heures" className="mt-4 space-y-3">
            {isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : heures.length === 0 ? (
              <EmptyState icon={Check} message="Aucune heure en attente." />
            ) : (
              heures.map((h) => <HeureRow key={h.id} heure={h} onChanged={refetch} />)
            )}
          </TabsContent>

          <TabsContent value="objets" className="mt-4 space-y-3">
            {isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : objets.length === 0 ? (
              <EmptyState icon={Check} message="Aucun objet à valider." />
            ) : (
              objets.map((o) => <ObjetRow key={o.id} objet={o} onChanged={refetch} />)
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function EmptyState({ icon: Icon, message }: { icon: typeof Check; message: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
        <Icon className="h-8 w-8 text-emerald-500" />
        <p className="text-sm">{message}</p>
      </CardContent>
    </Card>
  );
}

// ─────────── Heures ───────────

function HeureRow({ heure, onChanged }: { heure: HeureAValider; onChanged: () => void }) {
  const [busy, setBusy] = useState<"validate" | "correct" | "reject" | null>(null);
  const [correctOpen, setCorrectOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  const dateLabel = format(parseISO(heure.date), "EEE d MMM", { locale: fr });

  async function validate() {
    setBusy("validate");
    const { error } = await supabase
      .from("heures_saisies")
      .update({ statut: "valide", valide_le: new Date().toISOString() })
      .eq("id", heure.id);
    setBusy(null);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Heures validées", description: `${heure.employe_nom} • ${dateLabel}` });
    onChanged();
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[11px] text-muted-foreground">
              {heure.affaire_numero}
            </div>
            <div className="text-sm font-semibold leading-tight">{heure.employe_nom}</div>
            <div className="text-xs text-muted-foreground">
              {dateLabel} •{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {heure.heures_reelles ?? 0}h
              </span>
              {heure.heure_debut && heure.heure_fin && (
                <> ({heure.heure_debut.slice(0, 5)}–{heure.heure_fin.slice(0, 5)})</>
              )}
            </div>
            {heure.commentaire && (
              <div className="mt-1 text-xs italic text-muted-foreground">
                « {heure.commentaire} »
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={validate}
            disabled={busy !== null}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700"
          >
            <Check className="mr-1 h-4 w-4" /> Valider
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCorrectOpen(true)}
            disabled={busy !== null}
          >
            <Pencil className="mr-1 h-4 w-4" /> Corriger
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setRejectOpen(true)}
            disabled={busy !== null}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>

      <CorrectHeureDialog
        open={correctOpen}
        onOpenChange={setCorrectOpen}
        heure={heure}
        onDone={onChanged}
      />
      <RejectHeureDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        heure={heure}
        onDone={onChanged}
      />
    </Card>
  );
}

function CorrectHeureDialog({
  open,
  onOpenChange,
  heure,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  heure: HeureAValider;
  onDone: () => void;
}) {
  const [valeur, setValeur] = useState(String(heure.heures_reelles ?? 0));
  const [commentaire, setCommentaire] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const num = Number(valeur);
    if (!Number.isFinite(num) || num < 0 || num > 24) {
      toast({ title: "Valeur invalide", description: "Entre 0 et 24h.", variant: "destructive" });
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("heures_saisies")
      .update({
        heures_reelles: num,
        statut: "valide",
        valide_le: new Date().toISOString(),
        commentaire: commentaire || heure.commentaire,
      })
      .eq("id", heure.id);
    setBusy(false);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Heures corrigées et validées" });
    onOpenChange(false);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Corriger les heures</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded border bg-muted/50 p-2 text-xs">
            <div className="font-semibold">{heure.employe_nom}</div>
            <div className="text-muted-foreground">
              {heure.affaire_numero} • {format(parseISO(heure.date), "EEE d MMM", { locale: fr })}
            </div>
            <div>
              Valeur déclarée :{" "}
              <span className="font-semibold tabular-nums">{heure.heures_reelles ?? 0}h</span>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold">Heures corrigées</label>
            <Input
              type="number"
              min={0}
              max={24}
              step={0.25}
              value={valeur}
              onChange={(e) => setValeur(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold">Commentaire (optionnel)</label>
            <Textarea
              placeholder="Raison de la correction…"
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              rows={2}
            />
          </div>
          <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <AlertTriangle className="mr-1 inline h-3 w-3" />
            La correction est tracée dans l'audit (qui, quand, valeur avant/après).
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={busy}>
            Corriger et valider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectHeureDialog({
  open,
  onOpenChange,
  heure,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  heure: HeureAValider;
  onDone: () => void;
}) {
  const [motif, setMotif] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!motif.trim()) {
      toast({ title: "Motif requis", variant: "destructive" });
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("heures_saisies")
      .update({
        statut: "rejete",
        motif_rejet: motif,
        rejete_le: new Date().toISOString(),
      })
      .eq("id", heure.id);
    setBusy(false);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Heures rejetées", description: heure.employe_nom });
    onOpenChange(false);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rejeter ces heures</DialogTitle>
        </DialogHeader>
        <Textarea
          placeholder="Motif du rejet (visible par l'employé)…"
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          rows={3}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Annuler
          </Button>
          <Button variant="destructive" onClick={submit} disabled={busy}>
            Rejeter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────── Objets fabrication ───────────

function ObjetRow({ objet, onChanged }: { objet: ObjetAValider; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const statutLabel = {
    a_faire: "À faire",
    en_cours: "En cours",
    bloque: "Bloqué",
    fini: "Terminé",
  }[objet.statut_chef];

  return (
    <Card>
      <CardContent className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[11px] text-muted-foreground">
              {objet.affaire_numero} • {objet.reference}
            </div>
            <div className="text-sm font-semibold leading-tight">{objet.nom}</div>
            <div className="text-xs text-muted-foreground">
              Qté {objet.quantite} •{" "}
              <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                {statutLabel}
              </Badge>
            </div>
            {objet.commentaire_chef && (
              <div className="mt-1 text-xs italic text-muted-foreground">
                « {objet.commentaire_chef} »
              </div>
            )}
          </div>
          <Link
            to="/affaires/$affaireId/fabrication"
            params={{ affaireId: objet.affaire_id }}
            className="text-xs text-primary underline"
          >
            Détail
          </Link>
        </div>
        <Button size="sm" className="w-full" onClick={() => setOpen(true)}>
          <Check className="mr-1 h-4 w-4" /> Valider l'objet
        </Button>
      </CardContent>
      <ValidateObjetDialog
        open={open}
        onOpenChange={setOpen}
        objet={objet}
        onDone={onChanged}
      />
    </Card>
  );
}

function ValidateObjetDialog({
  open,
  onOpenChange,
  objet,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  objet: ObjetAValider;
  onDone: () => void;
}) {
  const [statut, setStatut] = useState<ObjetAValider["statut_chef"]>("fini");
  const [commentaire, setCommentaire] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const updates = {
        statut_chef: statut,
        commentaire_chef: commentaire || null,
        statut_chef_updated_at: new Date().toISOString(),
      };
      const { error: updErr } = await supabase
        .from("fabrication_objets")
        .update(updates)
        .eq("id", objet.id);
      if (updErr) throw updErr;

      // Photo preuve optionnelle
      if (photo) {
        const path = `${objet.affaire_id}/${objet.id}/validation-${Date.now()}.${photo.name.split(".").pop() ?? "jpg"}`;
        const { error: upErr } = await supabase.storage
          .from("fabrication-objets-photos")
          .upload(path, photo);
        if (upErr) {
          toast({
            title: "Photo non envoyée",
            description: upErr.message,
            variant: "destructive",
          });
        } else {
          await supabase.from("fabrication_objets_photos").insert({
            objet_id: objet.id,
            storage_path: path,
            commentaire: `Validation chef${commentaire ? ` — ${commentaire}` : ""}`,
          });
        }
      }

      toast({ title: "Objet mis à jour", description: objet.reference });
      onOpenChange(false);
      onDone();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur inconnue";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Valider l'objet</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded border bg-muted/50 p-2 text-xs">
            <div className="font-mono">{objet.reference}</div>
            <div className="font-semibold">{objet.nom}</div>
            <div className="text-muted-foreground">{objet.affaire_numero} — {objet.affaire_nom}</div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold">Nouveau statut</label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["a_faire", "À faire"],
                  ["en_cours", "En cours"],
                  ["bloque", "Bloqué"],
                  ["fini", "Terminé"],
                ] as const
              ).map(([v, l]) => (
                <Button
                  key={v}
                  type="button"
                  size="sm"
                  variant={statut === v ? "default" : "outline"}
                  onClick={() => setStatut(v)}
                >
                  {l}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold">Commentaire (optionnel)</label>
            <Textarea
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold">Photo preuve (optionnel)</label>
            <Input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            />
            {photo && (
              <p className="text-[11px] text-muted-foreground">{photo.name}</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={busy}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
