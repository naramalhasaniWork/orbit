"use client";

import { cn } from "@/lib/utils";
import { getScoreColor } from "@/components/audit/score-display";

interface TrendPoint {
  date: string;
  score: number;
  issues: number;
}

interface AuditTrendChartProps {
  data: TrendPoint[];
}

/**
 * Simple SVG-based trend chart showing audit score over time.
 * Uses the same green/amber/red coloring as score display.
 */
export function AuditTrendChart({ data }: AuditTrendChartProps) {
  if (data.length < 2) return null;

  const width = 600;
  const height = 120;
  const padding = { top: 10, right: 10, bottom: 24, left: 36 };

  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const scores = data.map((d) => d.score);
  const minScore = Math.max(0, Math.min(...scores) - 10);
  const maxScore = Math.min(100, Math.max(...scores) + 10);
  const range = maxScore - minScore || 1;

  const points = data.map((d, i) => ({
    x: padding.left + (i / (data.length - 1)) * chartW,
    y: padding.top + chartH - ((d.score - minScore) / range) * chartH,
    score: d.score,
    date: d.date,
  }));

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  // Fill area path
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${
    padding.top + chartH
  } L ${points[0].x} ${padding.top + chartH} Z`;

  const latestScore = data[data.length - 1]?.score ?? 0;
  const strokeColor =
    latestScore >= 90
      ? "rgb(52, 211, 153)"
      : latestScore >= 70
        ? "rgb(251, 191, 36)"
        : "rgb(248, 113, 113)";

  const fillColor =
    latestScore >= 90
      ? "rgba(52, 211, 153, 0.1)"
      : latestScore >= 70
        ? "rgba(251, 191, 36, 0.1)"
        : "rgba(248, 113, 113, 0.1)";

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto min-w-[400px]"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Grid lines */}
        {[0, 25, 50, 75, 100]
          .filter((v) => v >= minScore && v <= maxScore)
          .map((v) => {
            const y = padding.top + chartH - ((v - minScore) / range) * chartH;
            return (
              <g key={v}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="rgba(255,255,255,0.06)"
                  strokeDasharray="4 4"
                />
                <text
                  x={padding.left - 6}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-muted-foreground"
                  fontSize={10}
                >
                  {v}
                </text>
              </g>
            );
          })}

        {/* Area fill */}
        <path d={areaPath} fill={fillColor} />

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke={strokeColor}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={3} fill={strokeColor} />
            <text
              x={p.x}
              y={height - 4}
              textAnchor="middle"
              className="fill-muted-foreground"
              fontSize={9}
            >
              {new Date(p.date).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
