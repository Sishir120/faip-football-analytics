"use client";

import { useState, useMemo, useCallback } from "react";
import {
  GitBranch,
  SlidersHorizontal,
  Play,
  Loader2,
  AlertCircle,
  ChevronUp,
  ChevronDown,
  Users,
  Zap,
  Shield,
  TrendingUp,
  RefreshCw,
} from "lucide-react";
import { API_URL as API } from "@/lib/api";

/* ── Types ────────────────────────────────────────────────────────── */
interface TeamEntry {
  team: string;
  cluster_id: number;
  archetype: string;
  pca_x: number | null;
  pca_y: number | null;
  goals_per90: number | null;
  xg_per90: number | null;
  ppda: number | null;
  possession_pct: number | null;
  passes_per90: number | null;
  shots_per90: number | null;
  pressures_per90: number | null;
  tackles_per90: number | null;
  interceptions_per90: number | null;
}

interface Centroid {
  cluster_id: number;
  archetype: string;
  goals_per90: number;
  xg_per90: number;
  ppda: number;
  possession_pct: number;
  passes_per90: number;
  shots_per90?: number;
  pressures_per90?: number;
  tackles_per90?: number;
  interceptions_per90?: number;
}

interface ClusterResult {
  teams: TeamEntry[];
  centroids: Centroid[];
  explained_variance: [number | null, number | null];
  n_clusters: number;
  season: string;
  competition: string;
  source: string;
}

/* ── Constants ────────────────────────────────────────────────────── */

const ARCHETYPE_COLORS: Record<string, string> = {
  "High Press": "#ef4444",
  Possession: "#3b82f6",
  "Counter Attack": "#f59e0b",
  "Low Block": "#6b7280",
};

const ARCHETYPE_ICONS: Record<string, React.ComponentType<any>> = {
  "High Press": Zap,
  Possession: TrendingUp,
  "Counter Attack": Play,
  "Low Block": Shield,
};

function archetypeColor(a: string) {
  return ARCHETYPE_COLORS[a] ?? "#6b7280";
}

/* ── Archetype Badge ──────────────────────────────────────────────── */
function ArchetypeBadge({ archetype }: { archetype: string }) {
  const color = archetypeColor(archetype);
  return (
    <span
      className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-md border whitespace-nowrap"
      style={{
        color,
        borderColor: `${color}40`,
        backgroundColor: `${color}18`,
      }}
    >
      {archetype}
    </span>
  );
}

/* ── PCA Scatter (pure SVG) ───────────────────────────────────────── */
interface TooltipState {
  x: number;
  y: number;
  team: TeamEntry;
}

