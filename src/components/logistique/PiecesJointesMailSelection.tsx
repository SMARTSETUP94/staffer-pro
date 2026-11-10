import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Eye, Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { listEmailAttachments, getEmailAttachment, type EmailAttachment } from "@/lib/server-fns/shared-inbox-attachments.functions";

/** Pièces jointes Outlook d'un mail log@, à cocher pour être rattachées au chantier lors de l'ajout au planning. */
export function PiecesJointesMailSelection({ emailId, selection, onChange }: { emailId: string; selection: string[]; onChange: (ids: string[]) => void }) {
  const list = useServerFn(listEmailAttachments);
  const get = useServerFn(getEmailAttachment);
  const [items, setItems] = useState<EmailAttachment[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    list({ data: { emailId } })
      .then((r) => {
        if (!alive) return;
        const utiles = r.filter((a) => !a.isInline || !a.contentType.startsWith("image/") || a.size > 20000);
        setItems(utiles);
        onChange(utiles.map((a) => a.id));
      })
      .catch((e) => alive && setErr((e as Error).message));
    return () => { alive = false; };
  }, [emailId]); // eslint-disable-line react-hooks/exhaustive-deps

  const voir = async (a: EmailAttachment) => {
    setBusy(a.id);
    try {
      const f = await get({ data: { emailId, attachmentId: a.id } });
      const bin = atob(f.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: f.contentType }));
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  if (err) return <p className="text-xs text-destructive">Pièces jointes indisponibles.</p>;
  if (!items) return <p className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Pièces jointes…</p>;
  if (items.length === 0) return null;
  return (
    <div className="rounded-md border p-2 text-xs">
      <p className="mb-1 flex items-center gap-1 font-medium"><Paperclip className="h-3 w-3" /> Pièces jointes à rattacher aux documents du chantier</p>
      <ul className="space-y-1">
        {items.map((a) => (
          <li key={a.id} className="flex items-center gap-2">
            <Checkbox checked={selection.includes(a.id)} aria-label={`Rattacher ${a.name}`}
              onCheckedChange={(v) => onChange(v ? [...selection, a.id] : selection.filter((x) => x !== a.id))} />
            <span className="flex-1 truncate">{a.name}</span>
            <span className="text-muted-foreground">{Math.round(a.size / 1024)} Ko</span>
            {busy === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> :
              <Button type="button" size="sm" variant="ghost" className="h-6 px-1" onClick={() => voir(a)} aria-label={`Voir ${a.name}`}><Eye className="h-3 w-3" /></Button>}
          </li>
        ))}
      </ul>
    </div>
  );
}
