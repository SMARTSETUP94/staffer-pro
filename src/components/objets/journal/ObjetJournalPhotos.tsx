/**
 * LOT A1 — Onglet « Journal » de la fiche objet.
 *
 * Un fil chronologique unique (événements auto-loggés + commentaires + photos),
 * filtrable par type, avec ajout de commentaire en bas du fil, upload de photo
 * compressée en WebP et galerie groupée par étape.
 *
 * Capabilities : lecture `objet.view`, commentaire `objet.edit`,
 * upload `objet.photo.upload`, suppression `objet.photo.delete`.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Camera,
  CheckCircle2,
  Circle,
  Flag,
  Loader2,
  MessageSquare,
  Pencil,
  RefreshCw,
  Send,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  XCircle,
  FileCheck2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useCapability } from "@/hooks/use-capability";
import { compressImageIfPossible } from "@/lib/image-compression";
import {
  filterObjetFeed,
  groupPhotosByEtape,
  OBJET_FEED_FILTER_LABELS,
  type ObjetFeedEntry,
  type ObjetFeedFilter,
  type RawPhoto,
} from "@/lib/objet-feed";
import { getObjetFeed } from "@/lib/server-fns/objet-feed.functions";
import {
  addObjetCommentaire,
  deleteObjetCommentaire,
} from "@/lib/server-fns/objet-commentaires.functions";
import {
  buildPhotoStoragePath,
  registerObjetPhoto,
  softDeleteObjetPhoto,
} from "@/lib/server-fns/objet-photos.functions";
import { ObjetPhotoThumb } from "./ObjetPhotoThumb";

const PHOTO_BUCKET = "fabrication-photos";
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

const EVENT_META: Record<
  string,
  { label: string; icon: React.ElementType; color: string }
> = {
  journal_started: { label: "Journal ouvert", icon: Flag, color: "text-muted-foreground" },
  etape_validee: { label: "Étape validée", icon: CheckCircle2, color: "text-emerald-600" },
  etape_invalidee: { label: "Étape invalidée", icon: XCircle, color: "text-amber-600" },
  etape_statut_change: { label: "Statut d'étape modifié", icon: Circle, color: "text-sky-600" },
  photo_uploaded: { label: "Photo ajoutée", icon: Camera, color: "text-indigo-600" },
  photo_supprimee: { label: "Photo retirée", icon: Trash2, color: "text-rose-600" },
  commentaire: { label: "Commentaire", icon: MessageSquare, color: "text-sky-700" },
  commentaire_supprime: { label: "Commentaire retiré", icon: Trash2, color: "text-rose-600" },
  identite_modifiee: { label: "Identité modifiée", icon: Pencil, color: "text-muted-foreground" },
  plan_republie: { label: "Plan républié", icon: RefreshCw, color: "text-amber-700" },
  plan_publie: { label: "Plan technique publié", icon: FileCheck2, color: "text-emerald-700" },
  personne_assignee: { label: "Personne assignée", icon: UserPlus, color: "text-sky-700" },
  personne_retiree: { label: "Personne retirée", icon: UserMinus, color: "text-rose-600" },
  presence_modifiee: { label: "Présence modifiée", icon: Users, color: "text-muted-foreground" },
  photo: { label: "Photo", icon: Camera, color: "text-indigo-600" },
};

const FILTERS: ObjetFeedFilter[] = [
  "all",
  "etapes",
  "photos",
  "commentaires",
  "plan",
  "equipe",
];

const ETAPE_LABELS: Record<string, string> = {
  be: "Bureau d'étude",
  usinage: "Usinage",
  respo_fab: "Responsable fabrication",
  finition: "Finition",
  manutention: "Manutention",
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Props {
  objetId: string;
  affaireId: string;
}

export function ObjetJournalPhotos({ objetId, affaireId }: Props) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<ObjetFeedFilter>("all");
  const [comment, setComment] = useState("");
  const [uploading, setUploading] = useState(false);

  // Capabilities dédiées à la fiche objet (bloc 8.1) : commentaire `objet.edit`,
  // upload `objet.photo.upload`, suppression `objet.photo.delete` (admin only).
  const canEdit = useCapability("objet.edit");
  const canUpload = useCapability("objet.photo.upload");
  const canDeletePhoto = useCapability("objet.photo.delete");

  const fetchFeed = useServerFn(getObjetFeed);
  const addComment = useServerFn(addObjetCommentaire);
  const delComment = useServerFn(deleteObjetCommentaire);
  const registerPhoto = useServerFn(registerObjetPhoto);
  const delPhoto = useServerFn(softDeleteObjetPhoto);

  const feedQuery = useQuery({
    queryKey: ["objet-feed", objetId],
    queryFn: () => fetchFeed({ data: { objetId, limit: 200 } }),
    staleTime: 15_000,
  });

  const etapesQuery = useQuery({
    queryKey: ["objet-etapes-labels", objetId],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("fabrication_etapes")
        .select("id, type_etape")
        .eq("objet_id", objetId);
      const map: Record<string, string> = {};
      (data ?? []).forEach((e) => {
        map[e.id] = ETAPE_LABELS[e.type_etape] ?? e.type_etape;
      });
      return map;
    },
  });

  const etapeLabels = etapesQuery.data ?? {};
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["objet-feed", objetId] });
    void qc.invalidateQueries({ queryKey: ["objet-journal", objetId] });
  };

  const entries: ObjetFeedEntry[] = useMemo(
    () => filterObjetFeed(feedQuery.data?.entries ?? [], filter),
    [feedQuery.data, filter],
  );
  const photoGroups = useMemo(
    () => groupPhotosByEtape((feedQuery.data?.photos ?? []) as RawPhoto[]),
    [feedQuery.data],
  );

  const addMut = useMutation({
    mutationFn: (content: string) => addComment({ data: { objetId, affaireId, content } }),
    onSuccess: () => {
      setComment("");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const delCommentMut = useMutation({
    mutationFn: (id: string) => delComment({ data: { id } }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const delPhotoMut = useMutation({
    mutationFn: (id: string) => delPhoto({ data: { id } }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    let ok = 0;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name} : seules les images sont acceptées.`);
        continue;
      }
      const compressed = await compressImageIfPossible(file, { format: "webp" });
      if (compressed.compressedSize > MAX_PHOTO_BYTES) {
        toast.error(`${file.name} : fichier trop volumineux (max 10 Mo).`);
        continue;
      }
      const storagePath = buildPhotoStoragePath({
        affaireId,
        objetId,
        filename: file.name.replace(/\.[^.]+$/, `.${compressed.extension}`),
      });
      const { error: upErr } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(storagePath, compressed.blob, {
          contentType: compressed.mimeType,
          upsert: false,
        });
      if (upErr) {
        toast.error(`${file.name} : ${upErr.message}`);
        continue;
      }
      try {
        await registerPhoto({
          data: {
            objetId,
            affaireId,
            storagePath,
            sizeBytes: compressed.compressedSize,
          },
        });
        ok += 1;
      } catch (e) {
        await supabase.storage.from(PHOTO_BUCKET).remove([storagePath]);
        toast.error(e instanceof Error ? e.message : "Erreur d'enregistrement");
      }
    }
    setUploading(false);
    if (ok > 0) {
      toast.success(ok > 1 ? `${ok} photos ajoutées` : "Photo ajoutée");
      invalidate();
    }
  }

  if (feedQuery.isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    );
  }

  if (feedQuery.isError) {
    return <p className="text-sm text-destructive">Erreur de chargement du journal.</p>;
  }

  return (
    <div className="space-y-4" data-testid="objet-journal-photos">
      {/* Filtres */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Button
            key={f}
            type="button"
            size="sm"
            variant={filter === f ? "default" : "outline"}
            className="h-7 text-xs"
            onClick={() => setFilter(f)}
            data-testid={`journal-filter-${f}`}
          >
            {OBJET_FEED_FILTER_LABELS[f]}
          </Button>
        ))}
      </div>

      {/* Galerie groupée par étape */}
      {(filter === "all" || filter === "photos") && photoGroups.length > 0 && (
        <div className="space-y-3" data-testid="objet-photo-galerie">
          {photoGroups.map((g) => (
            <div key={g.etapeId ?? "sans-etape"} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[11px]">
                  {g.etapeId ? etapeLabels[g.etapeId] ?? "Étape" : "Sans étape"}
                </Badge>
                <span className="text-[11px] text-muted-foreground">
                  {g.photos.length} photo{g.photos.length > 1 ? "s" : ""}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
                {g.photos.map((p) => (
                  <div key={p.id} className="relative">
                    <ObjetPhotoThumb
                      photo={p}
                      onClick={() => {
                        const url = p.signed_url ?? p.thumb_url;
                        if (url) window.open(url, "_blank", "noopener,noreferrer");
                      }}
                    />
                    {canDeletePhoto && (
                      <Button
                        type="button"
                        size="icon"
                        variant="secondary"
                        className="absolute right-1 top-1 h-6 w-6 opacity-80"
                        aria-label="Supprimer la photo"
                        disabled={delPhotoMut.isPending}
                        onClick={() => delPhotoMut.mutate(p.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <Separator />
        </div>
      )}

      {/* Le fil */}
      {entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Aucune entrée pour ce filtre.
        </p>
      ) : (
        <ol className="space-y-3" data-testid="objet-feed-list">
          {entries.map((e) => {
            const meta = EVENT_META[e.eventType] ?? EVENT_META.journal_started!;
            const Icon = meta.icon;
            return (
              <li key={e.key} className="flex gap-3">
                <div className={`mt-0.5 shrink-0 ${meta.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1 rounded-md border bg-muted/20 p-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{meta.label}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {fmtDate(e.at)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    {e.actorLabel && <span>{e.actorLabel}</span>}
                    {e.etapeId && etapeLabels[e.etapeId] && (
                      <Badge variant="outline" className="text-[10px]">
                        {etapeLabels[e.etapeId]}
                      </Badge>
                    )}
                  </div>
                  {e.kind === "commentaire" && (
                    <div className="mt-1.5 flex items-start justify-between gap-2">
                      <p className="whitespace-pre-wrap text-sm">{e.content}</p>
                      {canEdit && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                          aria-label="Supprimer le commentaire"
                          disabled={delCommentMut.isPending}
                          onClick={() => delCommentMut.mutate(e.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                  {e.kind === "photo" && e.photo && (
                    <div className="mt-2 w-28">
                      <ObjetPhotoThumb
                        photo={e.photo}
                        onClick={() => {
                          const url = e.photo?.signed_url ?? e.photo?.thumb_url;
                          if (url) window.open(url, "_blank", "noopener,noreferrer");
                        }}
                      />
                    </div>
                  )}
                  {e.kind === "event" &&
                    e.eventType === "plan_publie" &&
                    typeof e.payload?.["url"] === "string" && (
                      <a
                        href={String(e.payload["url"])}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block break-all text-xs text-primary underline"
                      >
                        {String(e.payload["url"])}
                      </a>
                    )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {/* Actions bas de fil */}
      {(canEdit || canUpload) && <Separator />}

      {canUpload && (
        <div className="flex items-center gap-2">
          <input
            id="objet-photo-input"
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(ev) => {
              void handleFiles(ev.target.files);
              ev.target.value = "";
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={uploading}
            onClick={() => document.getElementById("objet-photo-input")?.click()}
            data-testid="objet-photo-upload"
          >
            {uploading ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Camera className="mr-1.5 h-4 w-4" />
            )}
            Ajouter une photo
          </Button>
          <span className="text-[11px] text-muted-foreground">
            Compressée en WebP, 10 Mo maximum.
          </span>
        </div>
      )}

      {canEdit && (
        <div className="space-y-2">
          <Textarea
            value={comment}
            onChange={(ev) => setComment(ev.target.value)}
            placeholder="Ajouter un commentaire…"
            rows={2}
            maxLength={2000}
            disabled={addMut.isPending}
            data-testid="objet-commentaire-input"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => {
                const t = comment.trim();
                if (t) addMut.mutate(t);
              }}
              disabled={addMut.isPending || !comment.trim()}
              data-testid="objet-commentaire-submit"
            >
              <Send className="mr-1.5 h-4 w-4" />
              Publier
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
