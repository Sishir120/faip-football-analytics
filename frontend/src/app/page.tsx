"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  Trophy, 
  Calendar, 
  ChevronRight, 
  TrendingUp, 
  CheckCircle2, 
  AlertCircle,
  FileText,
  Activity,
  Layers,
  Database
} from "lucide-react";
import { API_URL } from "@/lib/api";

export default function DashboardPage() {
  const [competitions, setCompetitions] = useState<any[]>([]);
  const [selectedComp, setSelectedComp] = useState<any>({ competition_id: 11, season_id: 4 }); // Default La Liga 2018/19
  const [matches, setMatches] = useState<any[]>([]);
  const [loadingComps, setLoadingComps] = useState(true);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch competitions
  useEffect(() => {
    async function getCompetitions() {
      try {
        const res = await fetch(`${API_URL}/api/competitions`);
        if (!res.ok) throw new Error("Failed to load competitions");
        const data = await res.json();
        setCompetitions(data);
        
        // Find if La Liga 2018/19 exists in returned list to highlight it
        const lali = data.find((c: any) => c.competition_id === 11 && c.season_id === 4);
        if (lali) {
          setSelectedComp(lali);
        }
      } catch (err: any) {
        setError("Error connecting to backend database. Please ensure FastAPI server is running.");
      } finally {
        setLoadingComps(false);
      }
    }
    getCompetitions();
  }, []);

  // Fetch matches when competition changes
  useEffect(() => {
    if (!selectedComp || !selectedComp.competition_id) return;
    
    async function getMatches() {
      setLoadingMatches(true);
      try {
        const res = await fetch(
          `${API_URL}/api/matches?competition_id=${selectedComp.competition_id}&season_id=${selectedComp.season_id}`
        );
        if (!res.ok) throw new Error("Failed to load matches for this competition");
        const data = await res.json();
        setMatches(data);
      } catch (err: any) {
        console.error(err);
      } finally {
        setLoadingMatches(false);
      }
    }
    getMatches();
  }, [selectedComp]);

  const handleCompChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (!val) return;
    const [compId, seasonId] = val.split("-").map(Number);
    const found = competitions.find(c => c.competition_id === compId && c.season_id === seasonId);
    if (found) {
      setSelectedComp(found);
    }
  };

  // Cached matches stats indicator (La Liga 2018/19 matches are pre-cached)
  const cachedMatchIds = [15946, 15956, 15973];

  return (
    <div className="p-8 max-w-7xl mx-auto w-full flex-1 flex flex-col gap-8">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-8 rounded-2xl glass-panel relative overflow-hidden">
        {/* Background glow effects */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/3"></div>
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-violet-500/5 rounded-full blur-3xl pointer-events-none translate-y-1/2 -translate-x-1/3"></div>
        
        <div className="relative z-10 space-y-2">
          <span className="px-3 py-1 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/25 text-xs font-bold tracking-wider uppercase inline-block">
            Dashboard Hub
          </span>
          <h2 className="text-3xl font-extrabold tracking-tight text-white outfit-font">
            Football Analytics <span className="gradient-text">Intelligence Platform</span>
          </h2>
          <p className="text-slate-400 text-sm max-w-xl leading-relaxed">
            Harness event data to generate professional-grade expected goals charts, progressive passing maps, tactical touch heatmaps, and machine learning tactical scouting models.
          </p>
        </div>

        <div className="relative z-10 flex flex-col gap-2.5 min-w-[240px]">
          <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Select Competition & Season</label>
          <div className="relative">
            <select
              value={selectedComp ? `${selectedComp.competition_id}-${selectedComp.season_id}` : ""}
              onChange={handleCompChange}
              className="w-full bg-[#090b0e] border border-slate-800 text-slate-200 text-sm font-semibold rounded-xl px-4 py-3 appearance-none focus:outline-none focus:border-sky-500 transition-colors"
            >
              {loadingComps ? (
                <option>Loading competitions...</option>
              ) : (
                competitions.map((comp) => (
                  <option 
                    key={`${comp.competition_id}-${comp.season_id}`} 
                    value={`${comp.competition_id}-${comp.season_id}`}
                  >
                    {comp.competition_name} ({comp.season_name})
                  </option>
                ))
              )}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
              <ChevronRight size={16} className="rotate-90" />
            </div>
          </div>
          <span className="text-[10px] text-slate-500 italic">
            * Barcelona 2018/19 contains pre-seeded high-density event caches.
          </span>
        </div>
      </div>

      {/* Global Status Row */}
      {error && (
        <div className="p-4 rounded-xl border border-rose-500/35 bg-rose-500/10 text-rose-400 flex items-center gap-3">
          <AlertCircle size={20} />
          <span className="text-sm font-semibold">{error}</span>
        </div>
      )}

      {/* Stats Quick Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="glass-panel p-5 rounded-2xl flex items-center gap-4">
          <div className="p-3 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-xl">
            <Trophy size={20} />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-extrabold tracking-wider">Active Competition</p>
            <h4 className="text-sm font-bold text-white truncate max-w-[170px]">
              {selectedComp?.competition_name || "La Liga"}
            </h4>
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl flex items-center gap-4">
          <div className="p-3 bg-violet-500/10 text-violet-400 border border-violet-500/20 rounded-xl">
            <Calendar size={20} />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-extrabold tracking-wider">Season Schedule</p>
            <h4 className="text-sm font-bold text-white">
              {selectedComp?.season_name || "2018/19"}
            </h4>
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl flex items-center gap-4">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl">
            <Activity size={20} />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-extrabold tracking-wider">Total Schedule Matches</p>
            <h4 className="text-lg font-extrabold text-white">
              {matches.length} matches
            </h4>
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl flex items-center gap-4">
          <div className="p-3 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-xl">
            <Layers size={20} />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-extrabold tracking-wider">Rich Pre-Seeded Caches</p>
            <h4 className="text-lg font-extrabold text-white">3 Match Feeds</h4>
          </div>
        </div>
      </div>

      {/* Main Grid: Matches Table & Analysis Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Matches Feed */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-base font-bold text-white tracking-wide">Competition Schedule Fixtures</h3>
            <span className="text-xs text-slate-400 font-semibold">{matches.length} Matches Found</span>
          </div>

          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
            {loadingMatches ? (
              <div className="glass-panel rounded-2xl p-8 text-center flex flex-col items-center justify-center min-h-[300px]">
                <div className="w-8 h-8 border-2 border-sky-500/25 border-t-sky-400 rounded-full animate-spin mb-3"></div>
                <span className="text-xs font-semibold text-slate-400 tracking-wider uppercase">Loading Fixtures...</span>
              </div>
            ) : matches.length === 0 ? (
              <div className="glass-panel rounded-2xl p-8 text-center text-slate-500 min-h-[200px] flex items-center justify-center">
                No matches cached for this competition yet.
              </div>
            ) : (
              matches.map((match) => {
                const isPreseeded = cachedMatchIds.includes(match.match_id);
                return (
                  <div 
                    key={match.match_id}
                    className={`glass-panel p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border transition-all duration-300 ${
                      isPreseeded 
                        ? "border-sky-500/25 bg-sky-500/[0.02] shadow-[0_0_20px_rgba(14,165,233,0.02)]" 
                        : "border-slate-800/60"
                    }`}
                  >
                    {/* Date and Status Badge */}
                    <div className="flex flex-col gap-1 sm:min-w-[120px]">
                      <div className="flex items-center gap-2">
                        <Calendar size={13} className="text-slate-500" />
                        <span className="text-[11px] font-bold text-slate-400 tracking-wider">
                          {match.match_date}
                        </span>
                      </div>
                      {isPreseeded ? (
                        <span className="w-fit flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[9px] font-extrabold tracking-wider uppercase border border-emerald-500/20">
                          <CheckCircle2 size={9} /> Cached Events
                        </span>
                      ) : (
                        <span className="w-fit px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 text-[9px] font-bold tracking-wider uppercase">
                          API Stream Only
                        </span>
                      )}
                    </div>

                    {/* Team Names and Scores */}
                    <div className="flex-1 flex items-center justify-center gap-4">
                      <div className="text-right flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate leading-tight">
                          {match.home_team}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 text-sm font-extrabold text-white">
                        <span>{match.home_score}</span>
                        <span className="text-slate-600">:</span>
                        <span>{match.away_score}</span>
                      </div>

                      <div className="text-left flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate leading-tight">
                          {match.away_team}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-2 shrink-0">
                      <Link
                        href={`/match/${match.match_id}`}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                          isPreseeded
                            ? "bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 border border-sky-500/30"
                            : "bg-slate-800/80 text-slate-400 hover:text-white border border-slate-700/60"
                        }`}
                      >
                        Match Center
                        <ChevronRight size={13} />
                      </Link>

                      <Link
                        href={`/report/${match.match_id}`}
                        className="p-2 rounded-xl bg-slate-900 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 border border-slate-800 hover:border-emerald-500/20 transition-all"
                        title="Interactive Report"
                      >
                        <FileText size={15} />
                      </Link>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Sidebar Info Section */}
        <div className="flex flex-col gap-6">
          <div className="glass-panel p-6 rounded-2xl flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Database className="text-sky-400 animate-pulse" size={18} />
              <h3 className="text-sm font-extrabold text-slate-200 uppercase tracking-wider">
                Pre-seeded Analytics
              </h3>
            </div>
            
            <p className="text-slate-400 text-xs leading-relaxed">
              We have pre-cached full StatsBomb feeds for 3 key matches of Barcelona's 2018/19 La Liga season. Clicking "Match Center" on these will instantly generate visualizations (Shot Maps, Heatmaps, Pass Networks, etc.) using normalized 120×80 coordinate systems.
            </p>

            <div className="space-y-2 mt-2">
              <div className="p-3 bg-slate-900/40 border border-slate-800 rounded-xl text-xs flex flex-col gap-1">
                <span className="font-bold text-slate-300">Barcelona 3–0 Alavés</span>
                <span className="text-[10px] text-sky-400">Match ID: 15946 • 3,762 Events Cached</span>
              </div>
              <div className="p-3 bg-slate-900/40 border border-slate-800 rounded-xl text-xs flex flex-col gap-1">
                <span className="font-bold text-slate-300">Valladolid 0–1 Barcelona</span>
                <span className="text-[10px] text-sky-400">Match ID: 15956 • 3,342 Events Cached</span>
              </div>
              <div className="p-3 bg-slate-900/40 border border-slate-800 rounded-xl text-xs flex flex-col gap-1">
                <span className="font-bold text-slate-300">Barcelona 3–0 Huesca</span>
                <span className="text-[10px] text-sky-400">Match ID: 15973 • 3,440 Events Cached</span>
              </div>
            </div>
          </div>

          <div className="glass-panel p-6 rounded-2xl flex flex-col gap-4 bg-gradient-to-br from-violet-500/[0.03] to-slate-950/20 border-violet-500/10">
            <div className="flex items-center gap-3">
              <TrendingUp className="text-violet-400" size={18} />
              <h3 className="text-sm font-extrabold text-slate-200 uppercase tracking-wider">
                ML Scout Lab
              </h3>
            </div>
            
            <p className="text-slate-400 text-xs leading-relaxed">
              Platform includes algorithms to train custom xG Models (Logistic vs Random Forest) and segment player profiles via K-Means Clustering on FBRef scrape feeds. Go to the "ML Analytics Lab" using the sidebar to train models.
            </p>

            <Link
              href="/lab"
              className="mt-2 text-center py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-violet-500 to-sky-500 hover:from-violet-600 hover:to-sky-600 shadow-lg shadow-sky-500/5 transition-all"
            >
              Open ML Lab
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
