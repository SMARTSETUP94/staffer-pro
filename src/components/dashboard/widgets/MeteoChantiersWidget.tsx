/**
 * v0.26.0 — Wrapper widget pour le bloc Météo chantiers existant.
 * No-regression : conserve le composant tel quel.
 */
import { MeteoChantiersBloc } from "@/components/dashboard/MeteoChantiersBloc";

export function MeteoChantiersWidget() {
  return <MeteoChantiersBloc />;
}
