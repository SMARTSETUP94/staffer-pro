import { useMemo, useRef, useState } from "react";
import { Loader2, Upload, FileText } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface ParsedRow {
  nom: string;
  domaines: string[];
  email: string | null;
  telephone: string | null;
  contact_nom: string | null;
  contact_prenom: string | null;
  secteur: string | null;
  siret: string | null;
  notes: string | null;
}

function detectDelimiter(headerLine: string): string {
  const candidates = [";", ",", "\t"];
  let best = ";";
  let bestCount = 0;
  for (const c of candidates) {
    const n = headerLine.split(c).length;
    if (n > bestCount) {
      bestCount = n;
      best = c;
    }
  }
  return best;
}

function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') inQ = true;
      else if (ch === delim) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function parseCsv(text: string): ParsedRow[] {
  const cleaned = text.replace(/^\uFEFF/, "");
  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const delim = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delim).map(normalizeHeader);

  const idx = (names: string[]) =>
    headers.findIndex((h) => names.includes(h));

  const iNom = idx(["nom", "client", "raison_sociale", "nom_client", "name"]);
  const iId = idx(["identifiant", "id", "code"]);
  const iEmail = idx(["email", "mail", "e_mail"]);
  const iTel = idx(["telephone", "tel", "phone"]);
  const iAdr = idx(["adresse", "adresse_client", "address"]);
  const iSecteur = idx(["secteur", "activite", "sector"]);
  const iSiret = idx(["siret"]);
  const iContactNom = idx(["contact_nom", "nom_contact"]);
  const iContactPrenom = idx(["contact_prenom", "prenom_contact", "prenom"]);

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], delim);
    const nom =
      (iNom >= 0 ? cells[iNom] : "") ||
      (iId >= 0 ? cells[iId] : "") ||
      "";
    if (!nom.trim()) continue;
    const email = iEmail >= 0 ? cells[iEmail]?.trim() || null : null;
    const domaines: string[] = [];
    if (email && email.includes("@")) {
      const d = email.split("@")[1]?.toLowerCase().trim();
      if (d) domaines.push(d);
    }
    rows.push({
      nom: nom.trim(),
      domaines,
      email,
      telephone: iTel >= 0 ? cells[iTel]?.trim() || null : null,
      contact_nom: iContactNom >= 0 ? cells[iContactNom]?.trim() || null : null,
      contact_prenom:
        iContactPrenom >= 0 ? cells[iContactPrenom]?.trim() || null : null,
      secteur: iSecteur >= 0 ? cells[iSecteur]?.trim() || null : null,
      siret: iSiret >= 0 ? cells[iSiret]?.trim() || null : null,
      notes: iAdr >= 0 ? cells[iAdr]?.trim() || null : null,
    });
  }
  return rows;
}

async function readFile(file: File): Promise<string> {
  // Try UTF-8, fall back to latin-1 if many replacement chars
  const buf = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  const replacements = (utf8.match(/\uFFFD/g) ?? []).length;
  if (replacements > 5) {
    return new TextDecoder("windows-1252").decode(buf);
  }
  return utf8;
}

export function ImportClientsDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    if (!rows) return null;
    const withEmail = rows.filter((r) => !!r.email).length;
    return { total: rows.length, withEmail };
  }, [rows]);

  async function handleFile(file: File) {
    try {
      const text = await readFile(file);
      const parsed = parseCsv(text);
      if (parsed.length === 0) {
        toast.error("Aucune ligne trouvée dans le fichier.");
        return;
      }
      setRows(parsed);
      setFileName(file.name);
    } catch (e) {
      toast.error("Lecture du fichier impossible", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function runImport() {
    if (!rows || rows.length === 0) return;
    setImporting(true);
    const CHUNK = 100;
    let inserted = 0;
    let updated = 0;
    let contacts = 0;
    let skipped = 0;
    try {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        const { data, error } = await supabase.rpc("import_clients_bulk", {
          payload: slice as unknown as object,
        });
        if (error) throw error;
        const r = (data ?? {}) as {
          inserted_clients?: number;
          updated_clients?: number;
          inserted_contacts?: number;
          skipped?: number;
        };
        inserted += r.inserted_clients ?? 0;
        updated += r.updated_clients ?? 0;
        contacts += r.inserted_contacts ?? 0;
        skipped += r.skipped ?? 0;
      }
      toast.success("Import terminé", {
        description: `${inserted} créé(s) · ${updated} fusionné(s) · ${contacts} contact(s) · ${skipped} ignoré(s)`,
      });
      onDone();
    } catch (e) {
      toast.error("Import échoué", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !importing && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importer des clients</DialogTitle>
          <DialogDescription>
            Fichier CSV (séparateur <code>;</code> ou <code>,</code>). Colonnes
            reconnues : <code>nom</code>, <code>email</code>,{" "}
            <code>telephone</code>, <code>adresse</code>, <code>secteur</code>,{" "}
            <code>siret</code>. Les doublons sont fusionnés sur le nom
            normalisé ; les domaines email sont enrichis sans écraser.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
          {!rows ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full border-2 border-dashed rounded-lg py-12 flex flex-col items-center justify-center gap-2 hover:bg-muted/40 transition"
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm font-medium">
                Cliquer pour choisir un fichier CSV
              </span>
              <span className="text-xs text-muted-foreground">
                ou glisser-déposer
              </span>
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 border rounded-md bg-muted/30">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium flex-1">{fileName}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setRows(null);
                    setFileName(null);
                  }}
                  disabled={importing}
                >
                  Changer
                </Button>
              </div>
              <div className="text-sm">
                <strong>{stats?.total}</strong> ligne(s) détectée(s) ·{" "}
                <strong>{stats?.withEmail}</strong> avec email
              </div>
              <div className="max-h-64 overflow-auto border rounded-md">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left p-2">Nom</th>
                      <th className="text-left p-2">Email</th>
                      <th className="text-left p-2">Tél.</th>
                      <th className="text-left p-2">Domaine</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 50).map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2">{r.nom}</td>
                        <td className="p-2 text-muted-foreground">
                          {r.email ?? "—"}
                        </td>
                        <td className="p-2 text-muted-foreground">
                          {r.telephone ?? "—"}
                        </td>
                        <td className="p-2 text-muted-foreground">
                          {r.domaines.join(", ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 50 && (
                  <div className="text-xs text-muted-foreground p-2 text-center border-t">
                    … et {rows.length - 50} autres ligne(s)
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={importing}>
            Annuler
          </Button>
          <Button
            onClick={runImport}
            disabled={!rows || rows.length === 0 || importing}
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Importer {rows ? `(${rows.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
