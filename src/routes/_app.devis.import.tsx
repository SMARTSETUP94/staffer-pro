import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useMetiers } from "@/hooks/use-metiers";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { parseDevisFromArrayBuffer } from "@/lib/devis-import";
import type { MetierCode } from "@/lib/employes-import";
import { DevisImportDropzone } from "@/components/devis-import/DevisImportDropzone";
import { DevisImportSection1Affaire } from "@/components/devis-import/DevisImportSection1Affaire";
import { DevisImportSection2Postes } from "@/components/devis-import/DevisImportSection2Postes";
import { DevisImportFooter } from "@/components/devis-import/DevisImportFooter";
import { NEW_AFFAIRE, type AffaireOption, type PosteRow } from "@/components/devis-import/types";

export const Route = createFileRoute("/_app/devis/import")({
  head: () => ({ meta: [{ title: "Import devis Excel — Setup Paris" }] }),
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

function DevisImportPage() {
  const { isAdminOrChef } = useAuth();
  const { metiers, byId } = useMetiers();

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
  const [nomDevis, setNomDevis] = useState("");
  const [numeroDevis, setNumeroDevis] = useState("");
  const [dateMontage, setDateMontage] = useState<Date | undefined>(undefined);
  const [dateDemontage, setDateDemontage] = useState<Date | undefined>(undefined);

  // Section 2
  const [postes, setPostes] = useState<PosteRow[]>([]);

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

  const metierByCode = useMemo(() => {
    const map = new Map<MetierCode, number>();
    metiers.forEach((m) => map.set(m.code as MetierCode, m.id));
    return map;
  }, [metiers]);

  const selectedAffaire = useMemo(
    () => (affaireId && affaireId !== NEW_AFFAIRE ? affaires.find((a) => a.id === affaireId) : undefined),
    [affaireId, affaires],
  );
  const effectiveClient = affaireId === NEW_AFFAIRE ? newAffaireClient : selectedAffaire?.client ?? "";
  const effectiveLieu = affaireId === NEW_AFFAIRE ? newAffaireLieu : selectedAffaire?.lieu ?? "";

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

  const totals = useMemo(() => {
    let h = 0;
    let m = 0;
    postes.forEach((p) => {
      h += p.heures || 0;
      m += p.montantHt || 0;
    });
    return { heures: round1(h), montant: round2(m) };
  }, [postes]);

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

  const reset = () => {
    setHasParsed(false);
    setFilename(null);
    setFichierHash(null);
    setParseErrors([]);
    setPostes([]);
    setNomDevis("");
    setNumeroDevis("");
    setDateMontage(undefined);
    setDateDemontage(undefined);
    setAffaireId("");
    setNewAffaireNumero("");
    setNewAffaireNom("");
    setNewAffaireClient("");
    setNewAffaireLieu("");
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

      const { error } = await supabase.rpc("import_devis_atomique", {
        _affaire_id: (affaireId === NEW_AFFAIRE ? null : affaireId) as unknown as string,
        _new_affaire:
          affaireId === NEW_AFFAIRE
            ? {
                numero: newAffaireNumero.trim(),
                nom: newAffaireNom.trim(),
                client: newAffaireClient.trim() || null,
                lieu: newAffaireLieu.trim() || null,
              }
            : {},
        _date_montage: toIso(dateMontage) as unknown as string,
        _date_demontage: toIso(dateDemontage) as unknown as string,
        _devis: {
          numero: numeroDevis.trim(),
          libelle: nomDevis.trim() || null,
          montant_ht: totals.montant ? String(totals.montant) : null,
          fichier_source: filename,
        },
        _postes: postesPayload,
        _fichier_hash: fichierHash,
      });

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
        description: `${postesPayload.length} poste(s), ${totals.heures} h, ${totals.montant.toLocaleString("fr-FR")} € HT.`,
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
        <PageHeader
          number="04"
          eyebrow="Données / Import"
          title="Import devis Excel"
          description="Charge un fichier devis (.xlsx). Le parser pré-remplit les champs et regroupe les heures par métier — à toi de valider ou corriger avant import."
        />

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
              postesCount={postes.length}
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
