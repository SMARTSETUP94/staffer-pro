/**
 * Sprint D / Batch 3 — Gantt macro « Planning chantier »
 *
 * SVG pur (pas de lib externe). Affiche 7 phases verticales + jalons ponctuels.
 * - Clamp visuel : window_start → window_end
 * - Phases "dates_manquantes" : pas rendues, badge en bordure
 * - Mini-KPI dans la barre : "X/Y · Z%" (compact)
 * - Tooltip au survol (title SVG natif) : version longue
 */
import { useMemo } from "react";
import type { PlanningChantierMacro, PlanningPhaseKey } from "@/server/planning-chantier-macro.functions";
import { phaseColor as basePhaseColor } from "@/components/atoms/PhaseBadge";

const PHASE_COLORS: Record<PlanningPhaseKey, string> = {
  commercial_etude: basePhaseColor("commercial_etude"),
  fabrication: basePhaseColor("fabrication"),
  logistique_aller: basePhaseColor("logistique"),
  montage: basePhaseColor("montage"),
  evenement: "#a855f7",
  demontage: basePhaseColor("demontage"),
  logistique_retour: basePhaseColor("logistique"),
};

const ROW_HEIGHT = 36;
const ROW_GAP = 6;
const LEFT_AXIS = 200;
const RIGHT_PAD = 20;
const TOP_PAD = 32;
const BOTTOM_PAD = 52;

function diffDays(a: string, b: string): number {
  return (
    (new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) /
    86_400_000
  );
}

function fmt(d: string | null): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00Z").toLocaleDateString("fr-FR", {
    day: "2-digit", month: "short",
  });
}

interface Props {
  data: PlanningChantierMacro;
  width?: number;
}

