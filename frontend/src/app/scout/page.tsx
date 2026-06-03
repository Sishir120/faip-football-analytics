"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Compass,
  Search,
  SlidersHorizontal,
  Users,
  Activity,
  TrendingUp,
  Shield,
  Crosshair,
  ChevronRight,
  Loader2,
  AlertCircle,
  BarChart3,
  Zap,
  RefreshCw,
} from "lucide-react";

/* ── Types ────────────────────────────────────────────────────── */
interface PlayerStats {
  goals_per90: number;
  shots_per90: number;
  xg_per90: number;
  passes_per90: number;
  pass_accuracy: number;
  key_passes_per90: number;
  assists_per90: number;
  carries_per90: number;
  pass_xt_per90: number;
  carry_xt_per90: number;
  tackles_per90: number;
  interceptions_per90: number;
  progressive_passes_per90: number;
  progressive_carries_per90: number;
  touches_per90: number;
}

interface PlayerProfile {
  player: string;
  team: string;
  position: string;
  position_group: string;
  minutes: number;
  stats: PlayerStats;
}

interface SimilarPlayer extends PlayerProfile {
  similarity_score: number;
}

interface SimilarityResult {
  target_player: PlayerProfile;
  similar_players: SimilarPlayer[];
  similarity_metrics: string[];
}

/* ── Helpers ──────────────────────────────────────────────────── */
const API = "http://localhost:8000";

function StatBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center">
        <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
          {label}
        </span>
        <span className="text-[11px] font-bold text-slate-200">
          {value.toFixed(2)}
        </span>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

function SimilarityRing({ score }: { score: number }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const color =
    score >= 90
      ? "#10b981"
      : score >= 75
      ? "#38bdf8"
      : score >= 60
      ? "#a78bfa"
      : "#f59e0b";

  return (
    <div className="relative flex items-center justify-center" style={{ width: 72, height: 72 }}>
      <svg width="72" height="72" className="-rotate-90" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} stroke="#1e293b" strokeWidth="5" fill="none" />
        <circle
          cx="36"
          cy="36"
          r={r}
          stroke={color}
          strokeWidth="5"
          fill="none"
          strokeDasharray={`${fill} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 1s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-base font-extrabold text-white leading-none">
          {score.toFixed(0)}
        </span>
        <span className="text-[8px] text-slate-400 font-bold">%</span>
      </div>
    </div>
  );
}

function PositionBadge({ group }: { group: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    GK: { bg: "bg-amber-500/15 text-amber-400 border-amber-500/30", text: "GK" },
    DF: { bg: "bg-sky-500/15 text-sky-400 border-sky-500/30", text: "DF" },
    MF: { bg: "bg-violet-500/15 text-violet-400 border-violet-500/30", text: "MF" },
    FW: { bg: "bg-rose-500/15 text-rose-400 border-rose-500/30", text: "FW" },
  };
  const style = map[group] ?? { bg: "bg-slate-500/15 text-slate-400 border-slate-500/30", text: group };
  return (
    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border ${style.bg}`}>
      {style.text}
    </span>
  );
}

