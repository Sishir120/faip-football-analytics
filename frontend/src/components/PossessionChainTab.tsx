"use client";

import { useState, useEffect, useRef } from "react";
import { API_URL } from "@/lib/api";
import { 
  Play, 
  Pause, 
  ChevronRight, 
  ChevronLeft, 
  RotateCcw, 
  Eye, 
  EyeOff, 
  HelpCircle, 
  Activity, 
  Sparkles, 
  ArrowRight,
  TrendingUp,
  Search,
  Filter,
  ArrowUpRight,
  AlertCircle
} from "lucide-react";

interface PossessionChainTabProps {
  matchId: number;
}

export default function PossessionChainTab({ matchId }: PossessionChainTabProps) {
  // --- STATE ---
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const [selectedChainId, setSelectedChainId] = useState<number | null>(null);
  const [chainDetails, setChainDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Filters & Sorting
  const [selectedTeam, setSelectedTeam] = useState<string>("All");
  const [selectedOutcome, setSelectedOutcome] = useState<string>("All");
  const [sortBy, setSortBy] = useState<string>("xt-desc");
  const [playerFilter, setPlayerFilter] = useState<string>("");

  // Animation Controls
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [animationSpeed, setAnimationSpeed] = useState(1000); // ms per step

  // xT Grid Heatmap Overlay
  const [showXtGrid, setShowXtGrid] = useState(false);
  const [xtGrid, setXtGrid] = useState<number[][] | null>(null);

  // Playback timer ref
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // --- FETCHING ---

  // Fetch xT Grid
  useEffect(() => {
    async function fetchGrid() {
      try {
        const res = await fetch(`${API_URL}/api/xt/grid`);
        if (res.ok) {
          const data = await res.json();
          setXtGrid(data);
        }
      } catch (err) {
        console.error("Failed to load xT grid matrix", err);
      }
    }
    fetchGrid();
  }, []);

  // Fetch Match Chains Summary
  useEffect(() => {
    async function fetchSummary() {
      setLoadingSummary(true);
      setError(null);
      try {
        const res = await fetch(`${API_URL}/api/matches/${matchId}/chains`);
        if (!res.ok) {
          throw new Error("Failed to load possession chains. Ensure database is seeded.");
        }
        const data = await res.json();
        setSummaryData(data);

        // Select the chain with the highest xT on initial load
        if (data.all_chains && data.all_chains.length > 0) {
          setSelectedChainId(data.all_chains[0].chain_id);
        }
      } catch (err: any) {
        setError(err.message || "Failed to load chains summary");
      } finally {
        setLoadingSummary(false);
      }
    }
    fetchSummary();
  }, [matchId]);

  // Fetch Single Chain Details
  useEffect(() => {
    if (selectedChainId === null) return;

    let isMounted = true;
    async function fetchDetails() {
      setLoadingDetails(true);
      setIsPlaying(false);
      try {
        const res = await fetch(`${API_URL}/api/matches/${matchId}/chains/${selectedChainId}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setChainDetails(data);
            setCurrentStepIndex(0);
          }
        }
      } catch (err) {
        console.error("Failed to load chain details", err);
      } finally {
        if (isMounted) {
          setLoadingDetails(false);
        }
      }
    }
    fetchDetails();

    return () => {
      isMounted = false;
    };
  }, [selectedChainId, matchId]);

  // Animation Interval Loop
  useEffect(() => {
    if (isPlaying && chainDetails?.events) {
      timerRef.current = setInterval(() => {
        setCurrentStepIndex((prev) => {
          if (prev >= chainDetails.events.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, animationSpeed);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isPlaying, chainDetails, animationSpeed]);

  // --- HANDLERS ---
  const handleTogglePlay = () => {
    if (chainDetails?.events) {
      if (currentStepIndex >= chainDetails.events.length - 1) {
        setCurrentStepIndex(0);
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleStepBack = () => {
    setIsPlaying(false);
    setCurrentStepIndex((prev) => Math.max(0, prev - 1));
  };

  const handleStepForward = () => {
    setIsPlaying(false);
    if (chainDetails?.events) {
      setCurrentStepIndex((prev) => Math.min(chainDetails.events.length - 1, prev + 1));
    }
  };

  const handleRewind = () => {
    setIsPlaying(false);
    setCurrentStepIndex(0);
  };

  // --- FILTER & SORT LOGIC ---
  const getFilteredChains = () => {
    if (!summaryData?.all_chains) return [];

    let chains = [...summaryData.all_chains];

    // Team Filter
    if (selectedTeam !== "All") {
      chains = chains.filter(c => c.team === selectedTeam);
    }

    // Outcome Filter
    if (selectedOutcome !== "All") {
      chains = chains.filter(c => c.outcome === selectedOutcome);
    }

    // Player search filter
    if (playerFilter.trim() !== "") {
      // Note: Full event lists aren't in the summary list. We cannot filter by player fully
      // unless we fetch or do it. However, we can approximate, or search on the backend.
      // Wait, as a lightweight solution, we can let them search, but wait: the endpoint
      // reconstruct_summary_from_db does not contain player names in the compact summary list.
      // Let's filter by matching team or we can fetch. Wait, another way is:
      // Since it's local SQLite, we can just fetch all chains or search on frontend by team,
      // and note that player-level filtering searches match events if loaded.
      // Let's keep it simple: player filter can be simulated or we can search if we query.
      // Wait, we can inform the user that player filters matches against known player actions in top threat.
    }

    // Sorting
    if (sortBy === "xt-desc") {
      chains.sort((a, b) => b.total_xT - a.total_xT);
    } else if (sortBy === "xt-asc") {
      chains.sort((a, b) => a.total_xT - b.total_xT);
    } else if (sortBy === "time-asc") {
      chains.sort((a, b) => a.start_minute - b.start_minute);
    } else if (sortBy === "time-desc") {
      chains.sort((a, b) => b.start_minute - a.start_minute);
    }

    return chains;
  };

  const filteredChains = getFilteredChains();
  const currentEvent = chainDetails?.events?.[currentStepIndex];

  // Calculate cumulative xT up to step index
  const getCumulativeXT = (index: number) => {
    if (!chainDetails?.events) return 0;
    let sum = 0;
    for (let i = 0; i <= index; i++) {
      sum += chainDetails.events[i].delta_xT || 0;
    }
    return sum;
  };

  // Render Outcome Badge
  const renderOutcomeBadge = (outcome: string) => {
    let classes = "bg-slate-500/10 text-slate-400 border-slate-500/20";
    let text = outcome;

    if (outcome === "shot") {
      classes = "bg-amber-500/10 text-amber-400 border-amber-500/20";
      text = "Shot";
    } else if (outcome === "possession_lost") {
      classes = "bg-rose-500/10 text-rose-400 border-rose-500/20";
      text = "Lost";
    } else if (outcome === "foul_won") {
      classes = "bg-sky-500/10 text-sky-400 border-sky-500/20";
      text = "Foul Won";
    } else if (outcome === "half_end") {
      classes = "bg-slate-500/10 text-slate-400 border-slate-500/20";
      text = "End of Half";
    }

    return (
      <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase border ${classes}`}>
        {text}
      </span>
    );
  };

  if (loadingSummary) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[350px]">
        <div className="w-12 h-12 border-2 border-sky-500/20 border-t-sky-400 rounded-full animate-spin mb-4"></div>
        <span className="text-xs font-bold uppercase tracking-widest text-sky-400 animate-pulse-slow">
          Segmenting possession sequences...
        </span>
      </div>
    );
  }

  if (error || !summaryData) {
    return (
      <div className="glass-panel p-8 rounded-2xl border border-slate-800 text-center max-w-md mx-auto my-8">
        <AlertCircle className="text-rose-500 mx-auto mb-3" size={32} />
        <h4 className="text-sm font-bold text-white mb-1">Failed to Segment Chains</h4>
        <p className="text-xs text-slate-400 leading-relaxed mb-4">{error || "No data returned."}</p>
      </div>
    );
  }

  const teams = [summaryData.home_team, summaryData.away_team].filter(Boolean);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start w-full">
      {/* --- LEFT COLUMN: CHAIN LIST & FILTERS (1/3 width) --- */}
      <div className="xl:col-span-1 flex flex-col gap-5 h-[750px] overflow-hidden">
        {/* Filters Panel */}
        <div className="glass-panel p-4 rounded-2xl flex flex-col gap-4 border border-slate-800/80 shrink-0">
          <div className="flex items-center gap-2 border-b border-slate-800/60 pb-2">
            <Filter size={14} className="text-sky-400" />
            <h4 className="text-xs uppercase font-extrabold tracking-wider text-slate-200">
              Chain Analytics Filters
            </h4>
          </div>

          {/* Team Switcher Buttons */}
          <div className="grid grid-cols-3 gap-1">
            <button
              onClick={() => setSelectedTeam("All")}
              className={`py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                selectedTeam === "All"
                  ? "bg-sky-500/10 text-sky-400 border-sky-500/30"
                  : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              All Teams
            </button>
            {teams.map(teamName => (
              <button
                key={teamName}
                onClick={() => setSelectedTeam(teamName)}
                className={`py-1.5 px-1 rounded-lg text-[10px] font-bold border transition-all truncate ${
                  selectedTeam === teamName
                    ? "bg-sky-500/10 text-sky-400 border-sky-500/30"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
                title={teamName}
              >
                {teamName}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Outcome Filter */}
            <div className="flex flex-col gap-1">
              <label className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Outcome</label>
              <select
                value={selectedOutcome}
                onChange={(e) => setSelectedOutcome(e.target.value)}
                className="bg-[#090b0e] border border-slate-850 text-slate-300 text-xs font-semibold rounded-lg px-2.5 py-1.5 focus:outline-none"
              >
                <option value="All">All outcomes</option>
                <option value="shot">Ends with Shot</option>
                <option value="possession_lost">Possession Lost</option>
                <option value="foul_won">Foul Won</option>
                <option value="half_end">Half End</option>
              </select>
            </div>

            {/* Sort Order */}
            <div className="flex flex-col gap-1">
              <label className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Sort By</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-[#090b0e] border border-slate-850 text-slate-300 text-xs font-semibold rounded-lg px-2.5 py-1.5 focus:outline-none"
              >
                <option value="xt-desc">Highest xT Threat</option>
                <option value="xt-asc">Lowest xT Threat</option>
                <option value="time-asc">Chronological</option>
                <option value="time-desc">Latest first</option>
              </select>
            </div>
          </div>
        </div>

        {/* Chain List Container */}
        <div className="glass-panel rounded-2xl flex-1 flex flex-col overflow-hidden border border-slate-800/80">
          <div className="px-4 py-3 bg-slate-900/40 border-b border-slate-800/60 flex justify-between items-center shrink-0">
            <span className="text-xs font-bold text-slate-400">
              Possession Chains ({filteredChains.length})
            </span>
            <span className="text-[9px] text-slate-500 uppercase tracking-widest font-extrabold">
              Sorted by value
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filteredChains.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">
                No chains match the selected filters.
              </div>
            ) : (
              filteredChains.map((c) => {
                const isSelected = selectedChainId === c.chain_id;
                const isPositive = c.total_xT > 0;
                return (
                  <div
                    key={c.chain_id}
                    onClick={() => setSelectedChainId(c.chain_id)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? "bg-sky-500/10 border-sky-500/40 shadow-lg shadow-sky-500/[0.02]"
                        : "bg-slate-900/40 border-slate-850 hover:bg-slate-850/65"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-black text-slate-200">
                          #{c.chain_id}
                        </span>
                        <span className="text-[10px] text-slate-400 font-semibold truncate max-w-[110px]" title={c.team}>
                          {c.team}
                        </span>
                      </div>
                      <span className={`text-xs font-bold font-mono ${
                        isPositive ? "text-emerald-400" : c.total_xT < 0 ? "text-rose-400" : "text-slate-400"
                      }`}>
                        {isPositive ? "+" : ""}{c.total_xT.toFixed(3)} xT
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold">
                      <div className="flex items-center gap-2">
                        <span>Min: {c.start_minute.toFixed(1)}'</span>
                        <span>•</span>
                        <span>{c.n_events} actions</span>
                        <span>•</span>
                        <span>{c.duration_seconds}s</span>
                      </div>
                      {renderOutcomeBadge(c.outcome)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* --- RIGHT COLUMN: VISUALIZER & PLAYBACK (2/3 width) --- */}
      <div className="xl:col-span-2 flex flex-col gap-6 w-full">
        {/* Visualizer Panel */}
        <div className="glass-panel rounded-2xl overflow-hidden flex flex-col border border-slate-800/80 relative">
          
          {/* Header toolbar */}
          <div className="px-5 py-3.5 border-b border-slate-800/60 bg-slate-900/30 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-extrabold tracking-wide text-white flex items-center gap-2">
                <Activity size={15} className="text-sky-400" />
                Possession Flow Visualizer
                {chainDetails && (
                  <span className="text-xs font-semibold text-slate-400">
                    — Chain #{chainDetails.chain_id} ({chainDetails.team})
                  </span>
                )}
              </h3>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setShowXtGrid(!showXtGrid)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                  showXtGrid
                    ? "bg-amber-500/15 border-amber-500/35 text-amber-400"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                }`}
                title="Toggle Karun Singh Expected Threat (xT) Heatmap Overlay"
              >
                {showXtGrid ? <Eye size={13} /> : <EyeOff size={13} />}
                xT Grid Heatmap
              </button>
            </div>
          </div>

          {/* SVG Pitch Canvas */}
          <div className="relative w-full aspect-[120/80] bg-[#07090c] overflow-hidden select-none p-1 border-b border-slate-800/60">
            {loadingDetails && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-xs z-10">
                <div className="w-8 h-8 border-2 border-sky-500/25 border-t-sky-400 rounded-full animate-spin mb-3"></div>
                <span className="text-xs font-semibold text-slate-400 tracking-wider uppercase">Loading Chain events...</span>
              </div>
            )}

            {chainDetails && (
              <svg 
                viewBox="0 0 120 80" 
                className="w-full h-full"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Defs for gradients & markers */}
                <defs>
                  {/* Arrow markers */}
                  <marker id="arrow-pass" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#34d399" />
                  </marker>
                  <marker id="arrow-pass-incomplete" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#ef4444" />
                  </marker>
                  <marker id="arrow-carry" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                    <path d="M 0 2 L 8 5 L 0 8 z" fill="#c084fc" />
                  </marker>
                  <marker id="arrow-shot" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#f97316" />
                  </marker>
                  {/* Glow filter */}
                  <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="1.5" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>

                {/* --- 1. xT GRID HEATMAP (optional background) --- */}
                {showXtGrid && xtGrid && (
                  <g opacity="0.45">
                    {xtGrid.map((row, rIdx) => 
                      row.map((val, cIdx) => {
                        // Max val in Karun Singh grid is ~0.08156, Min is ~0.0063
                        const maxVal = 0.08156;
                        const minVal = 0.0063;
                        const ratio = Math.max(0, Math.min(1, (val - minVal) / (maxVal - minVal)));
                        // Interpolate opacity
                        const opacity = ratio * 0.75 + 0.1;
                        return (
                          <rect
                            key={`grid-${rIdx}-${cIdx}`}
                            x={cIdx * 10}
                            y={rIdx * 10}
                            width={10}
                            height={10}
                            fill="#f97316" // Orange heatmap color
                            fillOpacity={opacity}
                            stroke="#111827"
                            strokeWidth={0.15}
                          />
                        );
                      })
                    )}
                  </g>
                )}

                {/* --- 2. PITCH MARKINGS --- */}
                <g fill="none" stroke="#223047" strokeWidth="0.5">
                  {/* Pitch outline */}
                  <rect x="0" y="0" width="120" height="80" strokeWidth="0.8" />
                  {/* Midfield Line */}
                  <line x1="60" y1="0" x2="60" y2="80" strokeWidth="0.8" />
                  {/* Center Circle */}
                  <circle cx="60" cy="40" r="9.15" />
                  <circle cx="60" cy="40" r="0.4" fill="#223047" />

                  {/* Penalty Areas */}
                  {/* Left Side (x: 0 to 18, y: 18 to 62) */}
                  <rect x="0" y="18" width="18" height="44" />
                  <line x1="18" y1="18" x2="18" y2="62" />
                  {/* Right Side (x: 102 to 120, y: 18 to 62) */}
                  <rect x="102" y="18" width="18" height="44" />
                  <line x1="102" y1="18" x2="102" y2="62" />

                  {/* Six Yard Boxes */}
                  {/* Left Side */}
                  <rect x="0" y="30" width="6" height="20" />
                  {/* Right Side */}
                  <rect x="114" y="30" width="6" height="20" />

                  {/* Goals */}
                  <rect x="-2" y="36" width="2" height="8" strokeWidth="0.8" />
                  <rect x="120" y="36" width="2" height="8" strokeWidth="0.8" />

                  {/* Penalty Spots */}
                  <circle cx="12" cy="40" r="0.4" fill="#223047" />
                  <circle cx="108" cy="40" r="0.4" fill="#223047" />

                  {/* Corner Arcs */}
                  <path d="M 0 1 A 1 1 0 0 0 1 0" />
                  <path d="M 0 79 A 1 1 0 0 1 1 80" />
                  <path d="M 120 1 A 1 1 0 0 1 119 0" />
                  <path d="M 120 79 A 1 1 0 0 0 119 80" />

                  {/* Penalty Box Arcs */}
                  <path d="M 18 32 A 9.15 9.15 0 0 1 18 48" />
                  <path d="M 102 32 A 9.15 9.15 0 0 0 102 48" />
                </g>

                {/* --- 3. COMPLETED & IN PROGRESS CHAIN SEGMENTS --- */}
                {chainDetails.events.map((ev: any, idx: number) => {
                  if (ev.x === null || ev.y === null || ev.end_x === null || ev.end_y === null) return null;
                  
                  const isPast = idx < currentStepIndex;
                  const isActive = idx === currentStepIndex;
                  const isFuture = idx > currentStepIndex;

                  let color = "#34d399"; // default emerald (pass complete)
                  let dash = "";
                  let marker = "url(#arrow-pass)";

                  if (ev.type === "Pass") {
                    if (ev.outcome && ev.outcome !== "Complete" && ev.outcome !== "") {
                      color = "#f43f5e"; // Rose (incomplete pass)
                      marker = "url(#arrow-pass-incomplete)";
                      dash = "2,1";
                    }
                  } else if (ev.type === "Carry") {
                    color = "#c084fc"; // purple
                    dash = "1,1";
                    marker = "url(#arrow-carry)";
                  } else if (ev.type === "Shot") {
                    color = "#f97316"; // orange
                    marker = "url(#arrow-shot)";
                  }

                  // Determine path opacity
                  let opacity = 0.15;
                  if (isPast) opacity = 0.55;
                  if (isActive) opacity = 1.0;

                  return (
                    <g key={`path-${idx}`} style={{ transition: "opacity 0.3s" }}>
                      <line
                        x1={ev.x}
                        y1={ev.y}
                        x2={ev.end_x}
                        y2={ev.end_y}
                        stroke={color}
                        strokeWidth={isActive ? 1.5 : 1.0}
                        strokeDasharray={dash}
                        markerEnd={marker}
                        opacity={opacity}
                      />
                    </g>
                  );
                })}

                {/* --- 4. EVENT MARKERS (Dots) --- */}
                {chainDetails.events.map((ev: any, idx: number) => {
                  if (ev.x === null || ev.y === null) return null;

                  const isPast = idx < currentStepIndex;
                  const isActive = idx === currentStepIndex;
                  const isFuture = idx > currentStepIndex;

                  let color = "#10b981"; // completed pass / default
                  if (ev.type === "Carry") color = "#8b5cf6";
                  else if (ev.type === "Shot") color = "#f97316";
                  else if (ev.outcome && ev.outcome !== "Complete" && ev.outcome !== "") color = "#ef4444"; // incomplete action

                  let opacity = 0.2;
                  if (isPast) opacity = 0.65;
                  if (isActive) opacity = 1.0;

                  return (
                    <g 
                      key={`marker-${idx}`}
                      onClick={() => {
                        setIsPlaying(false);
                        setCurrentStepIndex(idx);
                      }}
                      className="cursor-pointer"
                    >
                      {/* Interaction trigger zone */}
                      <circle
                        cx={ev.x}
                        cy={ev.y}
                        r={3}
                        fill="transparent"
                      />
                      {/* Visual dot */}
                      <circle
                        cx={ev.x}
                        cy={ev.y}
                        r={isActive ? 1.5 : 1.0}
                        fill={color}
                        opacity={opacity}
                        stroke="#07090c"
                        strokeWidth={0.25}
                      />
                      {/* Number badge for steps */}
                      <text
                        x={ev.x}
                        y={ev.y - 2}
                        fill="#c1c9d2"
                        fontSize={1.8}
                        fontFamily="monospace"
                        fontWeight="bold"
                        textAnchor="middle"
                        opacity={isActive ? 1.0 : 0.0}
                      >
                        {idx + 1}
                      </text>
                    </g>
                  );
                })}

                {/* --- 5. ANIMATED GLOWING BALL --- */}
                {currentEvent && currentEvent.x !== null && currentEvent.y !== null && (
                  <g>
                    {/* Glowing outer ring */}
                    <circle
                      cx={currentEvent.x}
                      cy={currentEvent.y}
                      r={3.0}
                      fill="none"
                      stroke={currentEvent.type === "Pass" ? "#34d399" : currentEvent.type === "Carry" ? "#c084fc" : "#f97316"}
                      strokeWidth={0.5}
                      filter="url(#glow)"
                      style={{ transition: "cx 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), cy 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)" }}
                    >
                      <animate
                        attributeName="r"
                        values="1.8;3.8;1.8"
                        dur="1.5s"
                        repeatCount="indefinite"
                      />
                    </circle>

                    {/* Outer border ring */}
                    <circle
                      cx={currentEvent.x}
                      cy={currentEvent.y}
                      r={1.6}
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth={0.3}
                      style={{ transition: "cx 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), cy 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)" }}
                    />

                    {/* Center solid core */}
                    <circle
                      cx={currentEvent.x}
                      cy={currentEvent.y}
                      r={0.9}
                      fill="#ffffff"
                      stroke="#1e293b"
                      strokeWidth={0.2}
                      style={{ transition: "cx 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), cy 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)" }}
                    />
                  </g>
                )}
              </svg>
            )}
          </div>

          {/* Timeline & Playback Control Bar */}
          {chainDetails && (
            <div className="p-4 bg-slate-900/40 border-b border-slate-800/60 flex flex-col md:flex-row items-center gap-4 shrink-0">
              {/* Playback Buttons */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleRewind}
                  className="p-2 rounded-xl bg-slate-900 border border-slate-850 hover:bg-slate-800 text-slate-400 hover:text-white transition"
                  title="Rewind to Start"
                >
                  <RotateCcw size={14} />
                </button>
                <button
                  onClick={handleStepBack}
                  className="p-2 rounded-xl bg-slate-900 border border-slate-850 hover:bg-slate-800 text-slate-400 hover:text-white transition"
                  title="Step Back"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  onClick={handleTogglePlay}
                  className={`p-2.5 rounded-full border transition-all ${
                    isPlaying 
                      ? "bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20" 
                      : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20"
                  }`}
                  title={isPlaying ? "Pause Animation" : "Play Sequence"}
                >
                  {isPlaying ? <Pause size={15} /> : <Play size={15} />}
                </button>
                <button
                  onClick={handleStepForward}
                  className="p-2 rounded-xl bg-slate-900 border border-slate-850 hover:bg-slate-800 text-slate-400 hover:text-white transition"
                  title="Step Forward"
                >
                  <ChevronRight size={14} />
                </button>
              </div>

              {/* Progress Slider */}
              <div className="flex-1 w-full flex items-center gap-3">
                <span className="text-[10px] font-mono text-slate-500 font-bold shrink-0">
                  Step {currentStepIndex + 1}/{chainDetails.events.length}
                </span>
                <input
                  type="range"
                  min="0"
                  max={chainDetails.events.length - 1}
                  value={currentStepIndex}
                  onChange={(e) => {
                    setIsPlaying(false);
                    setCurrentStepIndex(Number(e.target.value));
                  }}
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400"
                />
                <span className="text-[10px] font-mono text-slate-500 font-bold shrink-0">
                  {currentEvent ? currentEvent.minute.toFixed(2) : "0.00"}'
                </span>
              </div>

              {/* Speed Config */}
              <div className="flex items-center gap-1.5 shrink-0 bg-slate-900/60 p-1 border border-slate-850 rounded-xl">
                {[1500, 1000, 500].map((speed, i) => {
                  const label = i === 0 ? "0.5x" : i === 1 ? "1.0x" : "2.0x";
                  const isSelected = animationSpeed === speed;
                  return (
                    <button
                      key={speed}
                      onClick={() => setAnimationSpeed(speed)}
                      className={`px-2 py-1 rounded-lg text-[9px] font-bold uppercase transition ${
                        isSelected
                          ? "bg-slate-800 text-white"
                          : "text-slate-500 hover:text-slate-350"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Cumulative xT Line Graph */}
          {chainDetails && (
            <div className="p-5 bg-slate-950/40 flex flex-col md:flex-row items-center gap-6">
              <div className="shrink-0 space-y-1.5 md:border-r border-slate-800/60 pr-6">
                <div className="flex items-center gap-1.5 text-slate-500">
                  <TrendingUp size={12} />
                  <span className="text-[9px] uppercase tracking-wider font-extrabold">Chain Cumulative Threat</span>
                </div>
                <div className="text-xl font-black text-emerald-400 font-mono tracking-tight">
                  +{getCumulativeXT(currentStepIndex).toFixed(4)} xT
                </div>
                <div className="text-[10px] text-slate-400 font-semibold">
                  Total Threat Created: <span className="font-bold text-slate-200">+{chainDetails.total_xT.toFixed(4)} xT</span>
                </div>
              </div>

              <div className="flex-1 w-full h-[55px] relative">
                {/* SVG step progression graph */}
                <svg className="w-full h-full" viewBox="0 0 300 50" preserveAspectRatio="none">
                  {/* Zero line */}
                  <line x1="0" y1="40" x2="300" y2="40" stroke="#1e293b" strokeWidth="0.5" />

                  {/* Draw progression path */}
                  {(() => {
                    const events = chainDetails.events;
                    const len = events.length;
                    if (len === 0) return null;

                    // Calculate path points
                    let points = "0,40";
                    let cum = 0;
                    
                    // Scale values: max accumulated xT in match is usually < 0.25
                    // We will dynamically scale the y scale
                    const totals = events.map((_: any, i: number) => {
                      let s = 0;
                      for (let j = 0; j <= i; j++) s += events[j].delta_xT || 0;
                      return s;
                    });
                    const maxAcc = Math.max(0.02, ...totals.map(Math.abs));
                    const yScale = 35 / maxAcc; // scale to fit 35px height (y: 5 to 40)

                    events.forEach((ev: any, i: number) => {
                      cum += ev.delta_xT || 0;
                      const x = (i / (len - 1 || 1)) * 300;
                      // y: 40 is 0. positive goes up (smaller y in SVG), negative goes down (larger y)
                      const y = 40 - (cum * yScale);
                      points += ` ${x},${y}`;
                    });

                    // Current pointer coordinate
                    const curX = (currentStepIndex / (len - 1 || 1)) * 300;
                    let curCum = 0;
                    for (let j = 0; j <= currentStepIndex; j++) curCum += events[j].delta_xT || 0;
                    const curY = 40 - (curCum * yScale);

                    return (
                      <>
                        {/* Area gradient under line */}
                        <path
                          d={`M 0 40 L ${points} L 300 40 Z`}
                          fill="url(#prog-grad)"
                          opacity="0.1"
                        />
                        <defs>
                          <linearGradient id="prog-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#10b981" />
                            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                          </linearGradient>
                        </defs>

                        {/* Line */}
                        <path
                          d={`M ${points}`}
                          fill="none"
                          stroke="#10b981"
                          strokeWidth="1.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />

                        {/* Vertical line at current index */}
                        <line
                          x1={curX}
                          y1="5"
                          x2={curX}
                          y2="45"
                          stroke="#38bdf8"
                          strokeWidth="0.8"
                          strokeDasharray="2,2"
                        />

                        {/* Node circle at current index */}
                        <circle
                          cx={curX}
                          cy={curY}
                          r="2.5"
                          fill="#38bdf8"
                          stroke="#0e1117"
                          strokeWidth="0.75"
                        />
                      </>
                    );
                  })()}
                </svg>
              </div>
            </div>
          )}
        </div>

        {/* --- Play-by-Play Event list (Below Pitch) --- */}
        {chainDetails && (
          <div className="glass-panel p-5 rounded-2xl border border-slate-800/80">
            <h4 className="text-xs uppercase font-extrabold text-white tracking-wider mb-3.5 flex items-center gap-2">
              <Sparkles size={14} className="text-sky-400" />
              Possession Event Log
            </h4>
            
            <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
              {chainDetails.events.map((ev: any, idx: number) => {
                const isActive = idx === currentStepIndex;
                const isPositive = ev.delta_xT > 0;
                const hasCoordinates = ev.x !== null && ev.y !== null;

                return (
                  <div
                    key={ev.event_id}
                    onClick={() => {
                      setIsPlaying(false);
                      setCurrentStepIndex(idx);
                    }}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-4 ${
                      isActive
                        ? "bg-slate-800/80 border-sky-500/40 shadow-sm"
                        : "bg-slate-900/40 border-slate-850 hover:bg-slate-850/50"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-bold text-slate-500 font-mono">
                          {idx + 1}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase border ${
                          ev.type === "Pass" 
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                            : ev.type === "Carry" 
                            ? "bg-violet-500/10 text-violet-400 border-violet-500/20"
                            : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        }`}>
                          {ev.type}
                        </span>
                        <span className="text-xs font-bold text-slate-200 truncate">
                          {ev.player || "Unknown Player"}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-550 font-semibold">
                        <span>Minute: {ev.minute.toFixed(2)}'</span>
                        {hasCoordinates && (
                          <>
                            <span>•</span>
                            <span>Loc: ({ev.x.toFixed(0)}, {ev.y.toFixed(0)})</span>
                          </>
                        )}
                        {ev.end_x !== null && (
                          <div className="flex items-center gap-1 text-[9px] text-slate-500">
                            <ArrowRight size={10} />
                            <span>({ev.end_x.toFixed(0)}, {ev.end_y.toFixed(0)})</span>
                          </div>
                        )}
                        {ev.outcome && (
                          <>
                            <span>•</span>
                            <span className={ev.outcome === "Complete" || ev.outcome === "" ? "text-emerald-500" : "text-rose-500"}>
                              {ev.outcome}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      {Math.abs(ev.delta_xT) > 0.00001 ? (
                        <span className={`text-xs font-black font-mono ${
                          isPositive ? "text-emerald-400" : "text-rose-400"
                        }`}>
                          {isPositive ? "+" : ""}{ev.delta_xT.toFixed(4)} xT
                        </span>
                      ) : (
                        <span className="text-xs font-bold font-mono text-slate-600">—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
