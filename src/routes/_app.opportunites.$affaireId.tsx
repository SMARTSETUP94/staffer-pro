import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, Save, MessageSquare, Users, FileText } from "lucide-react";
import { toast } from "sonner";
import { useCapability } from "@/hooks/use-capability";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getOpportuniteFiche,
  updateOpportuniteFields,
  type OpportuniteFicheData,
} from "@/server/opportunite-fiche.functions";
import { OpportuniteFicheHeader } from "@/components/opportunites/fiche/OpportuniteFicheHeader";
import { OpportuniteJalonsBar } from "@/components/opportunites/fiche/OpportuniteJalonsBar";
import { OpportuniteNextActionCard } from "@/components/opportunites/fiche/OpportuniteNextActionCard";
import { SignerOpportuniteDialog } from "@/components/opportunites/SignerOpportuniteDialog";
import { AFFAIRE_TYPOLOGIES, type AffaireTypologie } from "@/lib/affaire-typologie";
import { TAILLE_LABEL, type OpportuniteTaille } from "@/lib/opportunites";

export const Route = createFileRoute("/_app/opportunites/$affaireId")({
  component: OpportuniteFichePage,
});

const TAILLES: OpportuniteTaille[] = ["tres_petit", "petit", "moyen", "gros", "tres_gros"];

function OpportuniteFichePage() {
  const { affaireId } = Route.useParams();
  const navigate = useNavigate();
  const canEdit = useCapability("action.edit_opportunite");
  const canSign = useCapability("action.sign_opportunite");

  const fetchFiche = useServerFn(getOpportuniteFiche);
  const { data, isLoading, refetch, error } = useQuery({
    queryKey: ["opportunite-fiche", affaireId],
    queryFn: () => fetchFiche({ data: { affaireId } }),
  });

  const [signOpen, setSignOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
        Impossible de charger cette opportunité.
        {error instanceof Error && <p className="mt-2 text-xs">{error.message}</p>}
      </div>
    );
  }

  const lastAction = data.actions[0] ?? null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6" data-testid="opportunite-fiche-page">
      <OpportuniteFicheHeader
        affaire={data.affaire}
        canSign={canSign}
        onSign={() => setSignOpen(true)}
      />

      <OpportuniteJalonsBar jalons={data.jalons} />

      <OpportuniteNextActionCard
        affaireId={affaireId}
        lastAction={lastAction}
        canEdit={canEdit}
        onSaved={() => refetch()}
      />

      <BriefSection
        affaire={data.affaire}
        canEdit={canEdit}
        onSaved={() => refetch()}
      />

      <TimelineSection actions={data.actions} />

      <EquipeSection equipe={data.equipe} />

      <DevisSection devis={data.devis} />

      <JournalSection commentaires={data.commentaires} />

      {signOpen && (
        <SignerOpportuniteDialog
          opp={{
            id: data.affaire.id,
            numero: data.affaire.numero,
            client: data.affaire.client,
            nom: data.affaire.nom,
            statut_opportunite: (data.affaire.statut_opportunite ?? "a_faire") as
              | "a_faire"
              | "envoye"
              | "gagne"
              | "perdu"
              | "termine",
            charge_affaires_id: data.affaire.charge_affaires_id,
            taille: (data.affaire.taille ?? null) as OpportuniteTaille | null,
            date_opportunite: data.affaire.date_opportunite,
            notes: data.affaire.notes,
          }}
          open={signOpen}
          onOpenChange={setSignOpen}
          onSigned={() => {
            setSignOpen(false);
            refetch();
            navigate({ to: "/affaires/$affaireId", params: { affaireId } });
          }}
        />
      )}
    </div>
  );
}

