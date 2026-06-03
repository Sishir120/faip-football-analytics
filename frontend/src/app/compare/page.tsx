"use client";

import { useState } from "react";
import PitchViz from "@/components/PitchViz";
import { 
  Users, 
  Settings, 
  Play, 
  HelpCircle,
  Activity,
  Layers
} from "lucide-react";
import { API_URL } from "@/lib/api";

export default function ComparePage() {
  const [competition, setCompetition] = useState<string>("la-liga");
  const [season, setSeason] = useState<string>("2018-2019");
  
  const [xMetric, setXMetric] = useState<string>("xG");
  const [yMetric, setYMetric] = useState<string>("xAG");
  const [minMinutes, setMinMinutes] = useState<number>(900);
  const [highlights, setHighlights] = useState<string>("Lionel Messi, Luis Suárez");

  const [triggerCount, setTriggerCount] = useState<number>(0);

  const handleRunComparison = () => {
    setTriggerCount(prev => prev + 1);
  };

  const fetchUrl = `${API_URL}/api/player/compare?season=${season}&competition=${competition}&x_metric=${xMetric}&y_metric=${yMetric}&min_minutes=${minMinutes}&highlight=${encodeURIComponent(highlights)}&t=${triggerCount}`;

  // Standard metrics list
  const metrics = [
    { id: "xG", name: "Expected Goals (xG)" },
    { id: "xAG", name: "Expected Assisted Goals (xAG)" },
    { id: "Gls", name: "Goals scored" },
    { id: "Ast", name: "Assists recorded" },
    { id: "PrgP", name: "Progressive Passes" },
    { id: "PrgC", name: "Progressive Carries" },
    { id: "PrgR", name: "Progressive Receipts" },
    { id: "Tkl", name: "Tackles won" },
    { id: "Int", name: "Interceptions" },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto w-full flex-1 flex flex-col gap-8">
      {/* Header Banner */}
      <div className="flex flex-col gap-2 p-8 rounded-2xl glass-panel relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-violet-500/10 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/3"></div>
        <span className="w-fit px-3 py-1 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/25 text-xs font-bold tracking-wider uppercase">
          Player Comparison Scouting scatter
        </span>
        <h2 className="text-3xl font-extrabold tracking-tight text-white outfit-font">
          Positional Peer Group <span className="gradient-text">Scattering scatter</span>
        </h2>
        <p className="text-slate-400 text-sm max-w-2xl leading-relaxed">
          Compare whole divisions of players across any two statistical dimensions. Highlight specific targets to see how they stack up against peer percentiles.
        </p>
      </div>

      {/* Grid: Controls & Visualizer */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
        
        {/* Controls Card */}
        <div className="glass-panel p-5 rounded-2xl flex flex-col gap-5 lg:col-span-1">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
            <Settings size={15} className="text-violet-400" />
            <h4 className="text-xs uppercase font-extrabold tracking-wider text-slate-200">
              Scattering Options
            </h4>
          </div>

          {/* Select Competition/Season */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Scouting League</label>
              <select
                value={competition}
                onChange={(e) => setCompetition(e.target.value)}
                className="w-full bg-[#090b0e] border border-slate-800 text-slate-200 text-xs font-semibold rounded-xl px-3 py-2 focus:outline-none"
              >
                <option value="la-liga">La Liga (Spain)</option>
                <option value="premier-league">Premier League (England)</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Season Schedule</label>
              <select
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                className="w-full bg-[#090b0e] border border-slate-800 text-slate-200 text-xs font-semibold rounded-xl px-3 py-2 focus:outline-none"
              >
                <option value="2018-2019">2018-2019</option>
                <option value="2023-2024">2023-2024</option>
              </select>
            </div>
          </div>

          {/* Metric Selector X & Y */}
          <div className="flex flex-col gap-3 border-t border-slate-800/80 pt-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Horizontal Axis (X)</label>
              <select
                value={xMetric}
                onChange={(e) => setXMetric(e.target.value)}
                className="w-full bg-[#090b0e] border border-slate-800 text-slate-200 text-xs font-semibold rounded-xl px-3 py-2 focus:outline-none"
              >
                {metrics.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Vertical Axis (Y)</label>
              <select
                value={yMetric}
                onChange={(e) => setYMetric(e.target.value)}
                className="w-full bg-[#090b0e] border border-slate-800 text-slate-200 text-xs font-semibold rounded-xl px-3 py-2 focus:outline-none"
              >
                {metrics.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Min Minutes */}
          <div className="flex flex-col gap-1.5 border-t border-slate-800/80 pt-3">
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Minimum Min Played</label>
            <input
              type="number"
              value={minMinutes}
              onChange={(e) => setMinMinutes(Number(e.target.value))}
              className="w-full bg-[#090b0e] border border-slate-800 text-slate-200 text-xs font-semibold rounded-xl px-3 py-2 focus:outline-none"
            />
          </div>

          {/* Highlights */}
          <div className="flex flex-col gap-1.5 border-t border-slate-800/80 pt-3">
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Players to Highlight</label>
            <input
              type="text"
              value={highlights}
              onChange={(e) => setHighlights(e.target.value)}
              placeholder="Comma separated names"
              className="w-full bg-[#090b0e] border border-slate-800 text-slate-200 text-xs font-semibold rounded-xl px-3 py-2 focus:outline-none"
            />
          </div>

          {/* Run comparison button */}
          <button
            onClick={handleRunComparison}
            className="w-full py-3 px-4 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-violet-500 to-sky-500 hover:opacity-95 shadow-lg shadow-violet-500/10 transition-all flex items-center justify-center gap-2"
          >
            <Play size={13} fill="white" />
            Plot Scout Scatter
          </button>
        </div>

        {/* Visualizer Container */}
        <div className="lg:col-span-3">
          <PitchViz 
            title={`Scouting Comparison: ${xMetric} vs ${yMetric}`}
            fetchUrl={fetchUrl}
            aspectRatio="aspect-[10/7.5]"
          />
        </div>
      </div>
    </div>
  );
}