export function PlanningChantierGantt({ data, width = 960 }: Props) {
  const innerW = width - LEFT_AXIS - RIGHT_PAD;
  const totalDays = Math.max(1, diffDays(data.window_start, data.window_end));
  const dayToX = (iso: string) => {
    const d = Math.max(0, Math.min(totalDays, diffDays(data.window_start, iso)));
    return LEFT_AXIS + (d / totalDays) * innerW;
  };

  // Logistique retour : groupée avec démontage (pas de ligne propre)
  const displayPhases = data.phases.filter((p) => p.key !== "logistique_retour");
  const logRetour = data.phases.find((p) => p.key === "logistique_retour");

  const rowCount = displayPhases.length;
  const height = TOP_PAD + rowCount * (ROW_HEIGHT + ROW_GAP) + BOTTOM_PAD;

  // Ticks mensuels approximatifs
  const ticks = useMemo(() => {
    const out: { x: number; label: string }[] = [];
    const start = new Date(data.window_start + "T00:00:00Z");
    const end = new Date(data.window_end + "T00:00:00Z");
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cur <= end) {
      const iso = cur.toISOString().slice(0, 10);
      if (cur >= start) {
        out.push({
          x: dayToX(iso),
          label: cur.toLocaleDateString("fr-FR", { month: "short" }),
        });
      }
      cur.setMonth(cur.getMonth() + 1);
    }
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.window_start, data.window_end, innerW]);

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label="Planning chantier macro"
        className="block"
      >
        {/* En-tête : ticks mensuels */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={t.x}
              x2={t.x}
              y1={TOP_PAD - 8}
              y2={height - BOTTOM_PAD}
              stroke="currentColor"
              strokeOpacity={0.08}
            />
            <text
              x={t.x}
              y={TOP_PAD - 12}
              textAnchor="middle"
              fontSize={10}
              fill="currentColor"
              opacity={0.6}
            >
              {t.label}
            </text>
          </g>
        ))}

        {/* Lignes axe Y + barres phase */}
        {displayPhases.map((p, idx) => {
          const y = TOP_PAD + idx * (ROW_HEIGHT + ROW_GAP);
          const color = PHASE_COLORS[p.key];
          const hasDates = p.start && p.end;
          const x1 = hasDates ? dayToX(p.start!) : 0;
          const x2 = hasDates ? dayToX(p.end!) : 0;
          const barW = Math.max(2, x2 - x1);
          const cy = y + ROW_HEIGHT / 2;
          const ratioTxt =
            p.ratio_consomme_pct != null
              ? `${p.equipe_count}/${p.equipe_total ?? "-"} · ${p.ratio_consomme_pct}%`
              : p.equipe_count > 0
              ? `${p.equipe_count} pers`
              : "";
          const tooltip = hasDates
            ? `${p.label} · ${fmt(p.start)} → ${fmt(p.end)}${p.ratio_consomme_pct != null ? ` · ${p.ratio_consomme_pct}% consommé (${p.heures_consommees ?? 0}/${p.heures_prevues ?? 0} h)` : ""}${p.equipe_count > 0 ? ` · ${p.equipe_count} pers castées` : ""}`
            : `${p.label} — dates manquantes`;

          // Rendu spécial : événement = triangle noir, logistique aller = rond rouge
          const isMarker = p.key === "evenement" || p.key === "logistique_aller";

          return (
            <g key={p.key}>
              {/* Label axe Y */}
              <text
                x={LEFT_AXIS - 12}
                y={cy + 4}
                textAnchor="end"
                fontSize={12}
                fontWeight={600}
                fill="currentColor"
                opacity={0.85}
              >
                {p.label}
              </text>

              {/* Ligne baseline */}
              <line
                x1={LEFT_AXIS}
                x2={width - RIGHT_PAD}
                y1={cy}
                y2={cy}
                stroke="currentColor"
                strokeOpacity={0.06}
              />

              {hasDates && isMarker ? (
                p.key === "evenement" ? (
                  <polygon
                    points={`${x1},${cy - 9} ${x1 + 10},${cy + 7} ${x1 - 10},${cy + 7}`}
                    fill="#0a0a0a"
                    stroke="hsl(var(--background))"
                    strokeWidth={1.5}
                  >
                    <title>{tooltip}</title>
                  </polygon>
                ) : (
                  <circle
                    cx={x1}
                    cy={cy}
                    r={7}
                    fill="#dc2626"
                    stroke="hsl(var(--background))"
                    strokeWidth={1.5}
                  >
                    <title>{tooltip}</title>
                  </circle>
                )
              ) : hasDates ? (
                <g>
                  <rect
                    x={x1}
                    y={y + 4}
                    width={barW}
                    height={ROW_HEIGHT - 8}
                    rx={6}
                    ry={6}
                    fill={color}
                    fillOpacity={p.statut === "fallback" ? 0.45 : 0.85}
                    stroke={color}
                    strokeWidth={1}
                  >
                    <title>{tooltip}</title>
                  </rect>
                  {ratioTxt && barW > 60 && (
                    <text
                      x={x1 + 8}
                      y={cy + 4}
                      fontSize={11}
                      fontWeight={600}
                      fill="white"
                      pointerEvents="none"
                    >
                      {ratioTxt}
                    </text>
                  )}
                </g>
              ) : (
                <g>
                  <rect
                    x={LEFT_AXIS + 4}
                    y={y + 8}
                    width={140}
                    height={ROW_HEIGHT - 16}
                    rx={4}
                    fill="currentColor"
                    fillOpacity={0.04}
                    stroke="currentColor"
                    strokeOpacity={0.15}
                    strokeDasharray="4 3"
                  >
                    <title>{tooltip}</title>
                  </rect>
                  <text
                    x={LEFT_AXIS + 14}
                    y={cy + 4}
                    fontSize={11}
                    fill="currentColor"
                    opacity={0.5}
                  >
                    Dates manquantes
                  </text>
                </g>
              )}
            </g>
          );
        })}


        {/* Jalons (losanges) — stagger labels when proches pour éviter chevauchement */}
        {(() => {
          const jalons = data.jalons
            .filter((j) => j.date)
            .map((j) => ({ ...j, x: dayToX(j.date!) }))
            .sort((a, b) => a.x - b.x);
          const MIN_GAP = 60;
          let lastX = -Infinity;
          let lastLevel = 1;
          return jalons.map((j) => {
            const level = j.x - lastX < MIN_GAP ? (lastLevel === 0 ? 1 : 0) : 0;
            lastX = j.x;
            lastLevel = level;
            const y = height - BOTTOM_PAD + 14;
            const labelY = 20 + level * 12;
            return (
              <g key={j.key} transform={`translate(${j.x},${y})`}>
                <polygon
                  points="0,-6 6,0 0,6 -6,0"
                  fill="hsl(var(--primary))"
                  stroke="hsl(var(--background))"
                  strokeWidth={1.5}
                >
                  <title>{`${j.label} — ${fmt(j.date)}`}</title>
                </polygon>
                <text
                  x={0}
                  y={labelY}
                  textAnchor="middle"
                  fontSize={9}
                  fill="currentColor"
                  opacity={0.7}
                >
                  {j.label}
                </text>
              </g>
            );
          });
        })()}

      </svg>
    </div>
  );
}
