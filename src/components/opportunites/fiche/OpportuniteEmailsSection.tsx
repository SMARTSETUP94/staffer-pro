import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Mail, MailOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { EmailReaderDialog, type ReadableEmail } from "@/components/emails/EmailReaderDialog";

/** Emails entrants (devis@, log@…) rattachés à l'opportunité. */
export function OpportuniteEmailsSection({ affaireId }: { affaireId: string }) {
  const [rows, setRows] = useState<ReadableEmail[] | null>(null);
  const [reading, setReading] = useState<ReadableEmail | null>(null);
  useEffect(() => {
    let alive = true;
    supabase
      .from("emails_entrants")
      .select("id, from_email, from_name, subject, received_at, body_preview, body_full, body_content_type")
      .eq("opportunite_id", affaireId)
      .order("received_at", { ascending: false })
      .then(({ data }) => alive && setRows((data ?? []) as ReadableEmail[]));
    return () => { alive = false; };
  }, [affaireId]);

  if (!rows || rows.length === 0) return null;
  return (
    <section className="rounded-2xl border bg-card p-4 space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><Mail className="h-4 w-4" /> Emails d'origine ({rows.length})</h2>
      <ul className="divide-y">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 py-2 text-sm">
            <div className="flex-1 min-w-0">
              <p className="truncate font-medium">{r.subject || "(sans objet)"}</p>
              <p className="truncate text-xs text-muted-foreground">
                {r.from_name ?? r.from_email} · {format(parseISO(r.received_at), "d MMM yyyy", { locale: fr })}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setReading(r)}>
              <MailOpen className="h-4 w-4 mr-1" /> Lire
            </Button>
          </li>
        ))}
      </ul>
      {reading && <EmailReaderDialog email={reading} affaireId={affaireId} onClose={() => setReading(null)} />}
    </section>
  );
}