function PCAScatter({
  teams,
  varianceX,
  varianceY,
}: {
  teams: TeamEntry[];
  varianceX: number | null;
  varianceY: number | null;
}) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const PAD = { left: 60, right: 20, top: 30, bottom: 50 };
  const W = 600;
  const H = 460;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  // Valid teams with PCA coords
  const valid = teams.filter((t) => t.pca_x != null && t.pca_y != null);
  if (valid.length === 0) return null;

  const xs = valid.map((t) => t.pca_x as number);
  const ys = valid.map((t) => t.pca_y as number);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  function toSVG(px: number, py: number) {
    const sx = PAD.left + ((px - minX) / rangeX) * plotW;
    const sy = PAD.top + plotH - ((py - minY) / rangeY) * plotH;
    return { sx, sy };
  }

  // Grid lines (5 each axis)
  const gridXSteps = Array.from({ length: 5 }, (_, i) => PAD.left + (i * plotW) / 4);
  const gridYSteps = Array.from({ length: 5 }, (_, i) => PAD.top + (i * plotH) / 4);

  const xLabel = varianceX != null ? `PC1 (${(varianceX * 100).toFixed(1)}% var)` : "PC1";
  const yLabel = varianceY != null ? `PC2 (${(varianceY * 100).toFixed(1)}% var)` : "PC2";

  return (
    <div className="relative select-none">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Grid lines */}
        {gridXSteps.map((gx, i) => (
          <line key={`gx${i}`} x1={gx} y1={PAD.top} x2={gx} y2={PAD.top + plotH}
            stroke="#1e293b" strokeWidth="1" strokeDasharray="4 4" />
        ))}
        {gridYSteps.map((gy, i) => (
          <line key={`gy${i}`} x1={PAD.left} y1={gy} x2={PAD.left + plotW} y2={gy}
            stroke="#1e293b" strokeWidth="1" strokeDasharray="4 4" />
        ))}

        {/* Axes */}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + plotH}
          stroke="#334155" strokeWidth="1.5" />
        <line x1={PAD.left} y1={PAD.top + plotH} x2={PAD.left + plotW} y2={PAD.top + plotH}
          stroke="#334155" strokeWidth="1.5" />

        {/* Axis labels */}
        <text x={PAD.left + plotW / 2} y={H - 8} textAnchor="middle"
          fontSize="11" fill="#64748b" fontFamily="Inter, sans-serif" fontWeight="600">
          {xLabel}
        </text>
        <text x={14} y={PAD.top + plotH / 2} textAnchor="middle"
          fontSize="11" fill="#64748b" fontFamily="Inter, sans-serif" fontWeight="600"
          transform={`rotate(-90, 14, ${PAD.top + plotH / 2})`}>
          {yLabel}
        </text>

        {/* Team points */}
        {valid.map((team) => {
          const { sx, sy } = toSVG(team.pca_x!, team.pca_y!);
          const color = archetypeColor(team.archetype);
          const shortName = team.team.split(" ").slice(-1)[0];
          return (
            <g key={team.team}
              onMouseEnter={(e) => setTooltip({ x: sx, y: sy, team })}
              style={{ cursor: "pointer" }}
            >
              <circle cx={sx} cy={sy} r={10} fill={color} opacity={0.82}
                stroke={`${color}60`} strokeWidth="2" />
              <text x={sx + 13} y={sy + 4} fontSize="9" fill="#cbd5e1"
                fontFamily="Inter, sans-serif" fontWeight="600">
                {shortName}
              </text>
            </g>
          );
        })}

        {/* Tooltip */}
        {tooltip && (() => {
          const tx = Math.min(tooltip.x + 14, W - 180);
          const ty = Math.max(tooltip.y - 80, PAD.top);
          const t = tooltip.team;
          return (
            <g>
              <rect x={tx} y={ty} width={172} height={90} rx={6}
                fill="#0d1117" stroke="#334155" strokeWidth="1" opacity={0.97} />
              <text x={tx + 8} y={ty + 16} fontSize="10" fill="#f1f5f9"
                fontFamily="Inter, sans-serif" fontWeight="700">{t.team}</text>
              <text x={tx + 8} y={ty + 30} fontSize="9" fill={archetypeColor(t.archetype)}
                fontFamily="Inter, sans-serif" fontWeight="600">{t.archetype}</text>
              <text x={tx + 8} y={ty + 46} fontSize="9" fill="#94a3b8"
                fontFamily="Inter, sans-serif">
                {`Goals/90: ${t.goals_per90?.toFixed(2) ?? "—"}`}
              </text>
              <text x={tx + 8} y={ty + 60} fontSize="9" fill="#94a3b8"
                fontFamily="Inter, sans-serif">
                {`PPDA: ${t.ppda?.toFixed(2) ?? "—"}`}
              </text>
              <text x={tx + 8} y={ty + 74} fontSize="9" fill="#94a3b8"
                fontFamily="Inter, sans-serif">
                {`Poss: ${t.possession_pct?.toFixed(1) ?? "—"}%`}
              </text>
            </g>
          );
        })()}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-3 justify-center">
        {Object.entries(ARCHETYPE_COLORS).map(([arch, color]) => (
          <div key={arch} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-[11px] font-semibold text-slate-400">{arch}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Archetype Card ───────────────────────────────────────────────── */
function ArchetypeCard({
  centroid,
  teams,
}: {
  centroid: Centroid;
  teams: TeamEntry[];
}) {
  const color = archetypeColor(centroid.archetype);
  const Icon = ARCHETYPE_ICONS[centroid.archetype] ?? GitBranch;
  const clusterTeams = teams.filter((t) => t.cluster_id === centroid.cluster_id);

  const stats = [
    { label: "Goals/90", value: centroid.goals_per90?.toFixed(2) ?? "—" },
    { label: "xG/90", value: centroid.xg_per90?.toFixed(2) ?? "—" },
    { label: "PPDA", value: centroid.ppda?.toFixed(2) ?? "—" },
    { label: "Possession", value: centroid.possession_pct != null ? `${centroid.possession_pct.toFixed(1)}%` : "—" },
    { label: "Passes/90", value: centroid.passes_per90?.toFixed(1) ?? "—" },
  ];

  return (
    <div
      className="rounded-xl border p-4 flex flex-col gap-3 glass-panel"
      style={{ borderColor: `${color}25` }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg" style={{ backgroundColor: `${color}20` }}>
            <Icon size={14} style={{ color }} />
          </div>
          <span className="text-sm font-extrabold text-white">{centroid.archetype}</span>
        </div>
        <span className="text-[10px] font-bold text-slate-500 bg-slate-800/60 px-2 py-0.5 rounded-full">
          {clusterTeams.length} teams
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-0.5">
            <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">
              {s.label}
            </span>
            <span className="text-sm font-bold text-white">{s.value}</span>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-800/60 pt-2">
        <span className="text-[10px] text-slate-400 font-semibold">
          {clusterTeams.map((t) => t.team).join(", ")}
        </span>
      </div>
    </div>
  );
}

/* ── Sortable Table ───────────────────────────────────────────────── */
type SortKey = "team" | "goals_per90" | "xg_per90" | "ppda" | "possession_pct" | "passes_per90";

function StatsTable({ teams }: { teams: TeamEntry[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("team");
  const [sortAsc, setSortAsc] = useState(true);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(true); }
  };

  const sorted = useMemo(() => {
    return [...teams].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string") return sortAsc ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [teams, sortKey, sortAsc]);

  const cols: { key: SortKey; label: string }[] = [
    { key: "team", label: "Team" },
    { key: "goals_per90", label: "Goals/90" },
    { key: "xg_per90", label: "xG/90" },
    { key: "ppda", label: "PPDA" },
    { key: "possession_pct", label: "Poss%" },
    { key: "passes_per90", label: "Passes/90" },
  ];

  function SortIcon({ k }: { k: SortKey }) {
    if (k !== sortKey) return null;
    return sortAsc
      ? <ChevronUp size={12} className="inline ml-1 text-sky-400" />
      : <ChevronDown size={12} className="inline ml-1 text-sky-400" />;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800/60">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-800">
            <th className="text-left px-4 py-3 text-[10px] uppercase font-extrabold tracking-widest text-slate-500">
              Archetype
            </th>
            {cols.map((c) => (
              <th
                key={c.key}
                className="text-right px-4 py-3 text-[10px] uppercase font-extrabold tracking-widest text-slate-500 cursor-pointer hover:text-slate-300 select-none transition-colors whitespace-nowrap"
                onClick={() => handleSort(c.key)}
              >
                {c.label}
                <SortIcon k={c.key} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((t, i) => {
            const color = archetypeColor(t.archetype);
            return (
              <tr
                key={t.team}
                className={`border-b border-slate-800/40 transition-colors hover:bg-slate-800/20 ${i % 2 === 0 ? "bg-slate-900/20" : ""}`}
              >
                <td className="px-4 py-2.5">
                  <ArchetypeBadge archetype={t.archetype} />
                </td>
                <td className="px-4 py-2.5 font-semibold text-slate-200 text-right whitespace-nowrap">
                  {t.team}
                </td>
                <td className="px-4 py-2.5 text-right font-bold" style={{ color }}>
                  {t.goals_per90?.toFixed(2) ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-right font-bold text-slate-300">
                  {t.xg_per90?.toFixed(2) ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-right font-bold text-slate-300">
                  {t.ppda?.toFixed(2) ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-right font-bold text-slate-300">
                  {t.possession_pct?.toFixed(1) != null ? `${t.possession_pct?.toFixed(1)}%` : "—"}
                </td>
                <td className="px-4 py-2.5 text-right font-bold text-slate-300">
                  {t.passes_per90?.toFixed(1) ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────────────── */
export default function TeamClustersPage() {
  const [season, setSeason] = useState("2018/2019");
  const [competition, setCompetition] = useState("Spain - La Liga");
  const [nClusters, setNClusters] = useState(4);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClusterResult | null>(null);

  const handleRun = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const url = `${API}/api/ml/cluster/teams?season=${encodeURIComponent(season)}&competition=${encodeURIComponent(competition)}&n_clusters=${nClusters}&force_refresh=false`;
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? `HTTP ${res.status}`);
      }
      const data: ClusterResult = await res.json();
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [season, competition, nClusters]);

  // Unique archetypes in result order
  const uniqueArchetypes = useMemo(() => {
    if (!result) return [];
    const seen = new Set<number>();
    return result.centroids.filter((c) => {
      if (seen.has(c.cluster_id)) return false;
      seen.add(c.cluster_id);
      return true;
    });
  }, [result]);

  return (
    <div className="p-8 max-w-7xl mx-auto w-full flex-1 flex flex-col gap-8">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 p-8 rounded-2xl glass-panel relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/6 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-20 w-64 h-64 bg-blue-500/6 rounded-full blur-3xl pointer-events-none translate-y-1/2" />
        <span className="w-fit px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/25 text-xs font-bold tracking-wider uppercase">
          Phase 10 · KMeans + PCA
        </span>
        <h2 className="text-3xl font-extrabold tracking-tight text-white outfit-font">
          Team Style{" "}
          <span className="gradient-text">Clustering Engine</span>
        </h2>
        <p className="text-slate-400 text-sm max-w-2xl leading-relaxed">
          KMeans clustering over 12 per-90 tactical features — goals, xG, shots, PPDA, pressures, possession, passes, progressive passes, tackles, interceptions. PCA reduces to 2D for visualisation. Each cluster is automatically labelled with a tactical archetype.
        </p>
      </div>

      {/* ── Controls ───────────────────────────────────────────────── */}
      <div className="glass-panel p-5 rounded-2xl flex flex-col gap-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
          <SlidersHorizontal size={14} className="text-amber-400" />
          <h4 className="text-xs uppercase font-extrabold tracking-wider text-slate-200">
            Clustering Parameters
          </h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          {/* Season */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Season</label>
            <select
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              className="bg-[#090b0e] border border-slate-800 text-slate-200 text-sm font-semibold rounded-xl px-4 py-2.5 focus:outline-none focus:border-amber-500/40"
            >
              <option value="2018/2019">2018/2019</option>
              <option value="2017/2018">2017/2018</option>
              <option value="2019/2020">2019/2020</option>
              <option value="2020/2021">2020/2021</option>
              <option value="2021/2022">2021/2022</option>
              <option value="2022/2023">2022/2023</option>
            </select>
          </div>

          {/* Competition */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Competition</label>
            <select
              value={competition}
              onChange={(e) => setCompetition(e.target.value)}
              className="bg-[#090b0e] border border-slate-800 text-slate-200 text-sm font-semibold rounded-xl px-4 py-2.5 focus:outline-none focus:border-amber-500/40"
            >
              <option value="Spain - La Liga">La Liga</option>
              <option value="England - Premier League">Premier League</option>
              <option value="Germany - 1. Bundesliga">Bundesliga</option>
              <option value="Italy - Serie A">Serie A</option>
              <option value="France - Ligue 1">Ligue 1</option>
            </select>
          </div>

          {/* n_clusters slider */}
          <div className="flex flex-col gap-2">
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
              Clusters: <span className="text-amber-400 font-extrabold">{nClusters}</span>
            </label>
            <input
              type="range"
              min={2}
              max={8}
              value={nClusters}
              onChange={(e) => setNClusters(Number(e.target.value))}
              className="w-full accent-amber-500"
            />
            <div className="flex justify-between text-[9px] text-slate-600 font-bold">
              <span>2</span><span>4</span><span>6</span><span>8</span>
            </div>
          </div>

          {/* Run button */}
          <button
            onClick={handleRun}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-amber-500/15 transition-all"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <GitBranch size={14} />}
            {loading ? "Computing…" : "Run Clustering"}
          </button>
        </div>

        {result && (
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[10px] text-emerald-400 font-bold">
              ✓ {result.teams.length} teams clustered · source: {result.source}
            </span>
            <button
              onClick={() => { setResult(null); }}
              className="ml-auto text-[10px] text-slate-500 hover:text-slate-300 flex items-center gap-1 transition-colors"
            >
              <RefreshCw size={10} /> Reset
            </button>
          </div>
        )}
      </div>

      {/* ── Error ──────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <div className="text-sm font-semibold">{error}</div>
        </div>
      )}

      {/* ── Main Results ───────────────────────────────────────────── */}
      {result && (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Scatter + Archetype Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
            {/* PCA Scatter — left 60% */}
            <div className="lg:col-span-3 glass-panel p-5 rounded-2xl border border-slate-800/60">
              <div className="flex items-center gap-2 mb-4">
                <GitBranch size={14} className="text-amber-400" />
                <h4 className="text-xs uppercase font-extrabold tracking-wider text-slate-200">
                  PCA Scatter — Tactical Space
                </h4>
              </div>
              <PCAScatter
                teams={result.teams}
                varianceX={result.explained_variance[0]}
                varianceY={result.explained_variance[1]}
              />
            </div>

            {/* Archetype Cards — right 40% */}
            <div className="lg:col-span-2 flex flex-col gap-3">
              <div className="flex items-center gap-2 mb-1">
                <Users size={14} className="text-slate-400" />
                <h4 className="text-xs uppercase font-extrabold tracking-wider text-slate-300">
                  Tactical Archetypes
                </h4>
              </div>
              {uniqueArchetypes.map((centroid) => (
                <ArchetypeCard
                  key={centroid.cluster_id}
                  centroid={centroid}
                  teams={result.teams}
                />
              ))}
            </div>
          </div>

          {/* Stats Table */}
          <div className="glass-panel p-5 rounded-2xl border border-slate-800/60">
            <div className="flex items-center gap-2 mb-4">
              <SlidersHorizontal size={13} className="text-slate-400" />
              <h4 className="text-xs uppercase font-extrabold tracking-wider text-slate-400">
                Full Team Stats — click any column header to sort
              </h4>
            </div>
            <StatsTable teams={result.teams} />
          </div>
        </div>
      )}

      {/* ── Empty State ─────────────────────────────────────────────── */}
      {!result && !loading && !error && (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
          <div className="p-5 rounded-2xl bg-amber-500/8 border border-amber-500/15">
            <GitBranch size={36} className="text-amber-400/60" />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-slate-300 font-bold text-base">No clusters yet</p>
            <p className="text-slate-500 text-sm max-w-xs">
              Select a season and competition, then click{" "}
              <strong className="text-slate-400">Run Clustering</strong> to identify tactical archetypes.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-2">
            {Object.entries(ARCHETYPE_COLORS).map(([arch, color]) => {
              const Icon = ARCHETYPE_ICONS[arch] ?? GitBranch;
              return (
                <div key={arch}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border"
                  style={{ borderColor: `${color}25`, backgroundColor: `${color}08` }}>
                  <Icon size={13} style={{ color }} />
                  <span className="text-xs font-semibold" style={{ color }}>{arch}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
