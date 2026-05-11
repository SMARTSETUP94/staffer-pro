/**
 * v0.23.1 FIX 2 — Export "all-in-one" : un zip contenant le .xlsx multi-vues
 * (CDI/Intermittent/Synthèse/Heures/Véhicules) + la Feuille de route .xlsx pour la
 * même plage.
 */
// v0.24.1 — jszip lazy-loadé dans la fonction d'export (gain bundle initial).
import { addDays, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { resolveResponsable, type EmployeForResponsable } from "@/lib/feuille-route-helpers";
import {
  buildPlanningWorkbookRange,
  workbookToBlob,
  type VehiculeRef,
  type TrajetRef,
} from "@/lib/planning-excel-export";
import { feuilleRouteToBlob } from "@/lib/feuille-route-excel";
import type {
  Absence,
  Affaire,
  Assignation,
  ChefRef,
  DevisConsommation,
  Employe,
  Metier,
} from "@/hooks/use-planning-data";

interface ExportZipOpts {
  weekStarts: Date[];
  rangeStart: Date;
  rangeEnd: Date;
  metiers: Metier[];
  employes: Employe[];
  affaires: Affaire[];
  assignations: Assignation[];
  consommation: DevisConsommation[];
  absences: Absence[];
  chefsById: Map<string, ChefRef>;
  vehicules?: VehiculeRef[];
  trajets?: TrajetRef[];
}

interface ExtAffaire {
  id: string;
  numero: string;
  nom: string;
  lieu: string | null;
  chef_chantier_id: string | null;
  chef_projet_id: string | null;
  charge_affaires_id: string | null;
  date_montage: string | null;
  date_demontage: string | null;
}

interface ExtAssignation {
  affaire_id: string;
  date: string;
  employe_id: string;
  metier_id: number;
  type_operation: string | null;
  est_chef_jour: boolean;
}

interface ProfileLite {
  id: string;
  full_name: string | null;
  est_manutention: boolean;
}

/**
 * Génère et télécharge un zip "planning-export-{start}-{end}.zip" contenant :
 *  - planning multi-vues (.xlsx) : CDI-CDD / Intermittent / Synthèse / Heures / Véhicules
 *  - feuille de route (.xlsx) : un onglet par jour de la plage
 */
export async function exportPlanningZip(opts: ExportZipOpts): Promise<{
  filename: string;
  files: string[];
}> {
  const { weekStarts, rangeStart, rangeEnd } = opts;
  const startISO = format(rangeStart, "yyyy-MM-dd");
  const endISO = format(rangeEnd, "yyyy-MM-dd");

  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const files: string[] = [];

  // 1) Planning multi-vues
  const planning = buildPlanningWorkbookRange({
    weekStarts,
    metiers: opts.metiers,
    employes: opts.employes,
    affaires: opts.affaires,
    assignations: opts.assignations,
    consommation: opts.consommation,
    absences: opts.absences,
    chefsById: opts.chefsById,
    vehicules: opts.vehicules,
    trajets: opts.trajets,
  });
  if (planning) {
    zip.file(planning.filename, workbookToBlob(planning.wb));
    files.push(planning.filename);
  }

  // 2) Feuille de route — récupérer données spécifiques (type_operation, est_chef_jour, profiles)
  const dates: Date[] = [];
  for (let d = new Date(rangeStart); d <= rangeEnd; d = addDays(d, 1)) dates.push(new Date(d));

  const [asgsRes, affsRes, profsRes] = await Promise.all([
    supabase
      .from("assignations")
      .select("affaire_id, date, employe_id, metier_id, type_operation, est_chef_jour")
      .gte("date", startISO)
      .lte("date", endISO),
    supabase
      .from("affaires")
      .select(
        "id, numero, nom, lieu, chef_chantier_id, chef_projet_id, charge_affaires_id, date_montage, date_demontage",
      ),
    supabase.from("profiles").select("id, full_name, est_manutention"),
  ]);

  const asgs = (asgsRes.data ?? []) as ExtAssignation[];
  const affs = (affsRes.data ?? []) as ExtAffaire[];
  const profiles = new Map<string, ProfileLite>();
  (profsRes.data ?? []).forEach((p) => profiles.set(p.id, p as ProfileLite));

  // Map employes pour resolveResponsable
  const employesParId = new Map<string, EmployeForResponsable>();
  opts.employes.forEach((e) => {
    const profileId = (e as Employe & { profile_id?: string | null }).profile_id ?? null;
    const prof = profileId ? profiles.get(profileId) : null;
    employesParId.set(e.id, {
      id: e.id,
      profile_id: profileId,
      est_manutention: prof?.est_manutention ?? false,
    });
  });

  const responsables = new Map<string, string>();
  for (const d of dates) {
    const dISO = format(d, "yyyy-MM-dd");
    const dayAsgs = asgs.filter((a) => a.date === dISO);
    const ids = Array.from(new Set(dayAsgs.map((a) => a.affaire_id)));
    for (const id of ids) {
      const aff = affs.find((a) => a.id === id);
      if (!aff) continue;
      const r = resolveResponsable(
        aff,
        dISO,
        dayAsgs.map((a) => ({
          affaire_id: a.affaire_id,
          date: a.date,
          employe_id: a.employe_id,
          est_chef_jour: a.est_chef_jour,
        })),
        employesParId,
      );
      let label = "—";
      if (r.id) {
        if (r.source === "chef_du_jour" || r.source === "manutention") {
          const e = opts.employes.find((x) => x.id === r.id);
          if (e) label = `${e.prenom} ${e.nom}`;
        } else {
          const p = profiles.get(r.id);
          if (p?.full_name) label = p.full_name;
        }
      }
      responsables.set(`${id}|${dISO}`, label);
    }
  }

  if (asgs.length > 0) {
    const fr = feuilleRouteToBlob({
      dates,
      affaires: affs.map((a) => ({ id: a.id, numero: a.numero, nom: a.nom, lieu: a.lieu })),
      employes: opts.employes.map((e) => ({ id: e.id, prenom: e.prenom, nom: e.nom })),
      metiers: opts.metiers.map((m) => ({ id: m.id, libelle: m.libelle })),
      assignations: asgs.map((a) => ({
        affaire_id: a.affaire_id,
        date: a.date,
        employe_id: a.employe_id,
        metier_id: a.metier_id,
        type_operation: a.type_operation,
      })),
      responsables,
    });
    zip.file(fr.filename, fr.blob);
    files.push(fr.filename);
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const filename = `planning-export-${startISO}-${endISO}.zip`;

  // Trigger download
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  return { filename, files };
}