/* ── Radar Chart (pure SVG, no external deps) ─────────────────── */
function RadarChart({
  target,
  similar,
}: {
  target: PlayerProfile;
  similar: SimilarPlayer;
}) {
  const metrics: Array<{ key: keyof PlayerStats; label: string }> = [
    { key: "xg_per90", label: "xG" },
    { key: "goals_per90", label: "Goals" },
    { key: "passes_per90", label: "Passes" },
    { key: "pass_accuracy", label: "Pass%" },
    { key: "key_passes_per90", label: "KP" },
    { key: "progressive_passes_per90", label: "Prog Pass" },
    { key: "progressive_carries_per90", label: "Prog Carry" },
    { key: "touches_per90", label: "Touches" },
    { key: "tackles_per90", label: "Tackles" },
    { key: "interceptions_per90", label: "Intercept" },
  ];

  const n = metrics.length;
  const cx = 140;
  const cy = 140;
  const r = 100;
  const labelR = 120;

  // Normalise each metric 0-1 vs max of both players
  function norm(val: number, max: number) {
    return max > 0 ? Math.min(1, val / max) : 0;
  }

  function polar(angle: number, radius: number) {
    const rad = (angle - Math.PI / 2);
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  }

  const angles = Array.from({ length: n }, (_, i) => (2 * Math.PI * i) / n);

  const maxVals = metrics.map((m) =>
    Math.max(target.stats[m.key], similar.stats[m.key], 0.001)
  );

  const pts1 = angles.map((a, i) => polar(a, norm(target.stats[metrics[i].key], maxVals[i]) * r));
  const pts2 = angles.map((a, i) => polar(a, norm(similar.stats[metrics[i].key], maxVals[i]) * r));

  const poly1 = pts1.map((p) => `${p.x},${p.y}`).join(" ");
  const poly2 = pts2.map((p) => `${p.x},${p.y}`).join(" ");

  // Grid rings
  const rings = [0.2, 0.4, 0.6, 0.8, 1].map((frac) =>
    angles.map((a) => polar(a, frac * r)).map((p) => `${p.x},${p.y}`).join(" ")
  );

  return (
    <svg viewBox="0 0 280 280" className="w-full max-w-[320px]">
      {/* Grid */}
      {rings.map((pts, i) => (
        <polygon key={i} points={pts} fill="none" stroke="#1e293b" strokeWidth="1" />
      ))}
      {/* Axis lines */}
      {angles.map((a, i) => {
        const end = polar(a, r);
        return (
          <line key={i} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="#334155" strokeWidth="1" />
        );
      })}
      {/* Player 1 shape */}
      <polygon points={poly1} fill="#38bdf820" stroke="#38bdf8" strokeWidth="2" strokeLinejoin="round" />
      {/* Player 2 shape */}
      <polygon points={poly2} fill="#f43f5e20" stroke="#f43f5e" strokeWidth="2" strokeLinejoin="round" />
      {/* Dots P1 */}
      {pts1.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill="#38bdf8" />
      ))}
      {/* Dots P2 */}
      {pts2.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill="#f43f5e" />
      ))}
      {/* Labels */}
      {angles.map((a, i) => {
        const lp = polar(a, labelR);
        return (
          <text
            key={i}
            x={lp.x}
            y={lp.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="8"
            fill="#94a3b8"
            fontFamily="Inter, sans-serif"
            fontWeight="600"
          >
            {metrics[i].label}
          </text>
        );
      })}
    </svg>
  );
}

