import { createFileRoute } from "@tanstack/react-router";
import { requireCapability } from "@/lib/capability-guard";
import { useEffect, useState, useRef, useCallback } from "react";
import { Loader2, Paperclip, Send, X, Trash2, Download, AtSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/affaires/$affaireId/journal")({
  beforeLoad: () => requireCapability("section.affaires"),
  component: JournalPage,
});

interface Profile {
  id: string;
  full_name: string | null;
  email: string;
}

interface Attachment {
  path: string;
  name: string;
  size: number;
  type: string;
}

interface Commentaire {
  id: string;
  affaire_id: string;
  author_id: string;
  body: string;
  mentions: string[];
  attachments: Attachment[];
  created_at: string;
  author?: Profile;
}

function initials(p?: Profile | null) {
  if (!p) return "??";
  if (p.full_name) {
    const parts = p.full_name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "??";
  }
  return p.email.slice(0, 2).toUpperCase();
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} o`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} Ko`;
  return `${(b / 1024 / 1024).toFixed(1)} Mo`;
}

function JournalPage() {
  const { affaireId } = Route.useParams();
  const { user } = useAuth();
  const [comments, setComments] = useState<Commentaire[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchComments = useCallback(async () => {
    const { data } = await supabase
      .from("affaire_commentaires")
      .select("*")
      .eq("affaire_id", affaireId)
      .order("created_at", { ascending: false });

    if (!data) {
      setComments([]);
      return;
    }
    // Récup auteurs
    const ids = Array.from(new Set(data.map((c) => c.author_id)));
    const { data: profs } = ids.length
      ? await supabase.from("profiles").select("id, full_name, email").in("id", ids)
      : { data: [] as Profile[] };
    const profMap = new Map((profs ?? []).map((p) => [p.id, p as Profile]));
    setComments(
      data.map((c) => ({
        ...(c as unknown as Commentaire),
        attachments: ((c.attachments as unknown) as Attachment[]) ?? [],
        mentions: ((c.mentions as unknown) as string[]) ?? [],
        author: profMap.get(c.author_id),
      })),
    );
  }, [affaireId]);

  // Initial load + realtime
  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      fetchComments(),
      supabase.from("profiles").select("id, full_name, email").order("full_name").then(({ data }) => {
        if (active) setProfiles((data as Profile[]) ?? []);
      }),
    ]).then(() => active && setLoading(false));

    const channel = supabase
      .channel(`comments:${affaireId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "affaire_commentaires",
          filter: `affaire_id=eq.${affaireId}`,
        },
        () => fetchComments(),
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [affaireId, fetchComments]);

  // Détection @mention en cours de saisie
  const onBodyChange = (val: string) => {
    setBody(val);
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const before = val.slice(0, pos);
    const m = before.match(/@(\w*)$/);
    if (m) {
      setShowMentions(true);
      setMentionQuery(m[1].toLowerCase());
    } else {
      setShowMentions(false);
    }
  };

  // Map { token (sans @, lowercase) → Set<profile_id> } construite au clic.
  // Plusieurs profils peuvent partager un token (ex: deux "Jean") → on les notifie tous.
  const mentionedIdsRef = useRef<Map<string, Set<string>>>(new Map());

  const tokenForProfile = (p: Profile) =>
    ((p.full_name ?? p.email).split(/\s+/)[0] || p.email.split("@")[0]).toLowerCase();

  const insertMention = (p: Profile) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const token = tokenForProfile(p);
    const before = body.slice(0, pos).replace(/@\w*$/, `@${token} `);
    const after = body.slice(pos);
    setBody(before + after);
    setShowMentions(false);
    // Tracking déterministe : on stocke l'id réel du profil cliqué pour ce token.
    const set = mentionedIdsRef.current.get(token) ?? new Set<string>();
    set.add(p.id);
    mentionedIdsRef.current.set(token, set);
    setTimeout(() => ta.focus(), 0);
  };

  // À la soumission : on ne garde que les ids dont le token est encore présent dans le body.
  // Aucun re-parsing heuristique → pas de collision possible avec un homonyme non cliqué.
  const collectMentions = (text: string): string[] => {
    const tags = text.match(/@(\w+)/g);
    if (!tags) return [];
    const presentTokens = new Set(tags.map((t) => t.slice(1).toLowerCase()));
    const ids = new Set<string>();
    for (const token of presentTokens) {
      const tracked = mentionedIdsRef.current.get(token);
      if (tracked) tracked.forEach((id) => ids.add(id));
    }
    return Array.from(ids);
  };

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const arr = Array.from(e.target.files);
    setPendingFiles((prev) => [...prev, ...arr].slice(0, 10));
    e.target.value = "";
  };

  const removePending = (idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const submit = async () => {
    if (!user) return;
    if (!body.trim() && pendingFiles.length === 0) return;
    setSubmitting(true);
    try {
      const uploaded: Attachment[] = [];
      for (const file of pendingFiles) {
        const safe = file.name.replace(/[^\w.-]/g, "_");
        const path = `${affaireId}/${Date.now()}_${safe}`;
        const { error: upErr } = await supabase.storage
          .from("affaire-attachments")
          .upload(path, file);
        if (upErr) {
          toast.error(`Échec upload ${file.name}: ${upErr.message}`);
          continue;
        }
        uploaded.push({ path, name: file.name, size: file.size, type: file.type });
      }

      const mentions = collectMentions(body);

      const { error } = await supabase.from("affaire_commentaires").insert({
        affaire_id: affaireId,
        author_id: user.id,
        body: body.trim(),
        mentions,
        attachments: uploaded as never,
      });
      if (error) {
        toast.error(`Erreur : ${error.message}`);
      } else {
        setBody("");
        setPendingFiles([]);
        mentionedIdsRef.current.clear();
        toast.success("Commentaire publié");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const deleteComment = async (id: string) => {
    if (!confirm("Supprimer ce commentaire ?")) return;
    const c = comments.find((x) => x.id === id);
    // Supprimer les attachments du storage
    if (c?.attachments?.length) {
      await supabase.storage
        .from("affaire-attachments")
        .remove(c.attachments.map((a) => a.path));
    }
    const { error } = await supabase.from("affaire_commentaires").delete().eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Supprimé");
  };

  const downloadAttachment = async (att: Attachment) => {
    const { data, error } = await supabase.storage
      .from("affaire-attachments")
      .createSignedUrl(att.path, 60);
    if (error || !data) {
      toast.error("Téléchargement impossible");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  const filteredProfiles = profiles
    .filter((p) =>
      mentionQuery === ""
        ? true
        : (p.full_name ?? p.email).toLowerCase().includes(mentionQuery),
    )
    .slice(0, 6);

  return (
    <div className="space-y-6">
      {/* Composer */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="relative">
          <Textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => onBodyChange(e.target.value)}
            placeholder="Ajouter un commentaire… utilisez @prénom pour mentionner"
            className="min-h-[80px] resize-none"
          />
          {showMentions && filteredProfiles.length > 0 && (
            <div className="absolute z-10 mt-1 w-64 rounded-lg border border-border bg-popover p-1 shadow-lg">
              {filteredProfiles.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => insertMention(p)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  <AtSign className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium">{p.full_name ?? p.email.split("@")[0]}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{p.email}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {pendingFiles.length > 0 && (
          <ul className="mt-3 space-y-1">
            {pendingFiles.map((f, idx) => (
              <li key={idx} className="flex items-center gap-2 rounded bg-muted/50 px-2 py-1 text-xs">
                <Paperclip className="h-3 w-3 text-muted-foreground" />
                <span className="flex-1 truncate">{f.name}</span>
                <span className="text-muted-foreground">{formatBytes(f.size)}</span>
                <button
                  type="button"
                  onClick={() => removePending(idx)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={submitting}
          >
            <Paperclip className="h-3 w-3" /> Joindre
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={onPickFiles}
          />
          <Button
            size="sm"
            onClick={submit}
            disabled={submitting || (!body.trim() && pendingFiles.length === 0)}
          >
            {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            Publier
          </Button>
        </div>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : comments.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Aucun commentaire. Soyez le premier à publier.
        </p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="text-xs">{initials(c.author)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold">
                      {c.author?.full_name ?? c.author?.email ?? "—"}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{formatDateTime(c.created_at)}</span>
                      {(user?.id === c.author_id) && (
                        <button
                          onClick={() => deleteComment(c.id)}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="Supprimer"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  {c.body && (
                    <p className="mt-1 whitespace-pre-wrap text-sm">
                      {c.body.split(/(@\w+)/g).map((part, i) =>
                        part.startsWith("@") ? (
                          <span key={i} className="font-medium text-primary">{part}</span>
                        ) : (
                          <span key={i}>{part}</span>
                        ),
                      )}
                    </p>
                  )}
                  {c.attachments?.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {c.attachments.map((a, i) => (
                        <li key={i}>
                          <button
                            onClick={() => downloadAttachment(a)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs hover:border-primary/40 hover:text-primary"
                          >
                            <Download className="h-3 w-3" />
                            <span className="truncate max-w-[180px]">{a.name}</span>
                            <span className="text-muted-foreground">{formatBytes(a.size)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {c.mentions?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {c.mentions.map((m) => {
                        const p = profiles.find((x) => x.id === m);
                        return (
                          <Badge key={m} variant="secondary" className="text-[10px]">
                            <AtSign className="h-2.5 w-2.5" />
                            {p?.full_name?.split(" ")[0] ?? p?.email?.split("@")[0] ?? "user"}
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
