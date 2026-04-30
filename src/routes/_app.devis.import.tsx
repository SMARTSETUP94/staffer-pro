import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft } from "lucide-react";
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
    if (postes.length === 0 && selectedObjetsCount === 0) {
      errs.push("Aucun poste ni objet à importer.");
    }
    if (postes.some((p) => !p.metierId)) errs.push("Tous les postes doivent avoir un métier assigné.");
    if (postes.some((p) => p.heures <= 0)) errs.push("Toutes les heures de poste doivent être > 0.");
    return errs;
  }, [
    hasParsed, affaireId, newAffaireNumero, newAffaireNom,
    numeroDevis, dateMontage, postes, selectedObjetsCount,
  ]);

  const canCommit = hasParsed && errors.length === 0 && !committing;

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
    setImportMontage(false);
    setImportDemontage(false);
    setMontageH(0);
    setDemontageH(0);
    setBulkAssign(EMPTY_BULK_ASSIGN);
  };

  const commit = async () => {
    if (!canCommit) return;
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

      const { error } = await supabase.rpc("import_devis_atomique_v3", rpcArgs);

      if (error) {
        const isDuplicate = error.code === "23505" || /déjà été importé/i.test(error.message);
        toast.error(isDuplicate ? "Doublon détecté" : "Import impossible", {
          description: isDuplicate
            ? "Ce fichier a déjà été importé. Consulte l'historique des imports."
            : error.message,
        });
        return;
      }

      toast.success("Devis importé", {
        description: `${postesPayload.length} poste(s) RH, ${objetsPayload.length} objet(s) fab, ${totals.heures} h, ${totals.montant.toLocaleString("fr-FR")} € HT.`,
      });
      reset();
    } finally {
      setCommitting(false);
    }
  };

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

        {parseErrors.length > 0 && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="space-y-1 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
                <AlertCircle className="h-4 w-4" /> Avertissements de parsing
              </p>
              {parseErrors.map((e, i) => (
                <div key={i} className="text-xs text-destructive/80">
                  • {e}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

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
              setNewAffaireClient={setNewAffaireClient}
              newAffaireLieu={newAffaireLieu}
              setNewAffaireLieu={setNewAffaireLieu}
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

            {errors.length > 0 && (
              <Card className="border-destructive/40 bg-destructive/5">
                <CardContent className="space-y-1 p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
                    <AlertCircle className="h-4 w-4" /> Corrections requises avant validation
                  </p>
                  {errors.map((e, i) => (
                    <div key={i} className="text-xs text-destructive/80">
                      • {e}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <DevisImportFooter
              errorsCount={errors.length}
              postesCount={postes.length + selectedObjetsCount}
              totalHeures={totals.heures}
              totalMontant={totals.montant}
              committing={committing}
              canCommit={canCommit}
              onReset={reset}
              onCommit={commit}
            />
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
