import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Loader2, Paperclip, Download, Eye, Sparkles, FolderPlus } from "lucide-react";
import { useCapability } from "@/hooks/use-capability";
import { JalonnementDialog } from "@/components/logistique/JalonnementDialog";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { listEmailAttachments, getEmailAttachment, type EmailAttachment } from "@/lib/server-fns/shared-inbox-attachments.functions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClientEmailSuggestion } from "@/components/emails/ClientEmailSuggestion";
import { SaveEmailDocumentDialog } from "@/components/emails/SaveEmailDocumentDialog";

export type ReadableEmail = {
  id: string;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  received_at: string;
  body_preview: string | null;
  body_full: string | null;
  body_content_type: string | null;
};

export function EmailReaderDialog({ email, onClose, clientReply = false }: { email: ReadableEmail; onClose: () => void; clientReply?: boolean }) {
  const isHtml = email.body_content_type?.toLowerCase() === "html";
  const body = email.body_full || email.body_preview || "(corps vide)";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="pr-6">{email.subject || "(sans objet)"}</DialogTitle>
          <DialogDescription>
            {email.from_name ? `${email.from_name} · ` : ""}{email.from_email} ·{" "}
            {format(parseISO(email.received_at), "d MMMM yyyy 'à' HH:mm", { locale: fr })}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto space-y-4">
        {clientReply && <ClientEmailSuggestion key={email.id} emailId={email.id} />}
        <div className="overflow-auto rounded-md border bg-background">
          {isHtml ? (
            <iframe
              title="Contenu de l'email"
              sandbox=""
              srcDoc={body}
              className="h-[60vh] w-full bg-white"
            />
          ) : (
            <pre className="whitespace-pre-wrap p-4 text-sm font-sans">{body}</pre>
          )}
        </div>
        <AttachmentsList emailId={email.id} clientReply={clientReply} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function fmtSize(n: number) {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`;
}

/** Pièces jointes, chargées à la demande depuis la boîte Outlook. */
function AttachmentsList({ emailId, clientReply }: { emailId: string; clientReply: boolean }) {
  const list = useServerFn(listEmailAttachments);
  const get = useServerFn(getEmailAttachment);
  const [items, setItems] = useState<EmailAttachment[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const canIA = useCapability("logistique.proposition.validate");
  const canFile = useCapability("section.affaires");
  const [filing, setFiling] = useState<EmailAttachment | null>(null);
  const [jal, setJal] = useState<{ attachmentId: string | null; label: string } | null>(null);
  useEffect(() => {
    let alive = true;
    list({ data: { emailId } })
      .then((r) => alive && setItems(r.filter((a) => !a.isInline || !a.contentType.startsWith("image/") || a.size > 20000)))
      .catch((e) => alive && setErr((e as Error).message));
    return () => { alive = false; };
  }, [emailId, list]);

  const open = async (a: EmailAttachment, mode: "view" | "download") => {
    setBusy(a.id);
    try {
      const f = await get({ data: { emailId, attachmentId: a.id } });
      const bin = atob(f.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: f.contentType }));
      if (mode === "view") window.open(url, "_blank", "noopener");
      else { const l = document.createElement("a"); l.href = url; l.download = f.name; l.click(); }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(null); }
  };

  if (err) return <p className="text-xs text-destructive">Pièces jointes indisponibles : {err}</p>;
  if (!items) return <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Recherche des pièces jointes…</p>;
  const jalDlg = jal && <JalonnementDialog open onOpenChange={(o) => !o && setJal(null)} email={{ emailId, ...jal }} />;
  if (items.length === 0) return (
    <div className="flex items-center gap-2">
      <p className="text-xs text-muted-foreground">Aucune pièce jointe.</p>
      {canIA && <Button size="sm" variant="outline" onClick={() => setJal({ attachmentId: null, label: "le corps de l'email" })}><Sparkles className="mr-1 h-4 w-4" />Lire comme jalonnement</Button>}
      {jalDlg}
    </div>
  );
  const viewable = (t: string) => t.startsWith("image/") || t === "application/pdf" || t.startsWith("text/");
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium flex items-center gap-1"><Paperclip className="h-4 w-4" /> Pièces jointes ({items.length})</p>
      <ul className="divide-y rounded-md border">
        {items.map((a) => (
          <li key={a.id} className="flex items-center gap-2 px-3 py-2 text-sm">
            <span className="flex-1 truncate" title={a.name}>{a.name}</span>
            <span className="text-xs text-muted-foreground">{fmtSize(a.size)}</span>
            {busy === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <>
                {viewable(a.contentType) && (
                  <Button size="sm" variant="ghost" onClick={() => open(a, "view")} aria-label={`Voir ${a.name}`}><Eye className="h-4 w-4" /></Button>
                )}
                {canIA && <Button size="sm" variant="ghost" onClick={() => setJal({ attachmentId: a.id, label: a.name })} aria-label={`Lire ${a.name} comme jalonnement`} title="Lire comme jalonnement"><Sparkles className="h-4 w-4" /></Button>}
                <Button size="sm" variant="ghost" onClick={() => open(a, "download")} aria-label={`Télécharger ${a.name}`}><Download className="h-4 w-4" /></Button>
                {clientReply && canFile && <Button size="sm" variant="ghost" title="Enregistrer dans une affaire" aria-label={`Enregistrer ${a.name} dans une affaire`} onClick={() => setFiling(a)}><FolderPlus className="h-4 w-4" /></Button>}
              </>
            )}
          </li>
        ))}
      </ul>
      {jalDlg}
      {filing && <SaveEmailDocumentDialog emailId={emailId} attachment={filing} onClose={() => setFiling(null)} />}
    </div>
  );
}
