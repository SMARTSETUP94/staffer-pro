/**
 * Bloc 9 Lot 9.3 — Carte mission détaillée (mobile).
 *
 * Sections :
 *   - Hero (numero, nom, phase, countdown jour J)
 *   - Mes assignations (dates + demi-journées)
 *   - Infos terrain (acces, code, tenue)
 *   - Contact site (tel: link)
 *   - Chef chantier (tel: link)
 *   - Équipe (badges, est_moi en surbrillance)
 *   - Timeline events (arrivee/depart/probleme/photo)
 *   - Barre d'actions (boutons J'arrive / Je pars / Signaler — 9.4/9.5)
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  HardHat,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  MessageSquare,
  Navigation as NavIcon,
  Phone,
  Shirt,
  Users,
  Wrench,
  PackageCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  getCarteMission,
  recordMissionEvent,
  type CarteMissionDetail,
  type MissionEvent,
  type MissionPhase,
} from "@/server/mission-card.functions";
import { PreviewBanner } from "@/components/PreviewBanner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { compressImageIfPossible } from "@/lib/image-compress";
import {
  autoTagCategoryByMissionState,
  computeHeuresFromEvents,
  type PhotoCategorie,
} from "@/lib/mission-card-helpers";

export const Route = createFileRoute("/_app/missions/$affaireId/$phase")({
  head: () => ({ meta: [{ title: "Mission pose — Setup Paris" }] }),
  component: CarteMissionPage,
});

function CarteMissionPage() {
  const params = Route.useParams();
  const affaireId = params.affaireId;
  const phase = params.phase as MissionPhase;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchCarte = useServerFn(getCarteMission);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["mission-detail", affaireId, phase],
    queryFn: () => fetchCarte({ data: { affaireId, phase } }),
    staleTime: 30_000,
    enabled: phase === "montage" || phase === "demontage",
  });

  if (isLoading) {
    return (
      <FullScreen>
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </FullScreen>
    );
  }
  if (isError || !data) {
    return (
      <FullScreen>
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive max-w-md">
          {error instanceof Error ? error.message : "Mission introuvable"}
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              Réessayer
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigate({ to: "/mobile/mes-missions" })}
            >
              Retour
            </Button>
          </div>
        </div>
      </FullScreen>
    );
  }

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["mission-detail", affaireId, phase] });

  return (
    <div className="min-h-screen bg-background pb-32" data-testid="mission-detail-page">
      <PreviewBanner />
      <TopBar phase={phase} />
      <main className="mx-auto max-w-md space-y-4 px-4 py-4">
        <MissionHero detail={data} />
        <MesAssignations detail={data} />
        <InfosTerrainSection detail={data} />
        <ContactsSection detail={data} />
        <EquipeSection detail={data} />
        <EventsTimeline events={data.events} />
        <MesHeuresSection detail={data} onSaved={invalidate} />
      </main>
      <PhotoFab affaireId={affaireId} phase={phase} events={data.events} onUploaded={invalidate} />
      <ActionsBar affaireId={affaireId} phase={phase} onRecorded={invalidate} />
    </div>
  );
}

// ---------------------------------------------------------------------------
function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">{children}</div>
  );
}

function TopBar({ phase }: { phase: MissionPhase }) {
  const Icon = phase === "montage" ? Wrench : PackageCheck;
  const label = phase === "montage" ? "Montage" : "Démontage";
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
        <Link
          to="/mobile/mes-missions"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          aria-label="Retour à la liste"
        >
          <ArrowLeft className="h-4 w-4" />
          Missions
        </Link>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-foreground">
          <Icon className="h-3 w-3" />
          {label}
        </span>
      </div>
    </header>
  );
}

// --- Hero ------------------------------------------------------------------
function MissionHero({ detail }: { detail: CarteMissionDetail }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  const countdown = useMemo(() => countdownLabel(detail.date_debut, detail.date_fin), [
    detail.date_debut,
    detail.date_fin,
  ]);
  return (
    <section
      className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-card p-4"
      data-testid="mission-hero"
    >
      <p className="font-mono text-xs font-bold tracking-wider text-primary">
        {detail.affaire_numero}
      </p>
      <h1 className="mt-1 text-lg font-bold leading-tight text-foreground">
        {detail.affaire_nom}
      </h1>
      {detail.client && (
        <p className="mt-0.5 text-xs text-muted-foreground">Client : {detail.client}</p>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {formatRange(detail.date_debut, detail.date_fin)}
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
            countdown.tone === "now" && "bg-primary text-primary-foreground",
            countdown.tone === "soon" && "bg-amber-500/15 text-amber-600 dark:text-amber-400",
            countdown.tone === "later" && "bg-muted text-muted-foreground",
            countdown.tone === "past" && "bg-muted/60 text-muted-foreground",
          )}
        >
          {countdown.label}
        </span>
      </div>
    </section>
  );
}

// --- Mes assignations ------------------------------------------------------
function MesAssignations({ detail }: { detail: CarteMissionDetail }) {
  if (detail.assignations.length === 0) return null;
  const totalH = detail.assignations.reduce((acc, a) => acc + a.heures, 0);
  return (
    <section data-testid="mission-mes-assignations">
      <p className="overline mb-2 flex items-center justify-between">
        <span>— Mes créneaux ({detail.assignations.length})</span>
        <span className="text-[10px] font-medium normal-case tracking-normal text-muted-foreground">
          {totalH}h
        </span>
      </p>
      <ul className="space-y-1.5">
        {detail.assignations.map((a) => (
          <li
            key={a.id}
            className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2 text-sm"
          >
            <span className="capitalize text-foreground">
              {format(parseISO(a.date), "EEE d MMM", { locale: fr })}
            </span>
            <span className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">
                {a.demi_journee === "JOURNEE" ? "Journée" : a.demi_journee}
              </span>
              <span className="font-mono font-semibold text-foreground">{a.heures}h</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// --- Infos terrain ---------------------------------------------------------
function InfosTerrainSection({ detail }: { detail: CarteMissionDetail }) {
  const hasAny = detail.lieu || detail.acces_livraison || detail.code_acces || detail.consignes_tenue;
  if (!hasAny) {
    return (
      <section data-testid="mission-infos-empty">
        <p className="overline mb-2">— Infos terrain</p>
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          Aucune info renseignée. Demande au chef ou au commercial de compléter la fiche.
        </div>
      </section>
    );
  }
  return (
    <section data-testid="mission-infos">
      <p className="overline mb-2">— Infos terrain</p>
      <div className="space-y-2 rounded-2xl border border-border bg-card p-3 text-sm">
        {detail.lieu && (
          <InfoLine
            icon={<MapPin className="h-3.5 w-3.5" />}
            label="Lieu"
            value={detail.lieu}
            action={
              <a
                className="inline-flex items-center gap-1 text-primary hover:underline"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(detail.lieu)}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Ouvrir l'itinéraire (Google Maps universel iOS/Android)"
              >
                <NavIcon className="h-3 w-3" />
                GPS
              </a>
            }
          />
        )}
        {detail.acces_livraison && (
          <InfoLine
            icon={<NavIcon className="h-3.5 w-3.5" />}
            label="Accès livraison"
            value={detail.acces_livraison}
          />
        )}
        {detail.code_acces && (
          <InfoLine icon={<HardHat className="h-3.5 w-3.5" />} label="Code" value={detail.code_acces} mono />
        )}
        {detail.consignes_tenue && (
          <InfoLine
            icon={<Shirt className="h-3.5 w-3.5" />}
            label="Tenue"
            value={detail.consignes_tenue}
          />
        )}
      </div>
    </section>
  );
}

function InfoLine({
  icon,
  label,
  value,
  action,
  mono = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  action?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className={cn("text-sm text-foreground", mono && "font-mono font-bold")}>
          {value}
        </p>
      </div>
      {action && <div className="text-xs">{action}</div>}
    </div>
  );
}

// --- Contacts --------------------------------------------------------------
function ContactsSection({ detail }: { detail: CarteMissionDetail }) {
  const siteContact =
    detail.contact_site_nom || detail.contact_site_tel
      ? { nom: detail.contact_site_nom, tel: detail.contact_site_tel }
      : null;
  const chefContact = detail.chef_chantier
    ? {
        nom: [detail.chef_chantier.prenom, detail.chef_chantier.nom].filter(Boolean).join(" "),
        tel: detail.chef_chantier.telephone,
      }
    : null;
  if (!siteContact && !chefContact) return null;
  return (
    <section data-testid="mission-contacts">
      <p className="overline mb-2">— Contacts</p>
      <div className="space-y-2">
        {siteContact && <ContactCard role="Contact site" nom={siteContact.nom} tel={siteContact.tel} />}
        {chefContact && (
          <ContactCard role="Chef d'équipe Setup" nom={chefContact.nom || "—"} tel={chefContact.tel} />
        )}
      </div>
    </section>
  );
}

function ContactCard({
  role,
  nom,
  tel,
}: {
  role: string;
  nom: string | null;
  tel: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-card p-3">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {role}
        </p>
        <p className="truncate text-sm font-semibold text-foreground">{nom ?? "—"}</p>
        {tel && (
          <p className="font-mono text-xs text-muted-foreground">{tel}</p>
        )}
      </div>
      {tel ? (
        <a
          href={`tel:${tel.replace(/\s/g, "")}`}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground active:scale-95"
          aria-label={`Appeler ${nom ?? ""}`}
        >
          <Phone className="h-4 w-4" />
        </a>
      ) : (
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Pas de tel
        </span>
      )}
    </div>
  );
}

// --- Équipe ----------------------------------------------------------------
function EquipeSection({ detail }: { detail: CarteMissionDetail }) {
  if (detail.equipe.length === 0) return null;
  return (
    <section data-testid="mission-equipe">
      <p className="overline mb-2 flex items-center gap-1.5">
        <Users className="h-3 w-3" />— Équipe ({detail.equipe.length})
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {detail.equipe.map((m) => (
          <li
            key={m.employe_id}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium",
              m.est_moi
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground",
            )}
          >
            {m.prenom} {m.nom}
            {m.est_moi && <span className="ml-1 opacity-80">(moi)</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

// --- Events timeline -------------------------------------------------------
function EventsTimeline({ events }: { events: MissionEvent[] }) {
  if (events.length === 0) {
    return (
      <section data-testid="mission-events-empty">
        <p className="overline mb-2">— Journal</p>
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          Aucun événement encore. Utilisez les boutons en bas pour marquer votre arrivée.
        </div>
      </section>
    );
  }
  return (
    <section data-testid="mission-events">
      <p className="overline mb-2">— Journal ({events.length})</p>
      <ul className="space-y-2">
        {events.map((e) => (
          <li key={e.id} className="flex items-start gap-2 rounded-xl border border-border bg-card p-2.5">
            <EventIcon type={e.type} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-foreground">{eventLabel(e.type)}</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {format(parseISO(e.occurred_at), "d MMM HH:mm", { locale: fr })}
                </span>
              </div>
              {e.note && <p className="mt-0.5 text-xs text-foreground">{e.note}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EventIcon({ type }: { type: MissionEvent["type"] }) {
  const map = {
    arrivee: { Icon: LogIn, cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
    depart: { Icon: LogOut, cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
    probleme: { Icon: AlertTriangle, cls: "bg-destructive/15 text-destructive" },
    photo: { Icon: Camera, cls: "bg-muted text-foreground" },
    message: { Icon: MessageSquare, cls: "bg-muted text-foreground" },
  } as const;
  const { Icon, cls } = map[type];
  return (
    <span className={cn("flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg", cls)}>
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}

function eventLabel(t: MissionEvent["type"]) {
  switch (t) {
    case "arrivee":
      return "Arrivée sur site";
    case "depart":
      return "Départ du site";
    case "probleme":
      return "Problème signalé";
    case "photo":
      return "Photo ajoutée";
    case "message":
      return "Message";
  }
}

// --- Actions bar -----------------------------------------------------------
function ActionsBar({
  affaireId,
  phase,
  onRecorded,
}: {
  affaireId: string;
  phase: MissionPhase;
  onRecorded: () => void;
}) {
  const [busy, setBusy] = useState<null | "arrivee" | "depart">(null);
  const [problemeOpen, setProblemeOpen] = useState(false);
  const recordFn = useServerFn(recordMissionEvent);

  async function record(type: "arrivee" | "depart") {
    setBusy(type);
    try {
      let latitude: number | null = null;
      let longitude: number | null = null;
      // Best-effort geoloc
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              timeout: 5000,
              maximumAge: 60_000,
            }),
          );
          latitude = pos.coords.latitude;
          longitude = pos.coords.longitude;
        } catch {
          // ignore — l'event reste valide sans coords
        }
      }
      await recordFn({ data: { affaireId, phase, type, latitude, longitude } });
      toast.success(type === "arrivee" ? "Arrivée enregistrée" : "Départ enregistré");
      onRecorded();
    } catch (e) {
      toast.error("Échec de l'enregistrement", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 backdrop-blur"
        data-testid="mission-actions-bar"
      >
        <div className="mx-auto grid max-w-md grid-cols-3 gap-2">
          <Button
            variant="default"
            size="sm"
            disabled={busy !== null}
            onClick={() => record("arrivee")}
            className="h-11"
            data-testid="action-arrivee"
          >
            {busy === "arrivee" ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <LogIn className="mr-1.5 h-4 w-4" />
            )}
            J'arrive
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy !== null}
            onClick={() => record("depart")}
            className="h-11"
            data-testid="action-depart"
          >
            {busy === "depart" ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="mr-1.5 h-4 w-4" />
            )}
            Je pars
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setProblemeOpen(true)}
            className="h-11"
            data-testid="action-probleme"
          >
            <AlertTriangle className="mr-1.5 h-4 w-4" />
            Problème
          </Button>
        </div>
      </div>

      <SignalProblemeDialog
        open={problemeOpen}
        onOpenChange={setProblemeOpen}
        affaireId={affaireId}
        phase={phase}
        onSent={onRecorded}
      />
    </>
  );
}

const SEVERITY_CHOICES: {
  value: "info" | "warning" | "urgent" | "bloque";
  label: string;
  hint: string;
  cls: string;
}[] = [
  { value: "info", label: "ℹ️ Info", hint: "Pour info", cls: "border-muted-foreground/40" },
  { value: "warning", label: "⚠️ Attention", hint: "À surveiller", cls: "border-amber-500/60 text-amber-700 dark:text-amber-400" },
  { value: "urgent", label: "🚨 Urgent", hint: "Intervention rapide", cls: "border-orange-600/70 text-orange-700 dark:text-orange-400" },
  { value: "bloque", label: "⛔ Bloqué", hint: "Chantier à l'arrêt", cls: "border-destructive text-destructive" },
];

function SignalProblemeDialog({
  open,
  onOpenChange,
  affaireId,
  phase,
  onSent,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  affaireId: string;
  phase: MissionPhase;
  onSent: () => void;
}) {
  const [note, setNote] = useState("");
  const [severity, setSeverity] = useState<"info" | "warning" | "urgent" | "bloque">("warning");
  const [busy, setBusy] = useState(false);
  const recordFn = useServerFn(recordMissionEvent);

  // reset à l'ouverture
  useEffect(() => {
    if (open) {
      setNote("");
      setSeverity("warning");
    }
  }, [open]);

  async function submit() {
    if (note.trim().length === 0) {
      toast.error("Décris brièvement le problème");
      return;
    }
    setBusy(true);
    try {
      // GPS best-effort (timeout 4s)
      let latitude: number | null = null;
      let longitude: number | null = null;
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              timeout: 4000,
              maximumAge: 60_000,
            }),
          );
          latitude = pos.coords.latitude;
          longitude = pos.coords.longitude;
        } catch {
          // ignore
        }
      }

      const res = await recordFn({
        data: {
          affaireId,
          phase,
          type: "probleme",
          note: note.trim(),
          severity,
          latitude,
          longitude,
        },
      });
      const chefLabel = res?.chefName ?? "Le chef d'équipe";
      toast.success("Problème signalé.", {
        description: `${chefLabel} a été prévenu${severity === "urgent" || severity === "bloque" ? " en priorité" : ""}.`,
      });
      onOpenChange(false);
      onSent();
    } catch (e) {
      toast.error("Échec de l'envoi", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Signaler un problème
          </DialogTitle>
          <DialogDescription>
            Le chef d'équipe est notifié immédiatement avec ta géolocalisation.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Sévérité
            </Label>
            <div
              className="mt-1.5 grid grid-cols-2 gap-1.5"
              role="radiogroup"
              aria-label="Sévérité"
            >
              {SEVERITY_CHOICES.map((s) => {
                const active = severity === s.value;
                return (
                  <button
                    key={s.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    data-testid={`probleme-severity-${s.value}`}
                    onClick={() => setSeverity(s.value)}
                    className={cn(
                      "rounded-xl border-2 px-2.5 py-2 text-left text-xs transition-colors active:scale-[0.98]",
                      s.cls,
                      active ? "bg-accent/50 ring-1 ring-primary" : "bg-card hover:bg-accent/30",
                    )}
                  >
                    <div className="font-semibold">{s.label}</div>
                    <div className="text-[10px] text-muted-foreground">{s.hint}</div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="probleme-note" className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Description (obligatoire)
            </Label>
            <Textarea
              id="probleme-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Ex : accès bloqué, matériel manquant, équipe sous-dimensionnée…"
              data-testid="probleme-note-input"
            />
            <p className="text-right text-[10px] text-muted-foreground">{note.length}/2000</p>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Astuce : pour joindre une photo, ferme cette fenêtre et utilise le bouton appareil photo
            en bas à droite — elle sera taguée automatiquement « incident ».
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            onClick={submit}
            disabled={busy || note.trim().length === 0}
            data-testid="probleme-submit"
            className="min-w-32"
          >
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Signaler
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
function formatRange(start: string, end: string) {
  const d1 = parseISO(start);
  const d2 = parseISO(end);
  if (start === end) return format(d1, "EEEE d MMMM", { locale: fr });
  return `${format(d1, "d MMM", { locale: fr })} – ${format(d2, "d MMM yyyy", { locale: fr })}`;
}

function countdownLabel(
  start: string,
  end: string,
): { label: string; tone: "now" | "soon" | "later" | "past" } {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  if (end < todayStr) return { label: "Mission passée", tone: "past" };
  if (start <= todayStr) return { label: "Aujourd'hui", tone: "now" };
  const diff = Math.ceil((parseISO(start).getTime() - today.getTime()) / 86_400_000);
  if (diff === 1) return { label: "Demain", tone: "soon" };
  if (diff <= 7) return { label: `Dans ${diff} j`, tone: "soon" };
  return { label: `Dans ${diff} j`, tone: "later" };
}

// ---------------------------------------------------------------------------
// Bloc 9 Lot 9.4 — Section heures pré-remplie depuis events arrivee/depart
// ---------------------------------------------------------------------------
function MesHeuresSection({
  detail,
  onSaved,
}: {
  detail: CarteMissionDetail;
  onSaved: () => void;
}) {
  // Date "active" = aujourd'hui si dans la fenêtre, sinon dernière date avec events
  const today = new Date().toISOString().slice(0, 10);
  const eventDates = Array.from(
    new Set(detail.events.map((e) => e.occurred_at.slice(0, 10))),
  ).sort();
  const activeDate = eventDates.includes(today)
    ? today
    : (eventDates[eventDates.length - 1] ?? null);

  const computed = useMemo(
    () => (activeDate ? computeHeuresFromEvents(detail.events, activeDate) : null),
    [detail.events, activeDate],
  );

  const [debut, setDebut] = useState(computed?.heure_debut ?? "");
  const [fin, setFin] = useState(computed?.heure_fin ?? "");
  const [commentaire, setCommentaire] = useState("");
  const [pauseMin, setPauseMin] = useState<number>(60);
  const [submitting, setSubmitting] = useState(false);

  // re-sync si computed change
  useEffect(() => {
    if (computed) {
      setDebut(computed.heure_debut);
      setFin(computed.heure_fin);
    }
  }, [computed?.heure_debut, computed?.heure_fin]);

  // Section masquée tant qu'aucun depart n'a été enregistré
  const hasDepart = detail.events.some((e) => e.type === "depart");
  if (!hasDepart || !activeDate) return null;

  // Récupère l'assignation correspondant à la date (sinon la 1ère)
  const matchAssig =
    detail.assignations.find((a) => a.date === activeDate) ??
    detail.assignations[0] ??
    null;

  async function submit() {
    if (!debut || !fin || !matchAssig) return;
    setSubmitting(true);
    try {
      const [hd, md] = debut.split(":").map(Number);
      const [hf, mf] = fin.split(":").map(Number);
      const dureeMin = Math.max(0, hf * 60 + mf - (hd * 60 + md) - pauseMin);
      const heuresReelles = Math.round((dureeMin / 60) * 100) / 100;

      // Résoudre employe_id
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Non authentifié");
      const { data: emp } = await supabase
        .from("employes")
        .select("id")
        .eq("profile_id", userId)
        .maybeSingle();
      if (!emp) throw new Error("Profil employé introuvable");

      // Upsert sur (employe, date, affaire)
      const { data: existing } = await supabase
        .from("heures_saisies")
        .select("id")
        .eq("employe_id", emp.id)
        .eq("date", activeDate)
        .eq("affaire_id", detail.affaire_id)
        .maybeSingle();

      const payload = {
        employe_id: emp.id,
        date: activeDate,
        affaire_id: detail.affaire_id,
        assignation_id: matchAssig.id,
        metier_id: matchAssig.metier_id,
        heure_debut: debut + ":00",
        heure_fin: fin + ":00",
        duree_pause_minutes: pauseMin,
        heures_reelles: heuresReelles,
        heures_nuit: 0,
        commentaire: commentaire.trim() || null,
        statut: "soumis" as const,
        saisi_par: userId,
        saisi_par_chef: false,
      };

      if (existing) {
        const { error } = await supabase
          .from("heures_saisies")
          .update(payload)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("heures_saisies").insert(payload);
        if (error) throw error;
      }
      toast.success("Heures envoyées au chef pour validation");
      onSaved();
    } catch (e) {
      toast.error("Échec de l'enregistrement", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section data-testid="mission-heures-section">
      <p className="overline mb-2">— Mes heures sur cette mission</p>
      <div className="space-y-3 rounded-2xl border border-border bg-card p-3">
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label htmlFor="h-debut" className="text-[10px] uppercase tracking-wider">
              Début
            </Label>
            <Input
              id="h-debut"
              data-testid="mission-heures-debut"
              type="time"
              value={debut}
              onChange={(e) => setDebut(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="h-fin" className="text-[10px] uppercase tracking-wider">
              Fin
            </Label>
            <Input
              id="h-fin"
              data-testid="mission-heures-fin"
              type="time"
              value={fin}
              onChange={(e) => setFin(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="h-pause" className="text-[10px] uppercase tracking-wider">
              Pause (min)
            </Label>
            <Input
              id="h-pause"
              type="number"
              min={0}
              max={240}
              value={pauseMin}
              onChange={(e) => setPauseMin(Number(e.target.value) || 0)}
            />
          </div>
        </div>
        <Textarea
          value={commentaire}
          onChange={(e) => setCommentaire(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Commentaire (optionnel)"
        />
        <Button
          onClick={submit}
          disabled={submitting || !debut || !fin || !matchAssig}
          className="w-full h-10"
          data-testid="mission-heures-submit"
        >
          {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Envoyer au chef
        </Button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Bloc 9 Lot 9.4 — Bouton photo flottant (auto-tag selon état mission)
// ---------------------------------------------------------------------------
function PhotoFab({
  affaireId,
  phase,
  events,
  onUploaded,
}: {
  affaireId: string;
  phase: MissionPhase;
  events: MissionEvent[];
  onUploaded: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const recordFn = useServerFn(recordMissionEvent);
  const hasArrivee = events.some((e) => e.type === "arrivee");
  const hasDepart = events.some((e) => e.type === "depart");
  // Heuristique : un signalement "ouvert" = problème dans les 2 dernières heures
  const problemeOpen = events.some(
    (e) =>
      e.type === "probleme" &&
      Date.now() - new Date(e.occurred_at).getTime() < 2 * 3600_000,
  );
  const categorie: PhotoCategorie = autoTagCategoryByMissionState(phase, {
    hasArrivee,
    hasDepart,
    problemeOpen,
  });

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Non authentifié");
      const compressed = await compressImageIfPossible(file);
      if (compressed.compressedSize > 10 * 1024 * 1024) {
        throw new Error("Photo > 10 Mo après compression");
      }
      const docId = crypto.randomUUID();
      const storagePath = `${affaireId}/${docId}.${compressed.extension}`;
      const { error: upErr } = await supabase.storage
        .from("affaires-photos")
        .upload(storagePath, compressed.blob, {
          contentType: compressed.mimeType,
          upsert: false,
        });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from("affaire_documents").insert({
        id: docId,
        affaire_id: affaireId,
        storage_path: storagePath,
        filename: file.name,
        mime_type: compressed.mimeType,
        taille_bytes: compressed.compressedSize,
        uploaded_by: userId,
        categorie,
        mission_phase: phase,
      } as never);
      if (insErr) {
        await supabase.storage.from("affaires-photos").remove([storagePath]);
        throw insErr;
      }
      // Journalise dans mission_events pour apparaître dans la timeline
      await recordFn({
        data: { affaireId, phase, type: "photo", photoDocId: docId, note: categorie },
      });
      toast.success("Photo ajoutée", { description: `Tag : ${categorie}` });
      onUploaded();
    } catch (err) {
      toast.error("Échec de l'envoi", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+5rem)] right-4 z-40 flex flex-col items-end gap-1"
      data-testid="mission-photo-fab"
    >
      <span
        className="rounded-full bg-card/95 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground shadow"
        data-testid="mission-photo-categorie"
      >
        {categorie.replace(/_/g, " ")}
      </span>
      <label
        className={cn(
          "flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95",
          busy && "opacity-60",
        )}
        aria-label="Prendre une photo"
      >
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Camera className="h-6 w-6" />
        )}
        <input
          data-testid="mission-photo-input"
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          disabled={busy}
          onChange={onFile}
        />
      </label>
    </div>
  );
}
