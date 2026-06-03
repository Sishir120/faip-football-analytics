"use client";

import { useEffect, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { API_URL } from "@/lib/api";

interface XGTimelineChartProps {
  matchId: number;
  onRefresh?: () => void;
}

export default function XGTimelineChart({ matchId }: XGTimelineChartProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_URL}/api/viz/xg-timeline?match_id=${matchId}`);
        if (!res.ok) {
          throw new Error(`Failed to load xG timeline (status ${res.status})`);
        }
        const json = await res.json();
        if (isMounted) {
          setData(json);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || "Failed to load xG timeline");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    fetchData();
    return () => {
      isMounted = false;
    };
  }, [matchId]);

  if (loading) {
    return (
      <div className="glass-panel rounded-2xl w-full h-[400px] flex flex-col items-center justify-center bg-[#0b0c10]">
        <div className="w-10 h-10 border-2 border-sky-500/25 border-t-sky-400 rounded-full animate-spin mb-3"></div>
        <span className="text-xs font-semibold text-sky-400 tracking-wider uppercase animate-pulse-slow">
          Plotting Cumulative xG Timeline...
        </span>
      </div>
    );
  }

  if (error || !data || !data.data || data.data.length < 2) {
    return (
      <div className="glass-panel rounded-2xl w-full h-[400px] flex flex-col items-center justify-center text-center p-6 bg-[#0b0c10]">
        <AlertCircle className="text-rose-500 mb-3" size={32} />
        <h4 className="text-sm font-bold text-slate-200 mb-1">xG Timeline Error</h4>
        <p className="text-xs text-slate-400 max-w-[280px] mb-4">{error || "Invalid graph data structure"}</p>
      </div>
    );
  }

  // Parse Plotly data structure
  const homeTrace = data.data[0];
  const awayTrace = data.data[1];
  const homeTeam = homeTrace.name || "Home Team";
  const awayTeam = awayTrace.name || "Away Team";
  
  const homeX = homeTrace.x || [];
  const homeY = homeTrace.y || [];
  const awayX = awayTrace.x || [];
  const awayY = awayTrace.y || [];

  const maxMin = Math.max(90, ...homeX, ...awayX);
  const maxHomeXG = homeY[homeY.length - 1] || 0.0;
  const maxAwayXG = awayY[awayY.length - 1] || 0.0;
  const maxVal = Math.max(1.0, maxHomeXG, maxAwayXG);
  const maxScaleXG = Math.ceil(maxVal * 1.1 * 2) / 2; // Nice grid padding

  // SVG parameters
  const width = 850;
  const height = 380;
  const paddingLeft = 55;
  const paddingRight = 45;
  const paddingTop = 45;
  const paddingBottom = 45;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Scaling helper functions
  const scaleX = (min: number) => paddingLeft + (min / maxMin) * chartWidth;
  const scaleY = (xg: number) => paddingTop + chartHeight - (xg / maxScaleXG) * chartHeight;

  // Convert points to shape='hv' stepwise SVG path
  const makeStepPath = (xArr: number[], yArr: number[]) => {
    if (xArr.length === 0) return "";
    let d = `M ${scaleX(xArr[0])} ${scaleY(yArr[0])}`;
    for (let i = 1; i < xArr.length; i++) {
      const prevX = xArr[i - 1];
      const currX = xArr[i];
      const prevY = yArr[i - 1];
      const currY = yArr[i];
      
      // Step horizontally to the new time, then vertically to the new xG
      d += ` H ${scaleX(currX)} V ${scaleY(currY)}`;
    }
    return d;
  };

  const homePath = makeStepPath(homeX, homeY);
  const awayPath = makeStepPath(awayX, awayY);

  // Extract goals from Plotly layout annotations
  const annotations = data.layout?.annotations || [];
  const goals = annotations.map((ann: any) => {
    // Goal text example: "⚽ Lionel Messi (39')"
    const text = ann.text || "";
    const isHome = ann.arrowcolor === "#38bdf8" || text.includes(homeTeam);
    return {
      x: ann.x,
      y: ann.y,
      text: text,
      isHome: isHome
    };
  });

  // Grid tick markers
  const xTicks = [];
  for (let i = 0; i <= maxMin; i += 15) {
    xTicks.push(i);
  }

  const yTicks = [];
  const tickStep = maxScaleXG > 3 ? 1.0 : 0.5;
  for (let i = 0.0; i <= maxScaleXG; i += tickStep) {
    yTicks.push(i);
  }

  return (
    <div className="glass-panel rounded-2xl overflow-hidden flex flex-col bg-[#0b0c10] h-full shadow-2xl">
      {/* Title Toolbar */}
      <div className="px-5 py-3.5 border-b border-slate-800/60 bg-slate-900/30 flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-wide text-slate-200">
          Interactive Expected Goals (xG) Timeline
        </h3>
        
        {/* Scorecard badges */}
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20 text-xs font-bold">
            {homeTeam}: {maxHomeXG.toFixed(2)} xG
          </span>
          <span className="text-slate-500 text-xs font-semibold">vs</span>
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-bold">
            {awayTeam}: {maxAwayXG.toFixed(2)} xG
          </span>
        </div>
      </div>

      {/* SVG Canvas Container */}
      <div className="relative w-full overflow-x-auto p-4 flex items-center justify-center">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-[850px] select-none">
          {/* Y Axis Grid lines */}
          {yTicks.map((y) => (
            <g key={`y-${y}`}>
              <line
                x1={paddingLeft}
                y1={scaleY(y)}
                x2={width - paddingRight}
                y2={scaleY(y)}
                stroke="#1e293b"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <text
                x={paddingLeft - 12}
                y={scaleY(y) + 4}
                fill="#64748b"
                fontSize={10}
                fontWeight="600"
                textAnchor="end"
              >
                {y.toFixed(1)}
              </text>
            </g>
          ))}

          {/* X Axis Grid lines */}
          {xTicks.map((x) => (
            <g key={`x-${x}`}>
              <line
                x1={scaleX(x)}
                y1={paddingTop}
                x2={scaleX(x)}
                y2={height - paddingBottom}
                stroke="#1e293b"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <text
                x={scaleX(x)}
                y={height - paddingBottom + 18}
                fill="#64748b"
                fontSize={10}
                fontWeight="600"
                textAnchor="middle"
              >
                {x}'
              </text>
            </g>
          ))}

          {/* Axis labels */}
          <text
            x={paddingLeft + chartWidth / 2}
            y={height - 8}
            fill="#94a3b8"
            fontSize={11}
            fontWeight="bold"
            textAnchor="middle"
          >
            Match Minute
          </text>
          <text
            x={12}
            y={paddingTop + chartHeight / 2}
            fill="#94a3b8"
            fontSize={11}
            fontWeight="bold"
            textAnchor="middle"
            transform={`rotate(-90 12 ${paddingTop + chartHeight / 2})`}
          >
            Cumulative Expected Goals (xG)
          </text>

          {/* Draw Home Team Step Line */}
          {homePath && (
            <path
              d={homePath}
              fill="none"
              stroke="#38bdf8"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="bevel"
              className="transition-all duration-300"
            />
          )}

          {/* Draw Away Team Step Line */}
          {awayPath && (
            <path
              d={awayPath}
              fill="none"
              stroke="#f43f5e"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="bevel"
              className="transition-all duration-300"
            />
          )}

          {/* Draw Goal Markers & Labels */}
          {goals.map((g: any, idx: number) => {
            const circleX = scaleX(g.x);
            const circleY = scaleY(g.y);
            const isHome = g.isHome;
            const markerColor = isHome ? "#38bdf8" : "#f43f5e";
            
            // Stagger annotation label placement vertically to avoid overlap
            const isEven = idx % 2 === 0;
            const labelYOffset = isHome 
              ? (isEven ? -25 : -40) 
              : (isEven ? 25 : 40);

            return (
              <g key={`goal-${idx}`}>
                {/* Connector line */}
                <line
                  x1={circleX}
                  y1={circleY}
                  x2={circleX}
                  y2={circleY + labelYOffset * 0.7}
                  stroke={markerColor}
                  strokeWidth={1.2}
                  strokeDasharray="2 2"
                />
                
                {/* Ripple ring effect */}
                <circle
                  cx={circleX}
                  cy={circleY}
                  r={8}
                  fill="none"
                  stroke={markerColor}
                  strokeWidth={1.5}
                  opacity={0.5}
                  className="animate-ping"
                  style={{ transformOrigin: `${circleX}px ${circleY}px` }}
                />
                
                {/* Goal point */}
                <circle
                  cx={circleX}
                  cy={circleY}
                  r={4.5}
                  fill="#ffffff"
                  stroke={markerColor}
                  strokeWidth={3}
                />

                {/* Styled Card Label */}
                <g transform={`translate(${circleX}, ${circleY + labelYOffset})`}>
                  <rect
                    x={-55}
                    y={-10}
                    width={110}
                    height={20}
                    rx={4}
                    fill="#0e1117"
                    stroke={markerColor}
                    strokeWidth={1}
                  />
                  <text
                    x={0}
                    y={3}
                    fill="#ffffff"
                    fontSize={8.5}
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    {g.text.replace("⚽ ", "")}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend Block */}
      <div className="px-5 py-3 bg-slate-900/20 border-t border-slate-800/40 flex justify-center gap-6">
        <div className="flex items-center gap-2">
          <span className="w-4 h-1 bg-[#38bdf8] rounded-full inline-block"></span>
          <span className="text-xs font-bold text-slate-300">{homeTeam} xG</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-1 bg-[#f43f5e] rounded-full inline-block"></span>
          <span className="text-xs font-bold text-slate-300">{awayTeam} xG</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-white border-2 border-amber-400 inline-block"></span>
          <span className="text-xs font-bold text-slate-300">Goal Event</span>
        </div>
      </div>
    </div>
  );
}
