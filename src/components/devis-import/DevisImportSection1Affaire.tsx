import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerField } from "./DatePickerField";
import { NEW_AFFAIRE, type AffaireOption } from "./types";

interface Props {
  filename: string | null;
  affaires: AffaireOption[];
  affaireId: string;
  setAffaireId: (v: string) => void;
  numeroDevis: string;
  setNumeroDevis: (v: string) => void;
  newAffaireNumero: string;
  setNewAffaireNumero: (v: string) => void;
  newAffaireNom: string;
  setNewAffaireNom: (v: string) => void;
  newAffaireClient: string;
  setNewAffaireClient: (v: string) => void;
  newAffaireLieu: string;
  setNewAffaireLieu: (v: string) => void;
  nomDevis: string;
  setNomDevis: (v: string) => void;
  dateMontage: Date | undefined;
  setDateMontage: (d: Date | undefined) => void;
  dateDemontage: Date | undefined;
  setDateDemontage: (d: Date | undefined) => void;
  effectiveClient: string;
  effectiveLieu: string;
  totalMontant: number;
}

export function DevisImportSection1Affaire({
  filename,
  affaires,
  affaireId,
  setAffaireId,
  numeroDevis,
  setNumeroDevis,
  newAffaireNumero,
  setNewAffaireNumero,
  newAffaireNom,
  setNewAffaireNom,
  newAffaireClient,
  setNewAffaireClient,
  newAffaireLieu,
  setNewAffaireLieu,
  nomDevis,
  setNomDevis,
  dateMontage,
  setDateMontage,
  dateDemontage,
  setDateDemontage,
  effectiveClient,
  effectiveLieu,
  totalMontant,
}: Props) {
  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Section 1 — Affaire & devis
          </h2>
          {filename && (
            <p className="text-[11px] text-muted-foreground">
              Fichier : <span className="font-medium text-foreground">{filename}</span>
            </p>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>
              Numéro d'affaire <span className="text-destructive">*</span>
            </Label>
            <Select value={affaireId} onValueChange={setAffaireId}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue placeholder="Choisir une affaire ou en créer…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NEW_AFFAIRE} className="font-semibold text-primary">
                  + Créer une nouvelle affaire
                </SelectItem>
                {affaires.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.numero} — {a.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>
              Numéro de devis <span className="text-destructive">*</span>
            </Label>
            <Input
              value={numeroDevis}
              onChange={(e) => setNumeroDevis(e.target.value)}
              placeholder="D-202604-XXXX"
              className="h-10 rounded-xl"
            />
          </div>

          {affaireId === NEW_AFFAIRE && (
            <>
              <div className="space-y-1.5">
                <Label>
                  N° nouvelle affaire <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={newAffaireNumero}
                  onChange={(e) => setNewAffaireNumero(e.target.value)}
                  placeholder="Ex. A-2604-001"
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  Nom de la nouvelle affaire <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={newAffaireNom}
                  onChange={(e) => setNewAffaireNom(e.target.value)}
                  placeholder="Ex. Stand Maison & Objet 2026"
                  className="h-10 rounded-xl"
                />
              </div>
            </>
          )}

          <div className="space-y-1.5 md:col-span-2">
            <Label>Nom du devis</Label>
            <Input
              value={nomDevis}
              onChange={(e) => setNomDevis(e.target.value)}
              placeholder="Libellé du devis (pré-rempli)"
              className="h-10 rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Client</Label>
            {affaireId === NEW_AFFAIRE ? (
              <Input
                value={newAffaireClient}
                onChange={(e) => setNewAffaireClient(e.target.value)}
                placeholder="Client de la nouvelle affaire"
                className="h-10 rounded-xl"
              />
            ) : (
              <Input value={effectiveClient || "—"} readOnly className="h-10 rounded-xl bg-muted/40" />
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Lieu chantier</Label>
            {affaireId === NEW_AFFAIRE ? (
              <Input
                value={newAffaireLieu}
                onChange={(e) => setNewAffaireLieu(e.target.value)}
                placeholder="Lieu du chantier"
                className="h-10 rounded-xl"
              />
            ) : (
              <Input value={effectiveLieu || "—"} readOnly className="h-10 rounded-xl bg-muted/40" />
            )}
          </div>

          <DatePickerField label="Date de montage" required value={dateMontage} onChange={setDateMontage} />
          <DatePickerField
            label="Date de démontage"
            value={dateDemontage}
            onChange={setDateDemontage}
            minDate={dateMontage}
          />

          <div className="space-y-1.5 md:col-span-2">
            <Label>Montant HT total (calculé)</Label>
            <Input
              readOnly
              value={`${totalMontant.toLocaleString("fr-FR")} € HT`}
              className="h-10 rounded-xl bg-muted/40 font-semibold"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
