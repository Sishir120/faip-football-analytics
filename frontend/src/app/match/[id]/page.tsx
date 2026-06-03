"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import PitchViz from "@/components/PitchViz";
import XGTimelineChart from "@/components/XGTimelineChart";
import PossessionChainTab from "@/components/PossessionChainTab";
import { 
  ArrowLeft, 
  Activity, 
  Navigation, 
  Map, 
  TrendingUp, 
  GitCommit, 
  Tv, 
  Award,
  BookOpen,
  Workflow
} from "lucide-react";

export default function MatchAnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const matchId = Number(resolvedParams.id);

  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<string>("shot-map");
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [selectedPlayer, setSelectedPlayer] = useState<string>("");
  const [xtData, setXtData] = useState<any>(null);
  const [loadingXt, setLoadingXt] = useState<boolean>(false);

  useEffect(() => {
    async function fetchEvents() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`http://localhost:8000/api/events?match_id=${matchId}`);
        if (!res.ok) {
          throw new Error("Failed to load match events. Ensure database is seeded.");
        }
        const data = await res.json();
        setEvents(data);

        // Auto-select first team
        const uniqueTeams = Array.from(new Set(data.map((e: any) => e.team).filter(Boolean))) as string[];
        if (uniqueTeams.length > 0) {
          setSelectedTeam(uniqueTeams[0]);
          
          // Auto-select first player of that team
          const teamPlayers = Array.from(
            new Set(data.filter((e: any) => e.team === uniqueTeams[0]).map((e: any) => e.player).filter(Boolean))
          ) as string[];
          if (teamPlayers.length > 0) {
            setSelectedPlayer(teamPlayers[0]);
          }
        }
      } catch (err: any) {
        setError(err.message || "Failed to load events");
      } finally {
        setLoading(false);
      }
    }
    fetchEvents();
  }, [matchId]);

  useEffect(() => {
    if (activeTab === "xt-map" && !xtData) {
      async function fetchXt() {
        setLoadingXt(true);
        try {
          const res = await fetch(`http://localhost:8000/api/xt/match/${matchId}`);
          if (res.ok) {
            const data = await res.json();
            setXtData(data);
          }
        } catch (err) {
          console.error("Failed to load match xT data", err);
        } finally {
          setLoadingXt(false);
        }
      }
      fetchXt();
    }
  }, [activeTab, matchId, xtData]);

  // Handle team change and update player selection automatically
  const handleTeamChange = (team: string) => {
    setSelectedTeam(team);
    const teamPlayers = Array.from(
      new Set(events.filter((e: any) => e.team === team).map((e: any) => e.player).filter(Boolean))
    ) as string[];
    if (teamPlayers.length > 0) {
      setSelectedPlayer(teamPlayers[0]);
    } else {
      setSelectedPlayer("");
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12">
        <div className="w-12 h-12 border-2 border-sky-500/20 border-t-sky-400 rounded-full animate-spin mb-4"></div>
        <span className="text-xs font-bold uppercase tracking-widest text-sky-400 animate-pulse-slow">
          Extracting Event Streams...
        </span>
      </div>
    );
  }

  if (error || events.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 max-w-md mx-auto">
        <div className="p-4 bg-rose-500/10 border border-rose-500/25 rounded-2xl text-rose-500 mb-4 animate-bounce">
          <Activity size={32} />
        </div>
        <h3 className="text-lg font-extrabold text-white mb-2">Events Not Seeded</h3>
        <p className="text-slate-400 text-xs leading-relaxed mb-6">
          To run visual pitch overlays, the events feed must be seeded. You can trigger this using the "Scraper Control" module or running seed scripts on the backend.
        </p>
        <div className="flex gap-3">
          <Link
            href="/"
            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white hover:bg-slate-700/80 transition"
          >
            Back Dashboard
          </Link>
          <Link
            href="/scraper"
            className="px-4 py-2 bg-gradient-to-r from-sky-500 to-violet-500 rounded-xl text-xs font-bold text-white hover:opacity-95 transition"
          >
            Go to Scraper
          </Link>
        </div>
      </div>
    );
  }

  // Analytics extraction
  const teams = Array.from(new Set(events.map(e => e.team).filter(Boolean))) as string[];
  const allPlayers = Array.from(new Set(events.map(e => e.player).filter(Boolean))).sort() as string[];
  const teamPlayers = Array.from(
    new Set(events.filter(e => e.team === selectedTeam).map(e => e.player).filter(Boolean))
  ).sort() as string[];

  // Team Stats Box calculations
  const calculateTeamStats = (teamName: string) => {
    const teamEvents = events.filter(e => e.team === teamName);
    const shots = teamEvents.filter(e => e.type === "Shot");
    const goals = shots.filter(e => e.outcome === "Goal").length;
    const passes = teamEvents.filter(e => e.type === "Pass");
    const completedPasses = passes.filter(e => e.outcome === null || e.outcome === undefined).length;
    const passAcc = passes.length > 0 ? (completedPasses / passes.length) * 100 : 0;
    
    // Sum xG
    const totalXG = shots.reduce((acc, s) => acc + (s.xg || 0), 0);

    return { shots: shots.length, goals, passAcc, totalXG };
  };

  const homeStats = calculateTeamStats(teams[0]);
  const awayStats = teams[1] ? calculateTeamStats(teams[1]) : { shots: 0, goals: 0, passAcc: 0, totalXG: 0 };

  // Tab configurations
  const tabs = [
    { id: "shot-map", name: "Shot Map", icon: Award },
    { id: "pass-map", name: "Passing Map", icon: Navigation },
    { id: "heatmap", name: "Touch Heatmap", icon: Map },
    { id: "pass-network", name: "Passing Network", icon: GitCommit },
    { id: "xt-map", name: "Expected Threat (xT)", icon: Activity },
    { id: "possession-chains", name: "Possession Chains", icon: Workflow },
    { id: "xg-timeline", name: "xG Timeline", icon: TrendingUp },
  ];

  // Dynamic Fetch URL generation based on active tab
  let fetchUrl = "";
  if (activeTab === "shot-map") {
    fetchUrl = `http://localhost:8000/api/viz/shot-map?match_id=${matchId}&team=${encodeURIComponent(selectedTeam)}`;
  } else if (activeTab === "pass-map") {
    fetchUrl = `http://localhost:8000/api/viz/pass-map?match_id=${matchId}&player=${encodeURIComponent(selectedPlayer)}`;
  } else if (activeTab === "heatmap") {
    fetchUrl = `http://localhost:8000/api/viz/heatmap?match_id=${matchId}&player=${encodeURIComponent(selectedPlayer)}`;
  } else if (activeTab === "pass-network") {
    fetchUrl = `http://localhost:8000/api/viz/pass-network?match_id=${matchId}&team=${encodeURIComponent(selectedTeam)}`;
  } else if (activeTab === "xt-map") {
    fetchUrl = `http://localhost:8000/api/xt/heatmap?match_id=${matchId}&team=${encodeURIComponent(selectedTeam)}`;
  }

  return (
    <div className="p-8 max-w-7xl mx-auto w-full flex-1 flex flex-col gap-8">
      {/* Back to dashboard toolbar */}
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Matches Dashboard
        </Link>
        <Link
          href={`/report/${matchId}`}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/25 text-xs font-bold transition-all"
        >
          <BookOpen size={14} />
          Generate Composite Intelligence Report
        </Link>
      </div>

      {/* Dynamic Scorecard */}
      <div className="glass-panel p-6 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
        {/* Glow backdrop */}
        <div className="absolute inset-0 bg-gradient-to-r from-sky-500/[0.01] to-violet-500/[0.01] pointer-events-none"></div>

        {/* Home Team Card */}
        <div className="flex-1 text-center md:text-right space-y-1.5 w-full">
          <h3 className="text-xl font-extrabold text-white tracking-wide leading-tight">{teams[0]}</h3>
          <div className="flex flex-wrap gap-2 md:justify-end text-xs font-semibold text-slate-400">
            <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px]">
              Shots: {homeStats.shots}
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px]">
              xG: {homeStats.totalXG.toFixed(2)}
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px]">
              Pass: {homeStats.passAcc.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Center Score badge */}
        <div className="flex flex-col items-center shrink-0">
          <div className="px-6 py-2.5 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 shadow-2xl text-2xl font-black text-white tracking-widest">
            {homeStats.goals} <span className="text-slate-600 font-normal">:</span> {awayStats.goals}
          </div>
          <span className="text-[9px] uppercase font-extrabold text-slate-500 tracking-widest mt-2">
            Match Center
          </span>
        </div>

        {/* Away Team Card */}
        <div className="flex-1 text-center md:text-left space-y-1.5 w-full">
          <h3 className="text-xl font-extrabold text-white tracking-wide leading-tight">{teams[1] || "Away Team"}</h3>
          <div className="flex flex-wrap gap-2 md:justify-start text-xs font-semibold text-slate-400">
            <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px]">
              Shots: {awayStats.shots}
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px]">
              xG: {awayStats.totalXG.toFixed(2)}
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px]">
              Pass: {awayStats.passAcc.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Interactive Tabs Header */}
      <div className="border-b border-slate-800/80 flex flex-wrap gap-1.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 font-bold text-xs transition-all ${
                isSelected
                  ? "border-sky-400 text-sky-400 bg-sky-500/[0.02]"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/30"
              }`}
            >
              <Icon size={14} className={isSelected ? "text-sky-400 scale-110" : "text-slate-400"} />
              {tab.name}
            </button>
          );
        })}
      </div>

      {/* Main Content Area */}
      {activeTab === "possession-chains" ? (
        <PossessionChainTab matchId={matchId} />
      ) : (
        /* Main Grid: Controls + Visualizer Card */
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
          {/* Tab Controls Panel */}
          <div className="glass-panel p-5 rounded-2xl flex flex-col gap-5 lg:col-span-1">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <Tv size={15} className="text-sky-400" />
              <h4 className="text-xs uppercase font-extrabold tracking-wider text-slate-200">
                Visualization Filters
              </h4>
            </div>

            {/* TEAM FILTER (Show for Shot map, Pass Network, xT Heatmap) */}
            {(activeTab === "shot-map" || activeTab === "pass-network" || activeTab === "xt-map") && (
              <div className="flex flex-col gap-2">
                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Select Active Team</label>
                <div className="flex flex-col gap-1.5">
                  {teams.map((t) => (
                    <button
                      key={t}
                      onClick={() => handleTeamChange(t)}
                      className={`text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
                        selectedTeam === t
                          ? "bg-sky-500/10 text-sky-400 border-sky-500/35"
                          : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* PLAYER FILTER (Show for Pass map and Heatmap) */}
            {(activeTab === "pass-map" || activeTab === "heatmap") && (
              <div className="flex flex-col gap-3">
                {/* Select Team first to narrow down players */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Filter Team</label>
                  <select
                    value={selectedTeam}
                    onChange={(e) => handleTeamChange(e.target.value)}
                    className="w-full bg-[#090b0e] border border-slate-800 text-slate-200 text-xs font-semibold rounded-xl px-3 py-2.5 focus:outline-none"
                  >
                    {teams.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                {/* Select Player dropdown */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Select Player</label>
                  <select
                    value={selectedPlayer}
                    onChange={(e) => setSelectedPlayer(e.target.value)}
                    className="w-full bg-[#090b0e] border border-slate-800 text-slate-200 text-xs font-semibold rounded-xl px-3 py-2.5 focus:outline-none"
                  >
                    {teamPlayers.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Info Card explaining Coordinate Normalization */}
            <div className="p-3 bg-slate-900/40 border border-slate-800/80 rounded-xl text-[11px] text-slate-400 leading-relaxed space-y-1">
              <p className="font-semibold text-slate-200">StatsBomb Pitch Model</p>
              <p>
                Coordinates are automatically scaled to a standard 120×80 meter layout. Heatmaps filter Touches. Passing Networks analyze average positions before the first substitution.
              </p>
            </div>
          </div>

          {/* Pitch / Chart Visualizer Container */}
          <div className="lg:col-span-3 flex flex-col gap-6">
            {activeTab === "xg-timeline" ? (
              <XGTimelineChart matchId={matchId} />
            ) : (
              <PitchViz 
                title={`${tabs.find(t => t.id === activeTab)?.name}: ${
                  activeTab.includes("pass-map") || activeTab.includes("heatmap") 
                    ? selectedPlayer.split(" ").slice(-2).join(" ") 
                    : selectedTeam
                }`}
                fetchUrl={fetchUrl}
                aspectRatio="aspect-[10/7]"
              />
            )}

            {activeTab === "xt-map" && (
              loadingXt ? (
                <div className="glass-panel rounded-2xl p-8 text-center flex flex-col items-center justify-center min-h-[200px]">
                  <div className="w-8 h-8 border-2 border-sky-500/25 border-t-sky-400 rounded-full animate-spin mb-3"></div>
                  <span className="text-xs font-semibold text-slate-400 tracking-wider uppercase">Loading xT Leaderboards...</span>
                </div>
              ) : xtData && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Player rankings table */}
                  <div className="glass-panel p-6 rounded-2xl border border-slate-800/80">
                    <h4 className="text-xs uppercase font-extrabold text-white tracking-wider mb-4 flex items-center gap-2">
                      <Award size={14} className="text-sky-400" />
                      Player xT Leaderboard
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-500 font-bold uppercase tracking-wider">
                            <th className="py-2">Player</th>
                            <th className="py-2 text-right">Pass xT</th>
                            <th className="py-2 text-right">Carry xT</th>
                            <th className="py-2 text-right text-sky-400">Total xT</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50 text-slate-300">
                          {xtData.player_rankings.slice(0, 10).map((player: any, idx: number) => (
                            <tr key={player.player} className="hover:bg-slate-900/40 transition-colors">
                              <td className="py-2.5 font-semibold flex items-center gap-2">
                                <span className="text-[10px] text-slate-500 w-4">{idx + 1}</span>
                                <span className="truncate max-w-[140px]">{player.player}</span>
                              </td>
                              <td className="py-2.5 text-right font-mono">{player.pass_xt.toFixed(3)}</td>
                              <td className="py-2.5 text-right font-mono">{player.carry_xt.toFixed(3)}</td>
                              <td className="py-2.5 text-right font-bold text-sky-400 font-mono">{player.total_xt.toFixed(3)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Top Actions list */}
                  <div className="glass-panel p-6 rounded-2xl border border-slate-800/80">
                    <h4 className="text-xs uppercase font-extrabold text-white tracking-wider mb-4 flex items-center gap-2">
                      <Activity size={14} className="text-sky-400" />
                      Top Match Threat Plays
                    </h4>
                    <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                      {xtData.top_actions.slice(0, 7).map((action: any, idx: number) => (
                        <div key={idx} className="p-3 bg-slate-900/40 border border-slate-800 rounded-xl flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase border ${
                                action.type === "Pass" 
                                  ? "bg-sky-500/10 text-sky-400 border-sky-500/20" 
                                  : "bg-violet-500/10 text-violet-400 border-violet-500/20"
                              }`}>
                                {action.type}
                              </span>
                              <span className="text-xs font-bold text-white truncate max-w-[130px]">
                                {action.player.split(" ").slice(-2).join(" ")}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-500 block">
                              At {action.minute}'{action.second.toString().padStart(2, '0')} • ({action.x.toFixed(0)}, {action.y.toFixed(0)}) → ({action.end_x.toFixed(0)}, {action.end_y.toFixed(0)})
                            </span>
                          </div>
                          <span className="text-xs font-black text-emerald-400 font-mono shrink-0">
                            +{action.xt.toFixed(3)} xT
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
