import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarIcon, FileUp, Loader2, Upload, AlertCircle, Plus, Trash2, Info,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useMetiers } from "@/hooks/use-metiers";
import { PageHeader } from "@/components/PageHeader";
import { MetierBadge } from "@/components/MetierBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { parseDevisFromArrayBuffer } from "@/lib/devis-import";
import type { MetierCode } from "@/lib/employes-import";

export const Route = createFileRoute("/_app/devis/import")({
  head: () => ({ meta: [{ title: "Import devis Excel — Setup Paris" }] }),
  component: DevisImportPage,
});

interface AffaireOption {
  id: string;
  numero: string;
  nom: string;
  client: string | null;
  lieu: string | null;
}

/** Une ligne du tableau Section 2 = un poste métier agrégé. */
interface PosteRow {
  /** id local pour clé React. */
  key: string;
  metierId: number | null;
  heures: number;
  montantHt: number;
  /** Libellés sources agrégés (tooltip). */
  libellesSources: string[];
  /** True si ajouté manuellement par le chef. */
  manuel: boolean;
}

const NEW_AFFAIRE = "__new__";

function DevisImportPage() {
  const { isAdminOrChef } = useAuth();
  const { metiers, byId } = useMetiers();
  const fileRef = useRef<HTMLInputElement>(null);

  // ----- Upload & parse -----
  const [filename, setFilename] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [hasParsed, setHasParsed] = useState(false);

  // ----- Section 1 : affaire & devis -----
  const [affaires, setAffaires] = useState<AffaireOption[]>([]);
  const [affaireId, setAffaireId] = useState<string>(""); // "" | id | NEW_AFFAIRE
  const [newAffaireNumero, setNewAffaireNumero] = useState("");
  const [newAffaireNom, setNewAffaireNom] = useState("");
  const [newAffaireClient, setNewAffaireClient] = useState("");
  const [newAffaireLieu, setNewAffaireLieu] = useState("");
  const [nomDevis, setNomDevis] = useState("");
  const [numeroDevis, setNumeroDevis] = useState("");
  const [dateMontage, setDateMontage] = useState<Date | undefined>(undefined);
  const [dateDemontage, setDateDemontage] = useState<Date | undefined>(undefined);

  // ----- Section 2 : postes -----
  const [postes, setPostes] = useState<PosteRow[]>([]);

  // Charge les affaires existantes.
  useEffect(() => {
    supabase
      .from("affaires")
      .select("id, numero, nom, client, lieu")
      .order("numero", { ascending: false })
      .limit(200)
      .then(({ data }) => setAffaires((data ?? []) as AffaireOption[]));
  }, []);

  const metierByCode = useMemo(() => {
    const map = new Map<MetierCode, number>();
    metiers.forEach((m) => map.set(m.code as MetierCode, m.id));
    return map;
  }, [metiers]);

  const selectedAffaire = useMemo(
    () => (affaireId && affaireId !== NEW_AFFAIRE ? affaires.find((a) => a.id === affaireId) : undefined),
    [affaireId, affaires],
  );

  // Champs lecture seule client/lieu : valeurs effectives.
  const effectiveClient = affaireId === NEW_AFFAIRE ? newAffaireClient : selectedAffaire?.client ?? "";
  const effectiveLieu = affaireId === NEW_AFFAIRE ? newAffaireLieu : selectedAffaire?.lieu ?? "";

  // ----- Parsing du fichier -----
  const handleFile = async (file: File) => {
    setParsing(true);
    setFilename(file.name);
    setParseErrors([]);
    try {
      const buf = await file.arrayBuffer();
      const result = parseDevisFromArrayBuffer(buf, { filename: file.name });
      setParseErrors(result.errors);

      // Pré-remplit nom devis (libellé section 1 du fichier).
      if (result.meta.libelle) setNomDevis(result.meta.libelle);
      // Pré-remplit numéro devis : nom de fichier sans extension, fallback sur n° détecté.
      const fnNoExt = file.name.replace(/\.(xlsx?|xls)$/i, "").trim();
      setNumeroDevis(fnNoExt || result.meta.numeroDevis || "");

      // Agrège les lignes par métier final.
      const byMetier = new Map<MetierCode, { heures: number; montant: number; libelles: string[] }>();
      const sansMetier: { heures: number; montant: number; libelles: string[] } = { heures: 0, montant: 0, libelles: [] };
      result.lines.forEach((l) => {
        if (l.excluded) return;
        const cur = l.metierFinalCode
          ? byMetier.get(l.metierFinalCode) ?? { heures: 0, montant: 0, libelles: [] }
          : sansMetier;
        cur.heures += l.tempsPrevu ?? 0;
        cur.montant += l.total ?? 0;
        if (l.designation) cur.libelles.push(l.designation);
        if (l.metierFinalCode) byMetier.set(l.metierFinalCode, cur);
      });

      const newPostes: PosteRow[] = Array.from(byMetier.entries()).map(([code, v], i) => ({
        key: `${code}-${i}`,
        metierId: metierByCode.get(code) ?? null,
        heures: round1(v.heures),
        montantHt: round2(v.montant),
        libellesSources: v.libelles,
        manuel: false,
      }));
      if (sansMetier.heures > 0 || sansMetier.libelles.length > 0) {
        newPostes.push({
          key: `sansmetier-${Date.now()}`,
          metierId: null,
          heures: round1(sansMetier.heures),
          montantHt: round2(sansMetier.montant),
          libellesSources: sansMetier.libelles,
          manuel: false,
        });
      }
      setPostes(newPostes);
      setHasParsed(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Lecture impossible", { description: msg });
    } finally {
      setParsing(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  // ----- Section 2 helpers -----
  const updatePoste = (key: string, patch: Partial<PosteRow>) =>
    setPostes((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const removePoste = (key: string) => setPostes((ps) => ps.filter((p) => p.key !== key));
  const addPoste = () =>
    setPostes((ps) => [
      ...ps,
      { key: `manuel-${Date.now()}`, metierId: null, heures: 0, montantHt: 0, libellesSources: [], manuel: true },
    ]);

  const totals = useMemo(() => {
    let h = 0;
    let m = 0;
    postes.forEach((p) => { h += p.heures || 0; m += p.montantHt || 0; });
    return { heures: round1(h), montant: round2(m) };
  }, [postes]);

  // ----- Validation finale -----
  const errors = useMemo(() => {
    const errs: string[] = [];
    if (!hasParsed) return errs;
    if (!affaireId) errs.push("Sélectionne une affaire (ou créer une nouvelle).");
    if (affaireId === NEW_AFFAIRE) {
      if (!newAffaireNumero.trim()) errs.push("Numéro de la nouvelle affaire requis.");
      if (!newAffaireNom.trim()) errs.push("Nom de la nouvelle affaire requis.");
    }
    if (!numeroDevis.trim()) errs.push("Numéro de devis requis.");
    if (!dateMontage) errs.push("Date de montage requise.");
    if (postes.length === 0) errs.push("Aucun poste à importer.");
    if (postes.some((p) => !p.metierId)) errs.push("Tous les postes doivent avoir un métier assigné.");
    if (postes.some((p) => p.heures <= 0)) errs.push("Toutes les heures doivent être > 0.");
    return errs;
  }, [hasParsed, affaireId, newAffaireNumero, newAffaireNom, numeroDevis, dateMontage, postes]);

  const canCommit = hasParsed && errors.length === 0 && !committing;

  const commit = async () => {
    if (!canCommit) return;
    setCommitting(true);
    try {
      // 1. Affaire : crée ou réutilise.
      let finalAffaireId = affaireId;
      if (affaireId === NEW_AFFAIRE) {
        const { data, error } = await supabase
          .from("affaires")
          .insert({
            numero: newAffaireNumero.trim(),
            nom: newAffaireNom.trim(),
            client: newAffaireClient.trim() || null,
            lieu: newAffaireLieu.trim() || null,
            statut: "en_cours",
            date_montage: toIso(dateMontage),
            date_demontage: toIso(dateDem