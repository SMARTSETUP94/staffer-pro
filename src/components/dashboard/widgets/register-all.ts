/**
 * v0.26.0 — Enregistrement de tous les widgets dans le registry.
 * Importer ce fichier au boot du dashboard.
 */
import { registerWidget } from "@/lib/dashboard/widget-registry";
import { KpiTopWidget } from "./KpiTopWidget";
import { OpportunitesPrioriteWidget } from "./OpportunitesPrioriteWidget";
import { PipelineChargeAffairesWidget } from "./PipelineChargeAffairesWidget";
import { PipelineTypologieWidget } from "./PipelineTypologieWidget";
import { ConversionsRecentesWidget } from "./ConversionsRecentesWidget";
import { OpportunitesPerduesWidget } from "./OpportunitesPerduesWidget";
import { MeteoChantiersWidget } from "./MeteoChantiersWidget";
import { MontagesJ7Widget } from "./MontagesJ7Widget";
import { TensionBudgetWidget } from "./TensionBudgetWidget";
import { AbsencesSemaineWidget } from "./AbsencesSemaineWidget";
import { FlotteKpisWidget } from "./FlotteKpisWidget";
import { ChargeAtelierWidget } from "./ChargeAtelierWidget";
import { ObjetsEnRetardWidget } from "./ObjetsEnRetardWidget";
import { ChargeEquipeWidget } from "./ChargeEquipeWidget";
import { MesEtapesFabWidget } from "./MesEtapesFabWidget";
import { HeuresAValiderWidget } from "./HeuresAValiderWidget";
import { SousEffectifJ7Widget } from "./SousEffectifJ7Widget";
import { AnniversairesWidget } from "./AnniversairesWidget";
import { SaintDuJourWidget } from "./SaintDuJourWidget";
import { TopConstructeurWidget } from "./TopConstructeurWidget";
import { ChefProjetMoisWidget } from "./ChefProjetMoisWidget";
import { AstucesMarqueeWidget } from "./AstucesMarqueeWidget";
import { QuizDuJourWidget } from "./QuizDuJourWidget";
import { QuizLeaderboardWidget } from "./QuizLeaderboardWidget";
import { MonEquipeTypeWidget } from "./MonEquipeTypeWidget";
import { InboxWidget } from "./InboxWidget";


let registered = false;

export function registerAllWidgets(): void {
  if (registered) return;
  registerWidget("kpi_top", KpiTopWidget);
  registerWidget("opportunites_priorite", OpportunitesPrioriteWidget);
  registerWidget("pipeline_charge_affaires", PipelineChargeAffairesWidget);
  registerWidget("pipeline_typologie", PipelineTypologieWidget);
  registerWidget("conversions_recentes", ConversionsRecentesWidget);
  registerWidget("opportunites_perdues", OpportunitesPerduesWidget);
  registerWidget("meteo_chantiers", MeteoChantiersWidget);
  registerWidget("montages_j7", MontagesJ7Widget);
  registerWidget("tension_budget", TensionBudgetWidget);
  registerWidget("absences_semaine", AbsencesSemaineWidget);
  registerWidget("flotte_kpis", FlotteKpisWidget);
  registerWidget("charge_atelier", ChargeAtelierWidget);
  registerWidget("objets_en_retard", ObjetsEnRetardWidget);
  registerWidget("charge_equipe", ChargeEquipeWidget);
  registerWidget("mes_etapes_fab", MesEtapesFabWidget);
  registerWidget("heures_a_valider", HeuresAValiderWidget);
  registerWidget("sous_effectif_J7", SousEffectifJ7Widget);
  registerWidget("anniversaires", AnniversairesWidget);
  registerWidget("saint_du_jour", SaintDuJourWidget);
  registerWidget("top_constructeur", TopConstructeurWidget);
  registerWidget("chef_projet_mois", ChefProjetMoisWidget);
  registerWidget("astuces_marquee", AstucesMarqueeWidget);
  registerWidget("quiz_du_jour", QuizDuJourWidget);
  registerWidget("quiz_leaderboard", QuizLeaderboardWidget);
  registerWidget("mon_equipe_type", MonEquipeTypeWidget);
  registerWidget("inbox", InboxWidget);
  registered = true;
}

