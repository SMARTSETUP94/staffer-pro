/**
 * v0.25.2 — Section 5 : Bulk-assign des responsables (8 dropdowns).
 *
 * Pré-assigne en une fois :
 *  - chef de projet (niveau affaire)
 *  - responsable montage / démontage (niveau affaire)
 *  - responsables des 5 étapes fab (BE, Usinage, Respo Fab, Finition, Manutention)
 *
 * Tous skipables. Masque les dropdowns de métiers sans heures sélectionnées.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  type AssignableProfile,
  type BulkAssignSelections,
  type EtapeKey,
  EMPTY_BULK_ASSIGN,
  profileLabel,
} from "@/lib/bulk-assign-roles";

interface Props {
  selections: BulkAssignSelections;
  setSelections: (s: BulkAssignSelections) => void;
  /** Étapes objet ayant au moins 1 objet sélectionné avec heures > 0 */
  activeEtapes: Set<EtapeKey>;
  /** Vrai si au moins un objet est sélectionné (sinon l'étape n'a pas de sens) */
  hasSelectedObjets: boolean;
  /** Heures montage/démontage prévues (pour masquer dropdowns si 0) */
  heuresMontage: number;
  heuresDemontage: number;
}

type ProfileFlag =
  | "est_chef_projet"
  | "est_bureau_etude"
  | "est_usinage_numerique"
  | "est_respo_fab"
  | "est_finition"
  | "est_manutention";

interface RoleConfig {
  key: string;
  icon: string;
  label: string;
  description: string;
  flag: ProfileFlag;
  selValue: string | null;
  setSelValue: (id: string | null) => void;
  visible: boolean;
}

export function DevisImportSection5BulkAssign({
  selections,
  setSelections,
  activeEtapes,
  hasSelectedObjets,
  heuresMontage,
  heuresDemontage,
}: Props) {
  const [profiles, setProfiles] = useState<Record<ProfileFlag, AssignableProfile[]>>({
    est_chef_projet: [],
    est_bureau_etude: [],
    est_usinage_numerique: [],
    est_respo_fab: [],
    est_finition: [],
    est_manutention: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from("profiles")
      .select(
        "id, full_name, email, est_chef_projet, est_bureau_etude, est_usinage_numerique, est_respo_fab, est_finition, est_manutention",
      )
      .order("full_name", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setLoading(false);
          return;
        }
        const buckets: Record<ProfileFlag, AssignableProfile[]> = {
          est_chef_projet: [],
          est_bureau_etude: [],
          est_usinage_numerique: [],
          est_respo_fab: [],
          est_finition: [],
          est_manutention: [],
        };
        for (const p of data) {
          const profile: AssignableProfile = {
            id: p.id,
            full_name: p.full_name,
            email: p.email,
          };
          (Object.keys(buckets) as ProfileFlag[]).forEach((flag) => {
            if (p[flag]) buckets[flag].push(profile);
          });
        }
        setProfiles(buckets);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setEtape = (k: EtapeKey, id: string | null) =>
    setSelections({ ...selections, parEtape: { ...selections.parEtape, [k]: id } });

  const roles: RoleConfig[] = useMemo(
    () => [
      {
        key: "chef_projet",
        icon: "👨‍💼",
        label: "Chef de projet",
        description: "1 par affaire — niveau affaire",
        flag: "est_chef_projet",
        selValue: selections.chefProjetId,
        setSelValue: (id) => setSelections({ ...selections, chefProjetId: id }),
        visible: true,
      },
      {
        key: "be",
        icon: "📐",
        label: "Plans (BE)",
        description: "Pré-assigne l'étape BE des objets",
        flag: "est_bureau_etude",
        selValue: selections.parEtape.be,
        setSelValue: (id) => setEtape("be", id),
        visible: hasSelectedObjets && activeEtapes.has("be"),
      },
      {
        key: "usinage",
        icon: "🔢",
        label: "Usinage numérique",
        description: "Pré-assigne l'étape Usinage des objets",
        flag: "est_usinage_numerique",
        selValue: selections.parEtape.usinage,
        setSelValue: (id) => setEtape("usinage", id),
        visible: hasSelectedObjets && activeEtapes.has("usinage"),
      },
      {
        key: "respo_fab",
        icon: "🪵",
        label: "Fabrication (Bois/Métal)",
        description: "Pré-assigne l'étape Respo Fab des objets",
        flag: "est_respo_fab",
        selValue: selections.parEtape.respo_fab,
        setSelValue: (id) => setEtape("respo_fab", id),
        visible: hasSelectedObjets && activeEtapes.has("respo_fab"),
      },
      {
        key: "finition",
        icon: "🎨",
        label: "Finition",
        description: "Pré-assigne l'étape Finition des objets",
        flag: "est_finition",
        selValue: selections.parEtape.finition,
        setSelValue: (id) => setEtape("finition", id),
        visible: hasSelectedObjets && activeEtapes.has("finition"),
      },
      {
        key: "manutention",
        icon: "📦",
        label: "Emballage (Manutention)",
        description: "Pré-assigne l'étape Manutention des objets",
        flag: "est_manutention",
        selValue: selections.parEtape.manutention,
        setSelValue: (id) => setEtape("manutention", id),
        visible: hasSelectedObjets && activeEtapes.has("manutention"),
      },
      {
        key: "montage",
        icon: "🚚",
        label: "Montage (sur chantier)",
        description: "Responsable des heures de montage",
        flag: "est_manutention",
        selValue: selections.montageId,
        setSelValue: (id) => setSelections({ ...selections, montageId: id }),
        visible: heuresMontage > 0,
      },
      {
        key: "demontage",
        icon: "🚚",
        label: "Démontage (sur chantier)",
        description: "Responsable des heures de démontage",
        flag: "est_manutention",
        selValue: selections.demontageId,
        setSelValue: (id) => setSelections({ ...selections, demontageId: id }),
        visible: heuresDemontage > 0,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selections, activeEtapes, hasSelectedObjets, heuresMontage, heuresDemontage],
  );

  const visibleRoles = roles.filter((r) => r.visible);
  const hasAnySelection =
    selections.chefProjetId ||
    selections.montageId ||
    selections.demontageId ||
    Object.values(selections.parEtape).some(Boolean);

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Section 5 — Assigner les responsables par défaut
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Optionnel. Tu peux modifier individuellement chaque assignation depuis l'onglet
              Fabrication de l'affaire ensuite.
            </p>
          </div>
          {hasAnySelection && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelections(EMPTY_BULK_ASSIGN)}
              className="h-8"
            >
              Passer cette étape
            </Button>
          )}
        </div>

        {visibleRoles.length === 0 && (
          <p className="text-xs italic text-muted-foreground">
            Aucun rôle à assigner (ni objet sélectionné, ni heures chantier).
          </p>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          {visibleRoles.map((r) => {
            const candidates = profiles[r.flag];
            const isEmpty = !loading && candidates.length === 0;
            return (
              <div key={r.key} className="rounded-lg border border-border p-3">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <span>{r.icon}</span>
                  <span>{r.label}</span>
                </Label>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{r.description}</p>
                <Select
                  value={r.selValue ?? "__none__"}
                  onValueChange={(v) => r.setSelValue(v === "__none__" ? null : v)}
                  disabled={loading || isEmpty}
                >
                  <SelectTrigger className="mt-2 h-9">
                    <SelectValue
                      placeholder={
                        loading
                          ? "Chargement…"
                          : isEmpty
                            ? "Aucun employé avec ce flag rôle"
                            : "— Non assigné —"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Non assigné —</SelectItem>
                    {candidates.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {profileLabel(p)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
