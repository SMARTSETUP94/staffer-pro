import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useMetiers } from "@/hooks/use-metiers";
import { PageHeader } from "@/components/PageHeader";
import { PageBreadcrumbs } from "@/components/PageBreadcrumbs";
import { ImportsTabsNav } from "@/components/ImportsTabsNav";
import { Card, CardContent } from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { ImportErrorPanel } from "@/components/imports/ImportErrorPanel";
import { ImportErrorBoundary } from "@/components/imports/ImportErrorBoundary";
import {
  exceptionToIssue,
  legacyStringsToIssues,
  makeIssue,
  validateDateRange,
  validateTotalsMatch,
  type ImportIssue,
} from "@/lib/import-validation";
import { parseDevisFromArrayBuffer } from "@/lib/devis-import";
import { parseDevisProgbatFromArrayBuffer } from "@/lib/devis-parser/parse-excel";
import {
  computeFlagsFromMetiers,
  detectTypeFinition,
} from "@/lib/devis-parser/compute-flags";
import type { FabMetier } from "@/hooks/use-fabrication";
import type { MetierCode } from "@/lib/employes-import";
import { DevisImportDropzone } from "@/components/devis-import/DevisImportDropzone";
import { DevisImportSection1Affaire } from "@/components/devis-import/DevisImportSection1Affaire";
import { DevisImportSection2Postes } from "@/components/devis-import/DevisImportSection2Postes";
import {
  DevisImportSection3Objets,
  type EditableObjet,
} from "@/components/devis-import/DevisImportSection3Objets";
import { DevisImportSection4Chantier } from "@/components/devis-import/DevisImportSection4Chantier";
import { DevisImportSection5BulkAssign } from "@/components/devis-import/DevisImportSection5BulkAssign";
import { DevisImportFooter } from "@/components/devis-import/DevisImportFooter";
import {
  DevisReimportConfirmDialog,
  type ReimportPreflight,
} from "@/components/devis-import/DevisReimportConfirmDialog";
import { NEW_AFFAIRE, type AffaireOption, type PosteRow } from "@/components/devis-import/types";
import { detectMachinisteDoubleComptage } from "@/lib/devis-import-v2-helpers";
import {
  EMPTY_BULK_ASSIGN,
  activeEtapesFromObjets,
  buildBulkAssignPayload,
  type BulkAssignSelections,
} from "@/lib/bulk-assign-roles";

/** v0.25.1 — Pré-sélection affaire via ?affaire_id=... depuis l'onglet Devis d'une affaire. */
const importSearchSchema = z.object({
  affaire_id: fallback(z.string().uuid().optional(), undefined),
});

