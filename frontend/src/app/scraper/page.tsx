"use client";

import { useEffect, useState } from "react";
import { 
  Database, 
  Play, 
  RefreshCw, 
  Download, 
  Activity, 
  CheckCircle2, 
  AlertCircle,
  HelpCircle,
  Clock,
  Layers
} from "lucide-react";
import { API_URL } from "@/lib/api";

export default function ScraperPage() {
  const [league, setLeague] = useState<string>("la-liga");
  const [season, setSeason] = useState<string>("2018-2019");
  
  const [triggerMessage, setTriggerMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<any>(null);
  const [cachedList, setCachedList] = useState<any[]>([]);
  const [loadingCached, setLoadingCached] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch cached datasets
  async function fetchCached() {
    setLoadingCached(true);
    try {
      const res = await fetch(`${API_URL}/api/scrape/cached`);
      if (!res.ok) throw new Error("Failed to fetch cached datasets");
      const data = await res.json();
      setCachedList(data);
    } catch (err: any) {
      setError(err.message || "Failed to load cached datasets");
    } finally {
      setLoadingCached(false);
    }
  }

  // Fetch running task status
  async function checkStatus() {
    try {
      const res = await fetch(`${API_URL}/api/scrape/status`);
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    fetchCached();
    checkStatus();

    // Poll status every 3s
    const timer = setInterval(() => {
      checkStatus();
    }, 3000);

    return () => clearInterval(timer);
  }, []);

  const handleTriggerScrape = async () => {
    setTriggerMessage(null);
    setError(null);
    try {
      const res = await fetch(
        `${API_URL}/api/scrape/fbref?league=${league}&season=${season}`, 
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to trigger scrape");
      }
      setTriggerMessage("Scraping task successfully scheduled in the background!");
      checkStatus();
    } catch (err: any) {
      setError(err.message || "Failed to trigger scraper task");
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto w-full flex-1 flex flex-col gap-8">
      {/* Header Banner */}
      <div className="flex flex-col gap-2 p-8 rounded-2xl glass-panel relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/3"></div>
        <span className="w-fit px-3 py-1 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/25 text-xs font-bold tracking-wider uppercase">
          FBRef Web Scraper Controller
        </span>
        <h2 className="text-3xl font-extrabold tracking-tight text-white outfit-font">
          Tactical Scouting <span className="gradient-text">Data Pipeline</span>
        </h2>
        <p className="text-slate-400 text-sm max-w-2xl leading-relaxed">
          Extract standard, shooting, passing, defense, and playmaking tables from FBRef. Scraping runs in background threads to bypass load limits and parses data directly into standardized Per-90 caches.
        </p>
      </div>

      {/* Main Grid: Control panel vs running tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* Controls Card */}
        <div className="glass-panel p-5 rounded-2xl flex flex-col gap-5 lg:col-span-1">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
            <Activity size={15} className="text-sky-400" />
            <h4 className="text-xs uppercase font-extrabold tracking-wider text-slate-200">
              Pipeline Control Panel
            </h4>
          </div>

          {/* Select League */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Select League</label>
            <select
              value={league}
              onChange={(e) => setLeague(e.target.value)}
              className="w-full bg-[#090b0e] border border-slate-800 text-slate-200 text-sm font-semibold rounded-xl px-3.5 py-2.5 focus:outline-none"
            >
              <option value="la-liga">La Liga (Spain)</option>
              <option value="premier-league">Premier League (England)</option>
              <option value="serie-a">Serie A (Italy)</option>
              <option value="bundesliga">Bundesliga (Germany)</option>
              <option value="ligue-1">Ligue 1 (France)</option>
            </select>
          </div>

          {/* Select Season */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Select Season</label>
            <select
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              className="w-full bg-[#090b0e] border border-slate-800 text-slate-200 text-sm font-semibold rounded-xl px-3.5 py-2.5 focus:outline-none"
            >
              <option value="2018-2019">2018-2019</option>
              <option value="2023-2024">2023-2024</option>
              <option value="2024-2025">2024-2025</option>
              <option value="2025-2026">2025-2026</option>
            </select>
          </div>

          {/* Trigger Button */}
          <button
            onClick={handleTriggerScrape}
            disabled={status?.is_running}
            className={`w-full py-3 px-4 rounded-xl text-xs font-bold text-white transition-all flex items-center justify-center gap-2 ${
              status?.is_running
                ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
                : "bg-gradient-to-r from-sky-500 to-violet-500 hover:opacity-95 shadow-lg shadow-sky-500/10"
            }`}
          >
            {status?.is_running ? (
              <>
                <div className="w-3.5 h-3.5 border border-slate-400 border-t-white rounded-full animate-spin"></div>
                Scraping Background Thread...
              </>
            ) : (
              <>
                <Play size={13} fill="white" />
                Initialize Scrape Sequence
              </>
            )}
          </button>

          {/* Scrape Rate Limit Notice */}
          <div className="p-3.5 bg-amber-500/5 border border-amber-500/20 rounded-xl text-[10px] text-amber-300 leading-normal flex items-start gap-2.5">
            <Clock size={16} className="shrink-0 mt-0.5 text-amber-400" />
            <div>
              <p className="font-bold mb-0.5">Scraper Rate Limiting Enforced</p>
              To respect FBRef servers and prevent 403 blocks, the pipeline enforces a minimum 3-second sleep cycle between page loads. Complete extraction takes ~60 seconds.
            </div>
          </div>
        </div>

        {/* Status and Cached Table panels */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          
          {/* Messages */}
          {triggerMessage && (
            <div className="p-4 rounded-xl border border-emerald-500/35 bg-emerald-500/10 text-emerald-400 flex items-center gap-3">
              <CheckCircle2 size={18} />
              <span className="text-xs font-bold">{triggerMessage}</span>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl border border-rose-500/35 bg-rose-500/10 text-rose-400 flex items-center gap-3">
              <AlertCircle size={18} />
              <span className="text-xs font-bold">{error}</span>
            </div>
          )}

          {/* Active Scraping Task Status Dashboard */}
          {status && status.is_running && (
            <div className="glass-panel p-5 rounded-2xl border border-sky-500/30 bg-sky-500/[0.01] flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <Activity className="text-sky-400 animate-pulse" size={16} />
                  <h4 className="text-xs font-bold text-slate-200">Active Scraping Worker Progress</h4>
                </div>
                <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-400 text-[10px] font-extrabold tracking-wider uppercase">
                  Executing
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs font-semibold">
                <div>
                  <p className="text-slate-500 text-[10px] uppercase tracking-wider">Active target</p>
                  <p className="text-slate-300 capitalize">{status.league.replace("-", " ")} ({status.season})</p>
                </div>
                <div>
                  <p className="text-slate-500 text-[10px] uppercase tracking-wider">Current stat block</p>
                  <p className="text-slate-300 capitalize">{status.current_type}</p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
                  <span>Progress (Blocks Completed)</span>
                  <span>{status.completed_types.length} / 8 blocks</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden border border-slate-800/80">
                  <div 
                    className="h-full bg-gradient-to-r from-sky-400 to-violet-400 transition-all duration-500"
                    style={{ width: `${(status.completed_types.length / 8) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
          )}

          {/* Cached datasets list */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Layers size={16} className="text-slate-400" />
                <h3 className="text-xs uppercase font-extrabold tracking-wider text-slate-200">
                  Standard Cached Scout Datasets
                </h3>
              </div>
              <button 
                onClick={fetchCached}
                className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
                title="Refresh Cache List"
              >
                <RefreshCw size={13} />
              </button>
            </div>

            {loadingCached ? (
              <div className="glass-panel p-6 rounded-2xl text-center flex flex-col items-center justify-center min-h-[160px] text-slate-500">
                <div className="w-6 h-6 border-2 border-slate-700 border-t-white rounded-full animate-spin mb-2"></div>
                <span className="text-xs">Reading cache registers...</span>
              </div>
            ) : cachedList.length === 0 ? (
              <div className="glass-panel p-6 rounded-2xl text-center text-slate-500 min-h-[120px] flex items-center justify-center text-xs">
                No scouting stats cached yet. Scrape standard data using the selector above.
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {cachedList.map((c, idx) => (
                  <div 
                    key={idx}
                    className="glass-panel p-4 rounded-xl flex items-center justify-between gap-4 border border-slate-800/50 hover:bg-slate-900/10 transition-all"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white capitalize">
                          {c.league.replace("-", " ")}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[9px] font-bold">
                          {c.season}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                        Table: <span className="text-sky-400">{c.stat_type}</span> • {c.record_count} Records
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <a
                        href={`${API_URL}/api/scrape/export?league=${c.league}&season=${c.season}&stat_type=${c.stat_type}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-[10px] font-bold text-slate-300 hover:text-white border border-slate-800 transition-colors"
                      >
                        <Download size={11} />
                        Export CSV
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
