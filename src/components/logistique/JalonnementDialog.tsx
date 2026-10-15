import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ETAPE_CLASSES, ETAPE_LABELS, ETAPE_TYPES, type EtapeType } from "@/lib/logistique/etapes";
import { completerRetroplanning, DELAIS_DEFAUT, type EtapeProposee } from "@/lib/logistique/retroplanning";
import { analyserJalonnementEmail, analyserJalonnementFichier, type JalonnementResult } from "@/lib/server-fns/jalonnement.functions";
import { useAffairesPourLogistique, useInvalidateEtapes } from "@/hooks/use-etapes-logistiques";

type Row = EtapeProposee & { keep: boolean };

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  affaireId?: string;
  /** Si fourni, on analyse cet email (+ pièce jointe) au lieu de demander un fichier. */
  email?: { emailId: string; attachmentId: string | null; label: string };
}

const fileToB64 = (f: File) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(",")[1] ?? "");
  r.onerror = () => rej(r.error);
  r.readAsDataURL(f);
});

export function JalonnementDialog({ open, onOpenChange, affaireId, email }: Props) {
  const anaFile = useServerFn(analyserJalonnementFichier);
  const anaEmail = useServerFn(analyserJalonnementEmail);
  const invalidate = useInvalidateEtapes();
  const { data: affaires = [] } = useAffairesPourLogistique();
  const { data: delais } = useQuery({
    queryKey: ["logistique-parametres"],
    queryFn: async () => (await supabase.from("logistique_parametres").select("*").maybeSingle()).data,
  });
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<JalonnementResult | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [target, setTarget] = useState<string>(affaireId ?? "");
  const [suggest, setSuggest] = useState<string | null>(null);

  useEffect(() => { if (!open) { setRes(null); setRows([]); setSuggest(null); setTarget(affaireId ?? ""); } }, [open, affaireId]);

  function apply(r: JalonnementResult) {
    setRes(r);
    const lues: EtapeProposee[] = r.etapes.map((e) => ({ ...e, origine: "jalonnement" }));
    setRows(completerRetroplanning(lues, delais ?? DELAIS_DEFAUT).map((e) => ({ ...e, keep: true })));
    if (!affaireId && r.numero_affaire) {
      const m = affaires.find((a) => a.numero === r.numero_affaire);
      if (m) { setTarget(m.id); setSuggest(`Chantier ${m.numero} trouvé dans le document — vérifiez avant de valider.`); }
      else setSuggest(`Le document cite le numéro ${r.numero_affaire}, introuvable : choisissez le chantier.`);
    }
  }

  async function run(f?: File) {
    setBusy(true);
    try {
      const r = email
        ? await anaEmail({ data: email })
        : await anaFile({ data: { name: f!.name, mime: f!.type, base64: await fileToB64(f!) } });
      apply(r);
      if (r.etapes.length === 0) toast.warning("Aucune date logistique trouvée dans ce document.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  const patch = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));

  async function valider() {
    if (!target) return toast.error("Choisissez le chantier");
    const keep = rows.filter((r) => r.keep);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("affaire_etapes_logistiques").insert(keep.map((r) => ({
      affaire_id: target, type: r.type, date_debut: r.date_debut, date_fin: r.date_fin || null,
      heure_debut: r.heure_debut || null, heure_fin: r.heure_fin || null, lieu_libre: r.lieu || res?.lieu || null,
      note: r.note, origine: r.origine, statut: "valide" as const, created_by: u.user?.id ?? null,
      calcul_regle: r.origine === "retroplanning" ? r.note : null,
    })));
    if (error) return toast.error("Enregistrement impossible", { description: error.message });
    toast.success(`${keep.length} étape(s) ajoutée(s) au planning logistique`);
    invalidate();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" />Lire un jalonnement</DialogTitle>
          <DialogDescription>
            L'IA lit les dates, complète les étapes amont (appro, emballage, chargement) en jours ouvrés, puis vous corrigez et validez.
          </DialogDescription>
        </DialogHeader>

        {!res && (
          <div className="flex flex-col items-center gap-3 py-8">
            {busy ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Lecture en cours (jusqu'à une minute)…</p>
            ) : email ? (
              <Button onClick={() => run()}><Sparkles className="mr-1 h-4 w-4" />Analyser « {email.label} »</Button>
            ) : (
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border p-8 text-sm hover:bg-muted/50">
                <Upload className="h-6 w-6" />
                Déposer le jalonnement (PDF, image, Excel)
                <input type="file" className="hidden" accept=".pdf,.xlsx,.xls,.csv,.txt,image/*"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) run(f); }} />
              </label>
            )}
          </div>
        )}

        {res && (
          <div className="space-y-3">
            {res.resume && <p className="text-sm text-muted-foreground">{res.resume}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">Chantier :</span>
              <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={target}
                disabled={!!affaireId} onChange={(e) => setTarget(e.target.value)}>
                <option value="">— choisir —</option>
                {affaires.map((a) => <option key={a.id} value={a.id}>{a.numero} · {a.nom}</option>)}
              </select>
              {suggest && <span className="text-xs text-muted-foreground">{suggest}</span>}
            </div>
            <div className="space-y-1">
              {rows.map((r, i) => (
                <div key={i} className={cn("flex flex-wrap items-center gap-2 rounded-md border border-border p-2", !r.keep && "opacity-50")}>
                  <Checkbox checked={r.keep} onCheckedChange={(c) => patch(i, { keep: !!c })} aria-label="Garder cette étape" />
                  <select className={cn("h-8 rounded px-1 text-xs font-semibold", ETAPE_CLASSES[r.type])} value={r.type}
                    onChange={(e) => patch(i, { type: e.target.value as EtapeType })}>
                    {ETAPE_TYPES.map((t) => <option key={t} value={t}>{ETAPE_LABELS[t]}</option>)}
                  </select>
                  <Input type="date" className="h-8 w-36" value={r.date_debut} onChange={(e) => patch(i, { date_debut: e.target.value })} />
                  <Input type="date" className="h-8 w-36" value={r.date_fin ?? ""} onChange={(e) => patch(i, { date_fin: e.target.value || null })} aria-label="Date de fin" />
                  <Input type="time" className="h-8 w-24" value={r.heure_debut ?? ""} onChange={(e) => patch(i, { heure_debut: e.target.value || null })} />
                  <Input type="time" className="h-8 w-24" value={r.heure_fin ?? ""} onChange={(e) => patch(i, { heure_fin: e.target.value || null })} />
                  <Input className="h-8 min-w-40 flex-1" placeholder="Note" value={r.note ?? ""} onChange={(e) => patch(i, { note: e.target.value || null })} />
                  {r.origine === "retroplanning" && <span className="text-[11px] text-muted-foreground">calculé</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {res && (
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRes(null); setRows([]); }}>Recommencer</Button>
            <Button onClick={valider} disabled={!rows.some((r) => r.keep)}>Valider et ajouter au planning</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