export const Route = createFileRoute("/_app/devis/import")({
  head: () => ({ meta: [{ title: "Import devis Excel — Setup Paris" }] }),
  validateSearch: zodValidator(importSearchSchema),
  component: DevisImportPage,
});

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
function toIso(d: Date | undefined): string | null {
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// MACHINISTE_METIER_ID extrait dans @/lib/devis-import-v2-helpers (testé unitairement)

function DevisImportPage() {
  const { isAdminOrChef } = useAuth();
  const { metiers, byId } = useMetiers();
  const { affaire_id: prefilledAffaireId } = Route.useSearch();

  // v0.25.1 — Verrouillage si pré-sélection valide depuis l'onglet Devis d'une affaire
  const [prefillState, setPrefillState] = useState<"idle" | "loading" | "valid" | "invalid">(
    prefilledAffaireId ? "loading" : "idle",
  );

  // Upload & parse
  const [filename, setFilename] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [hasParsed, setHasParsed] = useState(false);

  // Section 1
  const [affaires, setAffaires] = useState<AffaireOption[]>([]);
  const [affaireId, setAffaireId] = useState<string>("");
  const [newAffaireNumero, setNewAffaireNumero] = useState("");
  const [newAffaireNom, setNewAffaireNom] = useState("");
  const [newAffaireClient, setNewAffaireClient] = useState("");
  const [newAffaireLieu, setNewAffaireLieu] = useState("");
  // v0.30.2 — édition libre du Client/Lieu même sur affaire existante
  const [clientTouched, setClientTouched] = useState(false);
  const [lieuTouched, setLieuTouched] = useState(false);
  const [nomDevis, setNomDevis] = useState("");
  const [numeroDevis, setNumeroDevis] = useState("");
  const [dateMontage, setDateMontage] = useState<Date | undefined>(undefined);
  const [dateDemontage, setDateDemontage] = useState<Date | undefined>(undefined);

  // Section 2 (postes RH)
  const [postes, setPostes] = useState<PosteRow[]>([]);

  // Section 3 (objets fabrication Progbat)
  const [objets, setObjets] = useState<EditableObjet[]>([]);

  // Section 4 (heures chantier)
  const [importMontage, setImportMontage] = useState(false);
  const [importDemontage, setImportDemontage] = useState(false);
  const [montageH, setMontageH] = useState(0);
  const [demontageH, setDemontageH] = useState(0);

  // v0.25.2 — Section 5 : bulk-assign rôles
  const [bulkAssign, setBulkAssign] = useState<BulkAssignSelections>(EMPTY_BULK_ASSIGN);

  // Hash du fichier pour anti-doublon
  const [fichierHash, setFichierHash] = useState<string | null>(null);

  // v0.30.6 — Modale de confirmation ré-import (garde-fous SOFT)
  const [preflight, setPreflight] = useState<ReimportPreflight | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    supabase
      .from("affaires")
      .select("id, numero, nom, client, lieu")
      .order("numero", { ascending: false })
      .limit(200)
      .then(({ data }) => setAffaires((data ?? []) as AffaireOption[]));
  }, []);

  // v0.25.1 — Si ?affaire_id présent, fetch ciblé (peut être hors top 200) + RLS check
  useEffect(() => {
    if (!prefilledAffaireId) return;
    let cancelled = false;
    setPrefillState("loading");
    supabase
      .from("affaires")
      .select("id, numero, nom, client, lieu")
      .eq("id", prefilledAffaireId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setPrefillState("invalid");
          toast.error("Affaire introuvable", {
            description: "Sélectionne une affaire de destination dans la liste.",
          });
          return;
        }
        const opt = data as AffaireOption;
        setAffaires((prev) => (prev.some((a) => a.id === opt.id) ? prev : [opt, ...prev]));
        setAffaireId(opt.id);
        setPrefillState("valid");
      });
    return () => {
      cancelled = true;
    };
  }, [prefilledAffaireId]);

  const lockedAffaire = prefillState === "valid";


  const metierByCode = useMemo(() => {
    const map = new Map<MetierCode, number>();
    metiers.forEach((m) => map.set(m.code as MetierCode, m.id));
    return map;
  }, [metiers]);

  const selectedAffaire = useMemo(
    () => (affaireId && affaireId !== NEW_AFFAIRE ? affaires.find((a) => a.id === affaireId) : undefined),
    [affaireId, affaires],
  );
  // v0.30.2 — Client/Lieu éditables sur affaire existante.
  // Tant que l'utilisateur n'a pas tapé, on affiche la valeur de l'affaire ;
  // dès la première frappe, on prend la valeur saisie.
  const effectiveClient =
    affaireId === NEW_AFFAIRE
      ? newAffaireClient
      : clientTouched
        ? newAffaireClient
        : selectedAffaire?.client ?? "";
  const effectiveLieu =
    affaireId === NEW_AFFAIRE
      ? newAffaireLieu
      : lieuTouched
        ? newAffaireLieu
        : selectedAffaire?.lieu ?? "";

  const handleFile = async (file: File) => {
    setParsing(true);
    setFilename(file.name);
    setParseErrors([]);
    try {
      const buf = await file.arrayBuffer();
      // Hash SHA-256 du fichier pour détecter les doublons
      const hashBuf = await crypto.subtle.digest("SHA-256", buf);
      const hashHex = Array.from(new Uint8Array(hashBuf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      setFichierHash(hashHex);

      // ---- Parser RH (devis_postes) ----
      const result = parseDevisFromArrayBuffer(buf, { filename: file.name });
      setParseErrors(result.errors);

      if (result.meta.libelle) setNomDevis(result.meta.libelle);
      const fnNoExt = file.name.replace(/\.(xlsx?|xls)$/i, "").trim();
      setNumeroDevis(fnNoExt || result.meta.numeroDevis || "");

      const byMetier = new Map<MetierCode, { heures: number; montant: number; libelles: string[] }>();
      const sansMetier = { heures: 0, montant: 0, libelles: [] as string[] };
      result.lines.forEach((l) => {
        if (l.excluded) return;
        if (l.metierFinalCode) {
          const cur = byMetier.get(l.metierFinalCode) ?? { heures: 0, montant: 0, libelles: [] };
          cur.heures += l.tempsPrevu ?? 0;
          cur.montant += l.total ?? 0;
          if (l.designation) cur.libelles.push(l.designation);
          byMetier.set(l.metierFinalCode, cur);
        } else {
          sansMetier.heures += l.tempsPrevu ?? 0;
          sansMetier.montant += l.total ?? 0;
          if (l.designation) sansMetier.libelles.push(l.designation);
        }
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

      // ---- Parser Progbat (objets fabrication + heures chantier) ----
      try {
        const progbat = parseDevisProgbatFromArrayBuffer(buf, { filename: file.name });
        const editable: EditableObjet[] = progbat.objetsCandidats.map((o) => ({
          selected: o.confidence === "high",
          numero: o.numero,
          nom: o.nom,
          quantite: o.quantite,
          heures: { ...o.heures },
          budgetMateriaux: o.budgetMateriaux,
          typeFinition: o.typeFinition,
          flags: o.flags,
          confidence: o.confidence,
          warnings: o.warnings,
        }));
        setObjets(editable);
        setMontageH(progbat.heuresChantier.montage);
        setDemontageH(progbat.heuresChantier.demontage);
        setImportMontage(progbat.heuresChantier.montage > 0);
        setImportDemontage(progbat.heuresChantier.demontage > 0);
      } catch (e) {
        // Si le parser Progbat échoue, on continue avec juste les postes RH.
        const msg = e instanceof Error ? e.message : String(e);
        setParseErrors((prev) => [...prev, `Parser Progbat : ${msg}`]);
      }

      setHasParsed(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Lecture impossible", { description: msg });
    } finally {
      setParsing(false);
    }
  };

  const updatePoste = (key: string, patch: Partial<PosteRow>) =>
    setPostes((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const removePoste = (key: string) => setPostes((ps) => ps.filter((p) => p.key !== key));
  const addPoste = () =>
    setPostes((ps) => [
      ...ps,
      { key: `manuel-${Date.now()}`, metierId: null, heures: 0, montantHt: 0, libellesSources: [], manuel: true },
    ]);

  const updateObjet = (idx: number, patch: Partial<EditableObjet>) =>
    setObjets((prev) =>
      prev.map((o, i) => {
        if (i !== idx) return o;
        const next = { ...o, ...patch };
        if (patch.heures) {
          next.flags = computeFlagsFromMetiers(next.heures);
          next.typeFinition = detectTypeFinition(next.heures);
        }
        return next;
      }),
    );
  const updateMetier = (idx: number, metier: FabMetier, value: number) => {
    const obj = objets[idx];
    if (!obj) return;
    const heures = { ...obj.heures, [metier]: Number.isFinite(value) ? value : 0 };
    updateObjet(idx, { heures });
  };

  const totals = useMemo(() => {
    let h = 0;
    let m = 0;
    postes.forEach((p) => {
      h += p.heures || 0;
      m += p.montantHt || 0;
    });
    return { heures: round1(h), montant: round2(m) };
  }, [postes]);

  const selectedObjetsCount = useMemo(() => objets.filter((o) => o.selected).length, [objets]);

  // v0.25.2 — étapes actives = au moins 1 objet sélectionné a des heures > 0 sur ce métier
  const activeEtapes = useMemo(
    () => activeEtapesFromObjets(objets.map((o) => ({ selected: o.selected, heures: o.heures }))),
    [objets],
  );

  const warnMachiniste = useMemo(
    () =>
      detectMachinisteDoubleComptage(
        postes
          .filter((p): p is PosteRow & { metierId: number } => p.metierId != null)
          .map((p) => ({ metierId: p.metierId, heures: p.heures })),
        importMontage,
        importDemontage,
      ),
    [postes, importMontage, importDemontage],
  );

  // v0.32.0 — Issues du parsing (file/format) + warnings métier détectés au parse.
  const parseIssues = useMemo<ImportIssue[]>(() => {
    const arr = legacyStringsToIssues(parseErrors, { severity: "warning" });
    // Cohérence dates Devis (warning, ne bloque pas).
    const dr = validateDateRange(
      dateMontage ? toIso(dateMontage) : null,
      dateDemontage ? toIso(dateDemontage) : null,
      { rowIndex: null, fieldDebut: "Date montage", fieldFin: "Date démontage" },
    );
    if (dr) arr.push(dr);
    // Cohérence totaux (warning).
    const sumPostes = postes.reduce((s, p) => s + (p.montantHt || 0), 0);
    if (sumPostes > 0 && totals.montant > 0) {
      const totalsCheck = validateTotalsMatch(sumPostes, totals.montant, {
        field: "Montant HT (postes)",
        tolerance: 1,
      });
      if (totalsCheck) arr.push(totalsCheck);
    }
    return arr;
  }, [parseErrors, dateMontage, dateDemontage, postes, totals.montant]);

  // v0.32.0 — Issues bloquantes (corrections requises avant Valider).
  const validationIssues = useMemo<ImportIssue[]>(() => {
    if (!hasParsed) return [];
    const arr: ImportIssue[] = [];
    const push = (message: string, column: string | null = null) =>
      arr.push(makeIssue({ code: "REQUIRED_FIELD_MISSING", message, column }));
    if (!affaireId) push("Sélectionne une affaire (ou créer une nouvelle).", "Affaire");
    if (affaireId === NEW_AFFAIRE) {
      if (!newAffaireNumero.trim()) push("Numéro de la nouvelle affaire requis.", "Numéro affaire");
      if (!newAffaireNom.trim()) push("Nom de la nouvelle affaire requis.", "Nom affaire");
    }
    if (!numeroDevis.trim()) push("Numéro de devis requis.", "Numéro devis");
    if (!dateMontage) push("Date de montage requise.", "Date montage");
    if (postes.length === 0 && selectedObjetsCount === 0) {
      push("Aucun poste ni objet à importer.");
    }
    postes.forEach((p, i) => {
      const ligne = i + 1;
      if (!p.metierId) {
        arr.push(
          makeIssue({
            code: "REQUIRED_FIELD_MISSING",
            rowIndex: ligne,
            column: "Métier",
            message: `Poste ${ligne} : un métier doit être assigné.`,
          }),
        );
      }
      if (p.heures <= 0) {
        arr.push(
          makeIssue({
            code: "OUT_OF_BOUNDS",
            rowIndex: ligne,
            column: "Heures",
            value: p.heures,
            message: `Poste ${ligne} : heures = ${p.heures}, doit être > 0.`,
          }),
        );
      }
    });
    return arr;
  }, [
    hasParsed, affaireId, newAffaireNumero, newAffaireNom,
    numeroDevis, dateMontage, postes, selectedObjetsCount,
  ]);

  const canCommit = hasParsed && validationIssues.length === 0 && !committing;

  const reset = () => {
    setHasParsed(false);
    setFilename(null);
    setFichierHash(null);
    setParseErrors([]);
    setPostes([]);
    setObjets([]);
    setNomDevis("");
    setNumeroDevis("");
    setDateMontage(undefined);
    setDateDemontage(undefined);
    // v0.25.1 — préserver la pré-sélection d'affaire si verrouillée
    if (!lockedAffaire) setAffaireId("");
    setNewAffaireNumero("");
    setNewAffaireNom("");
    setNewAffaireClient("");
    setNewAffaireLieu("");
    setClientTouched(false);
    setLieuTouched(false);
    setImportMontage(false);
    setImportDemontage(false);
    setMontageH(0);
    setDemontageH(0);
    setBulkAssign(EMPTY_BULK_ASSIGN);
  };

  // v0.30.6 — Clic Importer : preflight, puis modal de confirmation si re-import
  const handleCommitClick = async () => {
    if (!canCommit) return;
    if (!fichierHash) {
      // Pas de hash (création manuelle) → commit direct
      await doCommit();
      return;
    }
    setCommitting(true);
    try {
      const { data, error } = await supabase.rpc("preflight_import_devis", {
        _fichier_hash: fichierHash,
        _affaire_id: affaireId === NEW_AFFAIRE || !affaireId ? undefined : affaireId,
      });
      if (error) {
        toast.error("Vérification impossible", { description: error.message });
        return;
      }
      const pf = (data as ReimportPreflight | null) ?? { mode: "created" };
      if (pf.mode === "updated") {
        setPreflight(pf);
        setConfirmOpen(true);
        return; // attend la confirmation utilisateur
      }
      // Première import → commit direct
      await doCommit();
    } finally {
      setCommitting(false);
    }
  };

  const doCommit = async () => {
    setCommitting(true);
    try {
      const postesPayload = postes.map((p) => ({
        metier_id: p.metierId!,
        heures_prevues: p.heures,
        montant_ht: p.montantHt || null,
        libelle_source: p.libellesSources.slice(0, 5).join(" • ").slice(0, 500) || null,
      }));

      const objetsPayload = objets
        .filter((o) => o.selected)
        .map((o, idx) => ({
          reference: o.numero || `OBJ-${idx + 1}`,
          nom: o.nom.trim() || "Objet sans nom",
          quantite: Math.max(1, Math.round(o.quantite)),
          heures: o.heures,
          budget_materiaux: o.budgetMateriaux,
          type_finition: o.typeFinition,
          flags: o.flags,
        }));

      const rpcArgs = {
        _affaire_id: affaireId === NEW_AFFAIRE ? null : affaireId,
        _new_affaire:
          affaireId === NEW_AFFAIRE
            ? {
                numero: newAffaireNumero.trim(),
                nom: newAffaireNom.trim(),
                client: newAffaireClient.trim() || null,
                lieu: newAffaireLieu.trim() || null,
              }
            : {},
        _date_montage: toIso(dateMontage),
        _date_demontage: toIso(dateDemontage),
        _devis: {
          numero: numeroDevis.trim(),
          libelle: nomDevis.trim() || null,
          montant_ht: totals.montant ? String(totals.montant) : null,
          fichier_source: filename,
        },
        _postes: postesPayload,
        _objets_fab: objetsPayload,
        _heures_montage: importMontage ? montageH : null,
        _heures_demontage: importDemontage ? demontageH : null,
        _fichier_hash: fichierHash,
        _bulk_assign: buildBulkAssignPayload(bulkAssign),
      } as unknown as Parameters<typeof supabase.rpc<"import_devis_atomique_v3">>[1];

      const { data, error } = await supabase.rpc("import_devis_atomique_v3", rpcArgs);

      if (error) {
        // v0.30.6 : plus aucun garde-fou métier bloquant côté SQL.
        // Toute erreur ici = vraie erreur technique (RLS, contrainte, réseau).
        toast.error("Import impossible", { description: error.message ?? "Erreur inconnue." });
        return;
      }

      // v0.30.6 : distinguer création vs mise à jour + warning heures préservées
      const rpcData = (data as { mode?: string; heures_preservees?: number } | null) ?? {};
      const rpcMode = rpcData.mode ?? "created";
      const isUpdate = rpcMode === "updated";
      const heuresPreservees = rpcData.heures_preservees ?? 0;

      // v0.30.2 — Sur affaire existante, propager les éventuelles modifs Client/Lieu
      if (affaireId !== NEW_AFFAIRE && affaireId) {
        const updates: { client?: string | null; lieu?: string | null } = {};
        if (clientTouched) updates.client = newAffaireClient.trim() || null;
        if (lieuTouched) updates.lieu = newAffaireLieu.trim() || null;
        if (Object.keys(updates).length > 0) {
          const { error: upErr } = await supabase.from("affaires").update(updates).eq("id", affaireId);
          if (upErr) {
            toast.warning("Devis importé, mais Client/Lieu non mis à jour", {
              description: upErr.message,
            });
          }
        }
      }

      toast.success(isUpdate ? "Devis mis à jour" : "Devis importé", {
        description: `${postesPayload.length} poste(s) RH, ${objetsPayload.length} objet(s) fab, ${totals.heures} h, ${totals.montant.toLocaleString("fr-FR")} € HT.${isUpdate ? " Anciens postes/objets remplacés." : ""}`,
      });

      if (isUpdate && heuresPreservees > 0) {
        toast.warning(`${heuresPreservees} saisie(s) d'heures conservée(s)`, {
          description:
            "Les heures réelles déjà pointées sur ce devis n'ont pas été supprimées. Vérifiez qu'elles correspondent toujours aux nouveaux postes/objets.",
          duration: 8000,
        });
      }
      setConfirmOpen(false);
      setPreflight(null);
      reset();
    } finally {
      setCommitting(false);
    }
  };

  // Label affaire cible pour la modal
  const targetAffaireLabel = useMemo(() => {
    if (affaireId === NEW_AFFAIRE) {
      return `${newAffaireNumero.trim()} — ${newAffaireNom.trim()} (nouvelle)`.trim();
    }
    const a = affaires.find((x) => x.id === affaireId);
    return a ? `${a.numero} — ${a.nom}` : "—";
  }, [affaireId, affaires, newAffaireNumero, newAffaireNom]);


  if (!isAdminOrChef) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Accès réservé aux chefs de chantier et administrateurs.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <PageBreadcrumbs steps={[{ label: "Imports", to: "/employes/import" }, { label: "Devis" }]} />
        <PageHeader
          eyebrow="Imports"
          title="Import devis Excel"
          description="Charge un fichier devis Progbat (.xlsx). Le parser détecte simultanément les postes RH, les objets fabrication et les heures chantier — à toi de valider avant import."
        />
        <ImportsTabsNav />

        {prefilledAffaireId && (
          <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-2">
            <Button asChild variant="ghost" size="sm" className="h-8 rounded-lg">
              <Link to="/affaires/$affaireId/devis" params={{ affaireId: prefilledAffaireId }}>
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Retour à l'affaire
              </Link>
            </Button>
            {prefillState === "invalid" && (
              <p className="text-xs text-destructive">
                Affaire non trouvée ou accès refusé. Sélectionne une affaire dans la liste.
              </p>
            )}
            {prefillState === "valid" && (
              <p className="text-xs text-muted-foreground">
                Affaire pré-sélectionnée depuis l'onglet Devis.
              </p>
            )}
          </div>
        )}

        {!hasParsed && (
          <DevisImportDropzone
            filename={filename}
            parsing={parsing}
            dragOver={dragOver}
            setDragOver={setDragOver}
            onFile={handleFile}
            onManualCreate={() => {
              setHasParsed(true);
              setFilename(null);
              setPostes([]);
              setObjets([]);
            }}
          />
        )}

        <ImportErrorPanel
          issues={parseIssues}
          filename={filename}
          onReset={hasParsed ? reset : undefined}
        />

        {hasParsed && (
          <>
            <DevisImportSection1Affaire
              filename={filename}
              affaires={affaires}
              affaireId={affaireId}
              setAffaireId={setAffaireId}
              numeroDevis={numeroDevis}
              setNumeroDevis={setNumeroDevis}
              newAffaireNumero={newAffaireNumero}
              setNewAffaireNumero={setNewAffaireNumero}
              newAffaireNom={newAffaireNom}
              setNewAffaireNom={setNewAffaireNom}
              newAffaireClient={newAffaireClient}
              setNewAffaireClient={(v) => { setNewAffaireClient(v); setClientTouched(true); }}
              newAffaireLieu={newAffaireLieu}
              setNewAffaireLieu={(v) => { setNewAffaireLieu(v); setLieuTouched(true); }}
              nomDevis={nomDevis}
              setNomDevis={setNomDevis}
              dateMontage={dateMontage}
              setDateMontage={setDateMontage}
              dateDemontage={dateDemontage}
              setDateDemontage={setDateDemontage}
              effectiveClient={effectiveClient}
              effectiveLieu={effectiveLieu}
              totalMontant={totals.montant}
              lockedAffaire={lockedAffaire}
              clientEdited={clientTouched}
              lieuEdited={lieuTouched}
            />

            <DevisImportSection2Postes
              postes={postes}
              metiers={metiers}
              byId={byId}
              totals={totals}
              updatePoste={updatePoste}
              removePoste={removePoste}
              addPoste={addPoste}
            />

            <DevisImportSection3Objets
              objets={objets}
              updateObjet={updateObjet}
              updateMetier={updateMetier}
            />

            <DevisImportSection4Chantier
              importMontage={importMontage}
              setImportMontage={setImportMontage}
              importDemontage={importDemontage}
              setImportDemontage={setImportDemontage}
              montageH={montageH}
              setMontageH={setMontageH}
              demontageH={demontageH}
              setDemontageH={setDemontageH}
              warnMachiniste={warnMachiniste}
            />

            <DevisImportSection5BulkAssign
              selections={bulkAssign}
              setSelections={setBulkAssign}
              activeEtapes={activeEtapes}
              hasSelectedObjets={selectedObjetsCount > 0}
              heuresMontage={importMontage ? montageH : 0}
              heuresDemontage={importDemontage ? demontageH : 0}
            />

            {validationIssues.length > 0 && (
              <ImportErrorPanel
                issues={validationIssues}
                filename={filename}
              />
            )}

            <DevisImportFooter
              errorsCount={errors.length}
              postesCount={postes.length + selectedObjetsCount}
              totalHeures={totals.heures}
              totalMontant={totals.montant}
              committing={committing}
              canCommit={canCommit}
              onReset={reset}
              onCommit={handleCommitClick}
            />

            <DevisReimportConfirmDialog
              open={confirmOpen}
              preflight={preflight}
              targetAffaireLabel={targetAffaireLabel}
              committing={committing}
              onCancel={() => {
                setConfirmOpen(false);
                setPreflight(null);
              }}
              onConfirm={() => {
                void doCommit();
              }}
            />
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