function BriefSection({
  affaire,
  canEdit,
  onSaved,
}: {
  affaire: OpportuniteFicheData["affaire"];
  canEdit: boolean;
  onSaved: () => void;
}) {
  const update = useServerFn(updateOpportuniteFields);
  const [nom, setNom] = useState(affaire.nom);
  const [client, setClient] = useState(affaire.client ?? "");
  const [lieu, setLieu] = useState(affaire.lieu ?? "");
  const [typo, setTypo] = useState<AffaireTypologie | "">((affaire.typologie_future as AffaireTypologie | null) ?? "");
  const [taille, setTaille] = useState<OpportuniteTaille | "">((affaire.taille as OpportuniteTaille | null) ?? "");
  const [datePat, setDatePat] = useState(affaire.date_pat ?? "");
  const [evtDebut, setEvtDebut] = useState(affaire.date_evenement_debut ?? "");
  const [evtFin, setEvtFin] = useState(affaire.date_evenement_fin ?? "");
  const [notes, setNotes] = useState(affaire.notes ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNom(affaire.nom);
    setClient(affaire.client ?? "");
    setLieu(affaire.lieu ?? "");
    setTypo((affaire.typologie_future as AffaireTypologie | null) ?? "");
    setTaille((affaire.taille as OpportuniteTaille | null) ?? "");
    setDatePat(affaire.date_pat ?? "");
    setEvtDebut(affaire.date_evenement_debut ?? "");
    setEvtFin(affaire.date_evenement_fin ?? "");
    setNotes(affaire.notes ?? "");
  }, [affaire]);

  async function save() {
    setSaving(true);
    try {
      await update({
        data: {
          affaireId: affaire.id,
          patch: {
            nom: nom.trim() || affaire.nom,
            client: client.trim() || null,
            lieu: lieu.trim() || null,
            typologie_future: typo || null,
            taille: (taille || null) as OpportuniteTaille | null,
            date_pat: datePat || null,
            date_evenement_debut: evtDebut || null,
            date_evenement_fin: evtFin || null,
            notes: notes.trim() || null,
          },
        },
      });
      toast.success("Brief enregistré.");
      onSaved();
    } catch (err) {
      toast.error("Enregistrement impossible.", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section data-testid="opportunite-brief">
      <p className="overline mb-3">— Brief client</p>
      <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nom de l'opportunité">
            <Input value={nom} onChange={(e) => setNom(e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Client">
            <Input value={client} onChange={(e) => setClient(e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Lieu">
            <Input value={lieu} onChange={(e) => setLieu(e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Typologie cible">
            <Select
              value={typo || "__none__"}
              onValueChange={(v) => setTypo(v === "__none__" ? "" : (v as AffaireTypologie))}
              disabled={!canEdit}
            >
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {AFFAIRE_TYPOLOGIES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Taille">
            <Select
              value={taille || "__none__"}
              onValueChange={(v) => setTaille(v === "__none__" ? "" : (v as OpportuniteTaille))}
              disabled={!canEdit}
            >
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {TAILLES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TAILLE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Date PAT (présentation au client)">
            <Input type="date" value={datePat} onChange={(e) => setDatePat(e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Événement — début">
            <Input type="date" value={evtDebut} onChange={(e) => setEvtDebut(e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Événement — fin">
            <Input type="date" value={evtFin} onChange={(e) => setEvtFin(e.target.value)} disabled={!canEdit} />
          </Field>
        </div>
        <Field label="Notes / brief commercial">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            disabled={!canEdit}
            placeholder="Contexte, attentes, contraintes…"
          />
        </Field>
        {canEdit && (
          <div className="flex justify-end">
            <Button onClick={save} disabled={saving} className="rounded-xl" data-testid="btn-save-brief">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Enregistrer le brief
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function TimelineSection({ actions }: { actions: OpportuniteFicheData["actions"] }) {
  if (actions.length === 0) return null;
  return (
    <section data-testid="opportunite-timeline">
      <p className="overline mb-3">— Historique des actions ({actions.length})</p>
      <ol className="space-y-2 rounded-2xl border border-border bg-card p-4">
        {actions.map((a) => (
          <li key={a.id} className="border-l-2 border-primary/30 pl-3">
            <div className="flex flex-wrap items-baseline gap-2 text-xs">
              <Badge variant="outline" className="text-[10px]">
                {a.type.replace(/_/g, " ")}
              </Badge>
              <span className="text-muted-foreground">
                {new Date(a.date).toLocaleDateString("fr-FR", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </span>
              {a.auteur_nom && <span className="text-muted-foreground">· {a.auteur_nom}</span>}
            </div>
            <p className="mt-0.5 whitespace-pre-wrap text-sm">{a.texte}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function EquipeSection({ equipe }: { equipe: OpportuniteFicheData["equipe"] }) {
  return (
    <section data-testid="opportunite-equipe">
      <p className="overline mb-3 flex items-center gap-2">
        <Users className="h-3 w-3" />— Équipe commerciale &amp; étude
      </p>
      <div className="rounded-2xl border border-border bg-card p-4">
        {equipe.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">Aucun membre assigné.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {equipe.map((m) => (
              <li key={m.id} className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs">
                <span className="font-medium">
                  {m.prenom} {m.nom}
                </span>
                {m.role_terrain && (
                  <span className="ml-1 text-muted-foreground">· {m.role_terrain}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function DevisSection({ devis }: { devis: OpportuniteFicheData["devis"] }) {
  return (
    <section data-testid="opportunite-devis">
      <p className="overline mb-3 flex items-center gap-2">
        <FileText className="h-3 w-3" />— Devis ({devis.length})
      </p>
      <div className="rounded-2xl border border-border bg-card p-4">
        {devis.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">Aucun devis rattaché.</p>
        ) : (
          <ul className="divide-y divide-border">
            {devis.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                <div className="min-w-0">
                  <span className="font-mono text-xs font-semibold">{d.numero}</span>
                  {d.libelle && <span className="ml-2 text-muted-foreground">{d.libelle}</span>}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="outline">{d.statut}</Badge>
                  {d.montant_ht !== null && (
                    <span className="font-medium">
                      {d.montant_ht.toLocaleString("fr-FR", {
                        style: "currency",
                        currency: "EUR",
                        maximumFractionDigits: 0,
                      })}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function JournalSection({ commentaires }: { commentaires: OpportuniteFicheData["commentaires"] }) {
  if (commentaires.length === 0) return null;
  return (
    <section data-testid="opportunite-journal">
      <p className="overline mb-3 flex items-center gap-2">
        <MessageSquare className="h-3 w-3" />— Journal commercial ({commentaires.length})
      </p>
      <ul className="space-y-2 rounded-2xl border border-border bg-card p-4">
        {commentaires.map((c) => (
          <li key={c.id} className="text-sm">
            <div className="text-xs text-muted-foreground">
              {c.author_nom ?? "Utilisateur"} · {new Date(c.created_at).toLocaleString("fr-FR")}
            </div>
            <p className="whitespace-pre-wrap">{c.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
