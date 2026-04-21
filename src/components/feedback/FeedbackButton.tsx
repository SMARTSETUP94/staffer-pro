import { useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { MessageCircle, Camera, Loader2, X, Bug, Lightbulb, HelpCircle, Sparkles } from "lucide-react";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type FeedbackType = Database["public"]["Enums"]["feedback_type"];
type FeedbackPriorite = Database["public"]["Enums"]["feedback_priorite"];

const TYPE_OPTIONS: { value: FeedbackType; label: string; icon: typeof Bug }[] = [
  { value: "bug", label: "Bug / problème", icon: Bug },
  { value: "idee", label: "Idée / nouveauté", icon: Lightbulb },
  { value: "amelioration", label: "Amélioration", icon: Sparkles },
  { value: "question", label: "Question", icon: HelpCircle },
];

const PRIORITE_OPTIONS: { value: FeedbackPriorite; label: string }[] = [
  { value: "basse", label: "Basse — quand vous avez le temps" },
  { value: "moyenne", label: "Moyenne — à voir prochainement" },
  { value: "haute", label: "Haute — me bloque ponctuellement" },
  { value: "critique", label: "Critique — m'empêche de travailler" },
];

interface Props {
  /** Si true, position fixe en bas à droite (desktop). Sinon contrôlé par le parent. */
  floating?: boolean;
  /** Variant pour intégration dans une nav (ex: bottom mobile). */
  variant?: "icon" | "label";
  className?: string;
}

export function FeedbackButton({ floating = true, variant = "icon", className }: Props) {
  const { user, isAdminOrChef } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("bug");
  const [priorite, setPriorite] = useState<FeedbackPriorite>("moyenne");
  const [titre, setTitre] = useState("");
  const [description, setDescription] = useState("");
  const [includeScreenshot, setIncludeScreenshot] = useState(true);
  const [busy, setBusy] = useState(false);

  // N'affiche le bouton qu'aux chefs et admins (RLS empêche l'insert ailleurs).
  if (!isAdminOrChef || !user) return null;

  const reset = () => {
    setTitre("");
    setDescription("");
    setType("bug");
    setPriorite("moyenne");
    setIncludeScreenshot(true);
  };

  const captureScreenshot = async (): Promise<Blob | null> => {
    try {
      // Capture le body sauf le bouton lui-même et les modaux (data-feedback-skip)
      const node = document.body;
      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: 1,
        filter: (n) => {
          if (!(n instanceof HTMLElement)) return true;
          if (n.dataset?.feedbackSkip === "true") return false;
          // Ignore les dialogs/popovers radix
          if (n.getAttribute("role") === "dialog") return false;
          return true;
        },
      });
      const res = await fetch(dataUrl);
      return await res.blob();
    } catch (err) {
      console.error("[feedback] screenshot failed", err);
      return null;
    }
  };

  const submit = async () => {
    if (!titre.trim() || !description.trim()) {
      toast.error("Titre et description obligatoires.");
      return;
    }
    setBusy(true);

    let screenshotPath: string | null = null;

    // 1. Capture (avant insert pour pouvoir abandonner si erreur)
    if (includeScreenshot) {
      // Ferme visuellement le dialog le temps de capturer
      setOpen(false);
      await new Promise((r) => setTimeout(r, 300));

      const blob = await captureScreenshot();
      setOpen(true);

      if (blob) {
        const ext = "png";
        const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("feedback-screenshots")
          .upload(fileName, blob, { contentType: "image/png" });
        if (upErr) {
          console.error("[feedback] upload failed", upErr);
          toast.warning("Capture impossible, signalement envoyé sans capture.");
        } else {
          screenshotPath = fileName;
        }
      } else {
        toast.warning("Capture impossible, signalement envoyé sans capture.");
      }
    }

    // 2. Insert
    const { error } = await supabase.from("feedbacks").insert({
      author_id: user.id,
      type,
      priorite,
      titre: titre.trim(),
      description: description.trim(),
      page_url: path,
      user_agent: navigator.userAgent,
      screenshot_path: screenshotPath,
    });

    setBusy(false);

    if (error) {
      toast.error(`Échec de l'envoi : ${error.message}`);
      return;
    }

    toast.success("Merci ! Ton signalement a bien été enregistré.");
    reset();
    setOpen(false);
  };

  const Trigger = (
    <Button
      type="button"
      onClick={() => setOpen(true)}
      data-feedback-skip="true"
      aria-label="Signaler un problème ou suggérer une amélioration"
      className={cn(
        floating &&
          "fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg hover:shadow-xl",
        floating && "md:bottom-8 md:right-8",
        // Sur mobile (avec bottom nav), monter au-dessus
        floating && "max-md:bottom-20",
        variant === "label" && !floating && "gap-2",
        className,
      )}
      size={variant === "icon" && floating ? "icon" : "default"}
    >
      <MessageCircle className={cn(floating ? "h-6 w-6" : "h-4 w-4")} />
      {variant === "label" && !floating && <span>Signaler</span>}
    </Button>
  );

  return (
    <>
      {Trigger}

      <Dialog open={open} onOpenChange={(o) => (busy ? null : setOpen(o))}>
        <DialogContent className="max-w-lg" data-feedback-skip="true">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-primary" />
              Signaler ou proposer
            </DialogTitle>
            <DialogDescription>
              On regardera ça ensemble. Plus tu donnes de contexte, plus c'est rapide à corriger.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as FeedbackType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      return (
                        <SelectItem key={opt.value} value={opt.value}>
                          <span className="inline-flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5" />
                            {opt.label}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Priorité</Label>
                <Select value={priorite} onValueChange={(v) => setPriorite(v as FeedbackPriorite)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fb-titre" className="text-xs">
                Titre court *
              </Label>
              <Input
                id="fb-titre"
                value={titre}
                onChange={(e) => setTitre(e.target.value)}
                placeholder="Ex : Le filtre métier ne mémorise pas la sélection"
                maxLength={200}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fb-desc" className="text-xs">
                Description détaillée *
              </Label>
              <Textarea
                id="fb-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                placeholder="Étapes pour reproduire, ce que tu attendais, ce qui s'est passé…"
              />
            </div>

            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs">
              <input
                type="checkbox"
                checked={includeScreenshot}
                onChange={(e) => setIncludeScreenshot(e.target.checked)}
                className="mt-0.5"
              />
              <div className="flex-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  <Camera className="h-3.5 w-3.5" />
                  Joindre une capture d'écran de la page actuelle
                </div>
                <p className="mt-0.5 text-muted-foreground">
                  Page : <span className="font-mono">{path}</span>
                </p>
              </div>
            </label>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              <X className="mr-1 h-4 w-4" /> Annuler
            </Button>
            <Button onClick={submit} disabled={busy || !titre.trim() || !description.trim()}>
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-1 h-4 w-4" />}
              Envoyer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