/* ── Main Page ────────────────────────────────────────────────── */
export default function ScoutLabPage() {
  const [players, setPlayers] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<string>("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [minMinutes, setMinMinutes] = useState(180);
  const [strictPos, setStrictPos] = useState(true);
  const [limit, setLimit] = useState(5);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SimilarityResult | null>(null);
  const [activeCard, setActiveCard] = useState<number>(0);

  // Load player list
  useEffect(() => {
    fetch(`${API}/api/player/list`)
      .then((r) => r.json())
      .then(setPlayers)
      .catch(console.error);
  }, []);

  const filtered = players.filter((p) =>
    p.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 8);

  const handleSearch = useCallback(async () => {
    if (!selectedPlayer) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setActiveCard(0);
    try {
      const res = await fetch(
        `${API}/api/player/similarity?player=${encodeURIComponent(selectedPlayer)}&min_minutes=${minMinutes}&strict_position=${strictPos}&limit=${limit}`
      );
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedPlayer, minMinutes, strictPos, limit]);

  /* Stat labels with icon colours */
  const statSections = [
    {
      title: "Attacking",
      color: "#f43f5e",
      icon: Crosshair,
      keys: [
        { key: "goals_per90" as keyof PlayerStats, label: "Goals /90", max: 1.5 },
        { key: "shots_per90" as keyof PlayerStats, label: "Shots /90", max: 6 },
        { key: "xg_per90" as keyof PlayerStats, label: "xG /90", max: 1.5 },
      ],
    },
    {
      title: "Creativity",
      color: "#a78bfa",
      icon: Zap,
      keys: [
        { key: "key_passes_per90" as keyof PlayerStats, label: "Key Passes /90", max: 3 },
        { key: "assists_per90" as keyof PlayerStats, label: "Assists /90", max: 1 },
        { key: "pass_xt_per90" as keyof PlayerStats, label: "Pass xT /90", max: 0.2 },
      ],
    },
    {
      title: "Progression",
      color: "#38bdf8",
      icon: TrendingUp,
      keys: [
        { key: "progressive_passes_per90" as keyof PlayerStats, label: "Prog Passes /90", max: 8 },
        { key: "progressive_carries_per90" as keyof PlayerStats, label: "Prog Carries /90", max: 5 },
        { key: "carry_xt_per90" as keyof PlayerStats, label: "Carry xT /90", max: 0.15 },
      ],
    },
    {
      title: "Defensive",
      color: "#10b981",
      icon: Shield,
      keys: [
        { key: "tackles_per90" as keyof PlayerStats, label: "Tackles /90", max: 5 },
        { key: "interceptions_per90" as keyof PlayerStats, label: "Interceptions /90", max: 4 },
      ],
    },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto w-full flex-1 flex flex-col gap-8">
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 p-8 rounded-2xl glass-panel relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-sky-500/8 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-20 w-64 h-64 bg-violet-500/8 rounded-full blur-3xl pointer-events-none translate-y-1/2" />
        <span className="w-fit px-3 py-1 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/25 text-xs font-bold tracking-wider uppercase">
          Player Similarity Engine
        </span>
        <h2 className="text-3xl font-extrabold tracking-tight text-white outfit-font">
          Scout Lab &mdash;{" "}
          <span className="gradient-text">AI-Powered Player Matching</span>
        </h2>
        <p className="text-slate-400 text-sm max-w-2xl leading-relaxed">
          Cosine-similarity search over 15 per-90 statistical dimensions including xT, xG, progressiveness, and defensive contribution. Find the closest statistical twins to any player in the database.
        </p>
      </div>

      {/* ── Search Controls ─────────────────────────────────────── */}
      <div className="glass-panel p-6 rounded-2xl flex flex-col gap-5">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
          <SlidersHorizontal size={15} className="text-sky-400" />
          <h4 className="text-xs uppercase font-extrabold tracking-wider text-slate-200">
            Search Parameters
          </h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          {/* Player Autocomplete */}
          <div className="lg:col-span-2 flex flex-col gap-1.5 relative">
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
              Target Player
            </label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShowDropdown(true);
                  if (!e.target.value) setSelectedPlayer("");
                }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                placeholder="Search player name…"
                className="w-full bg-[#090b0e] border border-slate-800 text-slate-200 text-sm font-semibold rounded-xl pl-9 pr-4 py-2.5 focus:outline-none focus:border-sky-500/50 transition-colors"
              />
            </div>
            {showDropdown && filtered.length > 0 && (
              <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-[#0d1117] border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
                {filtered.map((p) => (
                  <button
                    key={p}
                    className="w-full text-left px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-sky-500/10 hover:text-sky-300 transition-colors flex items-center gap-2"
                    onMouseDown={() => {
                      setSelectedPlayer(p);
                      setQuery(p);
                      setShowDropdown(false);
                    }}
                  >
                    <Users size={11} className="text-slate-500" />
                    {p}
                  </button>
                ))}
              </div>
            )}
            {selectedPlayer && (
              <span className="text-[10px] text-emerald-400 font-semibold">
                ✓ {selectedPlayer} selected
              </span>
            )}
          </div>

          {/* Min Minutes */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
              Min Minutes Played
            </label>
            <input
              type="number"
              value={minMinutes}
              onChange={(e) => setMinMinutes(Number(e.target.value))}
              min={90}
              step={90}
              className="w-full bg-[#090b0e] border border-slate-800 text-slate-200 text-sm font-semibold rounded-xl px-4 py-2.5 focus:outline-none focus:border-sky-500/50 transition-colors"
            />
          </div>

          {/* Results limit */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
              Similar Players to Find
            </label>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="w-full bg-[#090b0e] border border-slate-800 text-slate-200 text-sm font-semibold rounded-xl px-4 py-2.5 focus:outline-none"
            >
              {[3, 5, 8, 10].map((n) => (
                <option key={n} value={n}>{n} players</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-4 border-t border-slate-800/60 pt-4">
          {/* Strict Position Toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
              onClick={() => setStrictPos((v) => !v)}
              className={`relative w-10 h-5 rounded-full transition-colors duration-300 ${
                strictPos ? "bg-sky-500" : "bg-slate-700"
              }`}
            >
              <div
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-300 ${
                  strictPos ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </div>
            <span className="text-xs font-semibold text-slate-400">
              Strict Position Matching
            </span>
          </label>

          <button
            onClick={handleSearch}
            disabled={!selectedPlayer || loading}
            className="ml-auto flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-sky-500 to-violet-500 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-sky-500/15 transition-all"
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Compass size={14} />
            )}
            {loading ? "Searching…" : "Find Similar Players"}
          </button>
        </div>
      </div>

      {/* ── Error ───────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <div className="text-sm font-semibold">{error}</div>
        </div>
      )}

      {/* ── Results ─────────────────────────────────────────────── */}
      {result && (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Target Player Banner */}
          <div className="glass-panel p-5 rounded-2xl flex items-center gap-5 border border-sky-500/15">
            <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20">
              <Crosshair size={24} className="text-sky-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase font-bold text-sky-400 tracking-widest mb-0.5">
                Target Player Profile
              </p>
              <h3 className="text-xl font-extrabold text-white truncate">
                {result.target_player.player}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <PositionBadge group={result.target_player.position_group} />
                <span className="text-xs text-slate-400 font-semibold">
                  {result.target_player.team}
                </span>
                <span className="text-xs text-slate-500">·</span>
                <span className="text-xs text-slate-500">
                  {result.target_player.minutes.toLocaleString()} min played
                </span>
              </div>
            </div>
            <div className="hidden md:flex gap-6 text-center">
              {[
                { label: "xG /90", val: result.target_player.stats.xg_per90.toFixed(2) },
                { label: "Goals /90", val: result.target_player.stats.goals_per90.toFixed(2) },
                { label: "Pass %", val: result.target_player.stats.pass_accuracy.toFixed(0) + "%" },
                { label: "xT /90", val: (result.target_player.stats.pass_xt_per90 + result.target_player.stats.carry_xt_per90).toFixed(3) },
              ].map((s) => (
                <div key={s.label} className="flex flex-col gap-0.5">
                  <span className="text-lg font-extrabold text-white">{s.val}</span>
                  <span className="text-[9px] uppercase text-slate-500 font-bold tracking-wider">
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Similar Players + Detail */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Similarity Cards */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 mb-1">
                <Users size={14} className="text-violet-400" />
                <h4 className="text-xs uppercase font-extrabold tracking-wider text-slate-300">
                  Closest Statistical Matches
                </h4>
              </div>
              {result.similar_players.map((sp, idx) => (
                <button
                  key={sp.player}
                  onClick={() => setActiveCard(idx)}
                  className={`w-full text-left glass-panel p-4 rounded-xl border transition-all duration-300 flex items-center gap-3 ${
                    activeCard === idx
                      ? "border-sky-500/35 bg-sky-500/5 shadow-[0_0_20px_rgba(14,165,233,0.08)]"
                      : "border-slate-800/60 hover:border-slate-700"
                  }`}
                >
                  <SimilarityRing score={sp.similarity_score} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{sp.player}</p>
                    <p className="text-[11px] text-slate-400 font-semibold truncate">{sp.team}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <PositionBadge group={sp.position_group} />
                      <span className="text-[10px] text-slate-500">
                        {sp.minutes.toLocaleString()} min
                      </span>
                    </div>
                  </div>
                  <ChevronRight
                    size={14}
                    className={`shrink-0 transition-colors ${
                      activeCard === idx ? "text-sky-400" : "text-slate-600"
                    }`}
                  />
                </button>
              ))}
            </div>

            {/* Detailed Panel */}
            {result.similar_players[activeCard] && (
              <div className="lg:col-span-2 flex flex-col gap-4">
                <div className="glass-panel p-5 rounded-2xl border border-slate-800/60 flex flex-col gap-5">
                  {/* Panel Header */}
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-violet-400 tracking-widest mb-0.5">
                        Comparison Profile
                      </p>
                      <h3 className="text-lg font-extrabold text-white">
                        {result.similar_players[activeCard].player}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <PositionBadge
                          group={result.similar_players[activeCard].position_group}
                        />
                        <span className="text-xs text-slate-400 font-semibold">
                          {result.similar_players[activeCard].team}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-center">
                      <SimilarityRing
                        score={result.similar_players[activeCard].similarity_score}
                      />
                      <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mt-1">
                        Similarity
                      </span>
                    </div>
                  </div>

                  {/* Radar + Stat Bars */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2 border-t border-slate-800/60">
                    {/* Radar */}
                    <div className="flex flex-col items-center gap-2">
                      <RadarChart
                        target={result.target_player}
                        similar={result.similar_players[activeCard]}
                      />
                      {/* Legend */}
                      <div className="flex items-center gap-4 text-[10px] font-semibold">
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-0.5 bg-[#38bdf8] rounded-full" />
                          <span className="text-slate-400 truncate max-w-[100px]">
                            {result.target_player.player.split(" ").slice(-1)[0]}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-0.5 bg-[#f43f5e] rounded-full" />
                          <span className="text-slate-400 truncate max-w-[100px]">
                            {result.similar_players[activeCard].player.split(" ").slice(-1)[0]}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Stat Bars */}
                    <div className="flex flex-col gap-4">
                      {statSections.map((section) => {
                        const Icon = section.icon;
                        return (
                          <div key={section.title} className="flex flex-col gap-2">
                            <div className="flex items-center gap-1.5">
                              <Icon size={11} style={{ color: section.color }} />
                              <span
                                className="text-[9px] uppercase font-extrabold tracking-widest"
                                style={{ color: section.color }}
                              >
                                {section.title}
                              </span>
                            </div>
                            {section.keys.map((sk) => (
                              <StatBar
                                key={sk.key}
                                label={sk.label}
                                value={result.similar_players[activeCard].stats[sk.key]}
                                max={sk.max}
                                color={section.color}
                              />
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Side-by-side table */}
                <div className="glass-panel p-4 rounded-2xl border border-slate-800/60">
                  <div className="flex items-center gap-2 mb-3">
                    <BarChart3 size={13} className="text-slate-400" />
                    <span className="text-[10px] uppercase font-extrabold tracking-wider text-slate-400">
                      Full Stat Comparison
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[9px] uppercase text-slate-500 font-bold tracking-wider border-b border-slate-800">
                          <th className="text-left py-2 pr-4">Metric</th>
                          <th className="text-right py-2 px-2 text-sky-400">
                            {result.target_player.player.split(" ").pop()}
                          </th>
                          <th className="text-right py-2 pl-2 text-rose-400">
                            {result.similar_players[activeCard].player.split(" ").pop()}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { label: "Goals /90", key: "goals_per90" as keyof PlayerStats },
                          { label: "xG /90", key: "xg_per90" as keyof PlayerStats },
                          { label: "Shots /90", key: "shots_per90" as keyof PlayerStats },
                          { label: "Passes /90", key: "passes_per90" as keyof PlayerStats },
                          { label: "Pass Acc %", key: "pass_accuracy" as keyof PlayerStats },
                          { label: "Key Passes /90", key: "key_passes_per90" as keyof PlayerStats },
                          { label: "Assists /90", key: "assists_per90" as keyof PlayerStats },
                          { label: "Prog Passes /90", key: "progressive_passes_per90" as keyof PlayerStats },
                          { label: "Prog Carries /90", key: "progressive_carries_per90" as keyof PlayerStats },
                          { label: "Pass xT /90", key: "pass_xt_per90" as keyof PlayerStats },
                          { label: "Carry xT /90", key: "carry_xt_per90" as keyof PlayerStats },
                          { label: "Tackles /90", key: "tackles_per90" as keyof PlayerStats },
                          { label: "Intercept. /90", key: "interceptions_per90" as keyof PlayerStats },
                          { label: "Touches /90", key: "touches_per90" as keyof PlayerStats },
                        ].map((row, ri) => {
                          const v1 = result.target_player.stats[row.key];
                          const v2 = result.similar_players[activeCard].stats[row.key];
                          const higher = v1 >= v2 ? "target" : "similar";
                          return (
                            <tr
                              key={row.key}
                              className={`border-b border-slate-800/40 transition-colors ${
                                ri % 2 === 0 ? "bg-slate-900/20" : ""
                              }`}
                            >
                              <td className="py-1.5 pr-4 text-slate-400 font-semibold">
                                {row.label}
                              </td>
                              <td
                                className={`text-right py-1.5 px-2 font-bold ${
                                  higher === "target" ? "text-sky-400" : "text-slate-400"
                                }`}
                              >
                                {v1.toFixed(3)}
                              </td>
                              <td
                                className={`text-right py-1.5 pl-2 font-bold ${
                                  higher === "similar" ? "text-rose-400" : "text-slate-400"
                                }`}
                              >
                                {v2.toFixed(3)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Empty State ─────────────────────────────────────────── */}
      {!result && !loading && !error && (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
          <div className="p-5 rounded-2xl bg-sky-500/8 border border-sky-500/15">
            <Compass size={36} className="text-sky-400/60" />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-slate-300 font-bold text-base">No search yet</p>
            <p className="text-slate-500 text-sm max-w-xs">
              Select a player above and click{" "}
              <strong className="text-slate-400">Find Similar Players</strong> to run the similarity engine.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2 mt-2">
            {["Lionel Andr", "Antoine", "Sergio Bus"].map((hint) => {
              const match = players.find((p) => p.includes(hint));
              return match ? (
                <button
                  key={hint}
                  onClick={() => {
                    setSelectedPlayer(match);
                    setQuery(match);
                  }}
                  className="text-xs font-semibold text-sky-400 bg-sky-500/10 border border-sky-500/20 px-3 py-1.5 rounded-full hover:bg-sky-500/15 transition-colors flex items-center gap-1"
                >
                  <RefreshCw size={10} />
                  {match.split(" ").slice(0, 2).join(" ")}
                </button>
              ) : null;
            })}
          </div>
        </div>
      )}
    </div>
  );
}
