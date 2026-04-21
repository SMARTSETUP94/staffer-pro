import { useMemo, useState } from "react";
import {
  Loader2, Send, CheckCircle2, XCircle, RotateCw, Download, Users,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { inviteUser } from "@/lib/admin-actions";
import type { AppRole } from "@/lib/auth-context";

interface BulkInviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

type RowStatus = "pending" | "sending" | "retrying" | "sent" | "failed";

interface ResultRow {
  email: string;
  status: RowStatus;
  attempts: number;
  messageId: string | null;
  error: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseEmails(raw: string): { valid: string[]; invalid: string[] } {
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  raw
    .split(/[\n,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0)
    .forEach((s) => {
      if (seen.has(s)) return;
      seen.add(s);
      if (EMAIL_RE.test(s)) valid.push(s);
      else invalid.push(s);
    });
  return { valid, invalid };
}

function csvEscape(v: string): string {
  if (/[",\n;]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function buildCsv(rows: ResultRow[]): string {
  const header = ["email", "statut", "tentatives", "message_id", "erreur"].join(",");
  const body = rows
    .map((r) =>
      [r.email, r.status, String(r.attempts), r.messageId ?? "", r.error ?? ""]
        .map(csvEscape)
        .join(","),
    )
    .join("\n");
  return `${header}\n${body}\n`;
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function BulkInviteDialog({ open, onOpenChange, onComplete }: BulkInviteDialogProps) {
  const [emailsRaw, setEmailsRaw] = useState("");
  const [role, setRole] = useState<AppRole>("chef_chantier");
  const [autoSend, setAutoSend] = useState(true);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [done, setDone] = useState(false);

  const { valid, invalid } = useMemo(() => parseEmails(emailsRaw), [emailsRaw]);

  function reset() {
    setEmailsRaw("");
    setRole("chef_chantier");
    setAutoSend(true);
    setRunning(false);
    setResults([]);
    setDone(false);
  }

  function handleClose() {
    if (running) return;
    reset();
    onOpenChange(false);
    if (done) onComplete?.();
  }

  async function sendOne(email: string): Promise<{ messageId: string | null }> {
    const r = await inviteUser({
      data: { email, roles: [role] },
    });
    if (!r.ok) {
      // On convertit en throw pour que le retry/catch existant fonctionne
      throw new Error(r.error);
    }
    return { messageId: r.messageId ?? null };
  }

  async function handleRun() {
    if (valid.length === 0) {
      toast.error("Aucun email valide à inviter");
      return;
    }
    setRunning(true);
    setDone(false);

    // Initialise le tableau de résultats
    const initial: ResultRow[] = valid.map((email) => ({
      email,
      status: "pending",
      attempts: 0,
      messageId: null,
      error: null,
    }));
    setResults(initial);

    if (!autoSend) {
      // Si décoché : on confirme juste la liste sans envoyer (mode dry-run)
      toast.info(`${valid.length} email(s) prêts à inviter (envoi désactivé)`);
      setRunning(false);
      setDone(true);
      return;
    }

    const updated: ResultRow[] = [...initial];

    for (let i = 0; i < updated.length; i++) {
      // Tentative 1
      updated[i] = { ...updated[i], status: "sending", attempts: 1 };
      setResults([...updated]);

      try {
        const { messageId } = await sendOne(updated[i].email);
        updated[i] = {
          ...updated[i],
          status: "sent",
          messageId,
          error: null,
        };
        setResults([...updated]);
      } catch (e1) {
        const err1 = e1 instanceof Error ? e1.message : String(e1);
        // Retry 1×
        updated[i] = { ...updated[i], status: "retrying", attempts: 2, error: err1 };
        setResults([...updated]);

        await new Promise((r) => setTimeout(r, 800));

        try {
          const { messageId } = await sendOne(updated[i].email);
          updated[i] = {
            ...updated[i],
            status: "sent",
            messageId,
            error: null,
          };
          setResults([...updated]);
        } catch (e2) {
          const err2 = e2 instanceof Error ? e2.message : String(e2);
          updated[i] = {
            ...updated[i],
            status: "failed",
            error: err2,
          };
          setResults([...updated]);
        }
      }
    }

    const sentCount = updated.filter((r) => r.status === "sent").length;
    const failedCount = updated.filter((r) => r.status === "failed").length;
    toast.success(`${sentCount} envoyé(s)${failedCount > 0 ? `, ${failedCount} échec(s)` : ""}`);

    setRunning(false);
    setDone(true);
  }

  function handleDownloadCsv() {
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    downloadCsv(`bulk-invitations-${ts}.csv`, buildCsv(results));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : handleClose())}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Inviter en lot
          </DialogTitle>
          <DialogDescription>
            Collez une liste d'emails (un par ligne, virgule ou point-virgule).
            Chaque échec est retenté 1× automatiquement.
          </DialogDescription>
        </DialogHeader>

        {results.length === 0 ? (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="bulk-emails">Emails *</Label>
              <Textarea
                id="bulk-emails"
                value={emailsRaw}
                onChange={(e) => setEmailsRaw(e.target.value)}
                placeholder="prenom.nom@setup.paris&#10;autre@setup.paris"
                rows={8}
                className="font-mono text-sm"
              />
              <div className="flex gap-3 text-xs">
                <span className="text-emerald-600">
                  {valid.length} valide{valid.length > 1 ? "s" : ""}
                </span>
                {invalid.length > 0 && (
                  <span className="text-destructive">
                    {invalid.length} invalide{invalid.length > 1 ? "s" : ""} (ignoré
                    {invalid.length > 1 ? "s" : ""})
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="bulk-role">Rôle attribué *</Label>
                <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                  <SelectTrigger id="bulk-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="chef_chantier">Chef d'équipe</SelectItem>
                    <SelectItem value="employe">Employé</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={autoSend}
                    onCheckedChange={(v) => setAutoSend(v === true)}
                  />
                  Envoyer automatiquement les invitations
                </label>
              </div>
            </div>
          </div>
        ) : (
          <div className="max-h-[420px] overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-[110px]">Statut</TableHead>
                  <TableHead className="w-[70px] text-center">Essais</TableHead>
                  <TableHead>Message ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => (
                  <TableRow key={r.email}>
                    <TableCell className="font-mono text-xs">{r.email}</TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="text-center text-xs">{r.attempts}</TableCell>
                    <TableCell
                      className="font-mono text-[11px] text-muted-foreground"
                      title={r.error ?? r.messageId ?? ""}
                    >
                      {r.messageId
                        ? r.messageId.slice(0, 16) + "…"
                        : r.error
                          ? r.error.slice(0, 40) + (r.error.length > 40 ? "…" : "")
                          : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {done && results.length > 0 && (
            <Button variant="outline" onClick={handleDownloadCsv} className="gap-1.5">
              <Download className="h-4 w-4" />
              Télécharger rapport CSV
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={running}
          >
            {done ? "Fermer" : "Annuler"}
          </Button>
          {!done && (
            <Button onClick={handleRun} disabled={running || valid.length === 0}>
              {running ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-1.5 h-4 w-4" />
              )}
              Valider et inviter ({valid.length})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status }: { status: RowStatus }) {
  switch (status) {
    case "pending":
      return (
        <Badge variant="outline" className="text-muted-foreground">
          En attente
        </Badge>
      );
    case "sending":
      return (
        <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-blue-700">
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          Envoi…
        </Badge>
      );
    case "retrying":
      return (
        <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700">
          <RotateCw className="mr-1 h-3 w-3 animate-spin" />
          Retry
        </Badge>
      );
    case "sent":
      return (
        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Envoyé
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-red-700">
          <XCircle className="mr-1 h-3 w-3" />
          Échec
        </Badge>
      );
  }
}
