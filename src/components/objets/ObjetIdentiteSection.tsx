/**
 * Lot 8.2 — Card "Identité" de la fiche objet.
 * Wrappe ObjetIdentiteForm + bouton "Éditer / Enregistrer / Annuler".
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, Save, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  ObjetIdentiteForm,
  type ObjetIdentiteValues,
} from "@/components/objets/ObjetIdentiteForm";
import {
  getEditableFields,
  canEditAnyField,
  type ObjetEditableField,
} from "@/lib/objet-fiche-permissions";
import { updateObjetIdentite } from "@/server/objet-fiche.functions";
import { useAuth } from "@/lib/auth-context";

interface Props {
  objetId: string;
  reference: string;
  initial: ObjetIdentiteValues;
  respoOptions: Array<{ id: string; label: string }>;
}

export function ObjetIdentiteSection({
  objetId,
  reference,
  initial,
  respoOptions,
}: Props) {
  const { roles } = useAuth();
  const roleStrings = roles as readonly string[];
  const allowedFields: Set<ObjetEditableField> = getEditableFields(roleStrings);
  const canEdit = canEditAnyField(roleStrings);

  const [mode, setMode] = useState<"read" | "edit">("read");
  const [draft, setDraft] = useState<ObjetIdentiteValues>(initial);
  const qc = useQueryClient();
  const update = useServerFn(updateObjetIdentite);

  const mutation = useMutation({
    mutationFn: (patch: Partial<ObjetIdentiteValues>) =>
      update({ data: { objetId, patch } }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Identité mise à jour", {
          description:
            res.rejected.length > 0
              ? `Champs ignorés (droits insuffisants) : ${res.rejected.join(", ")}`
              : undefined,
        });
        setMode("read");
        qc.invalidateQueries({ queryKey: ["fiche-objet", objetId] });
      } else {
        toast.error("Aucun champ autorisé", {
          description: `Rejetés : ${res.rejected.join(", ")}`,
        });
      }
    },
    onError: (e: Error) => toast.error("Échec sauvegarde", { description: e.message }),
  });

  const diffPatch = (): Partial<ObjetIdentiteValues> => {
    const patch: Partial<ObjetIdentiteValues> = {};
    (Object.keys(draft) as Array<keyof ObjetIdentiteValues>).forEach((k) => {
      if (draft[k] !== initial[k]) {
        // @ts-expect-error union assignment
        patch[k] = draft[k];
      }
    });
    return patch;
  };

  const onSave = () => {
    const patch = diffPatch();
    if (Object.keys(patch).length === 0) {
      toast.info("Aucun changement");
      setMode("read");
      return;
    }
    mutation.mutate(patch);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">Identité</CardTitle>
        {canEdit && mode === "read" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setDraft(initial);
              setMode("edit");
            }}
            data-testid="btn-editer-objet"
          >
            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Éditer
          </Button>
        )}
        {mode === "edit" && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(initial);
                setMode("read");
              }}
              disabled={mutation.isPending}
            >
              <X className="mr-1 h-3.5 w-3.5" /> Annuler
            </Button>
            <Button
              size="sm"
              onClick={onSave}
              disabled={mutation.isPending}
              data-testid="btn-enregistrer-objet"
            >
              {mutation.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1 h-3.5 w-3.5" />
              )}
              Enregistrer
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <ObjetIdentiteForm
          reference={reference}
          initial={initial}
          mode={mode}
          allowedFields={allowedFields}
          respoOptions={respoOptions}
          onChange={setDraft}
        />
      </CardContent>
    </Card>
  );
}
